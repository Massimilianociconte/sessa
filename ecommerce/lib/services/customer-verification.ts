import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { enqueueEmail, type EmailDeliveryResult } from "@/lib/services/email";
import { SITE_URL } from "@/lib/site";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 ore
const CHANGE_TTL_MS = 60 * 60 * 1000; // 1 ora (azione sensibile)

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea un token monouso per il cliente, invalidando i precedenti dello stesso tipo. */
async function issueToken(
  customerId: string,
  type: "VERIFY_EMAIL" | "CHANGE_EMAIL",
  ttlMs: number,
  payload?: string
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.customerToken.deleteMany({ where: { customerId, type, usedAt: null } }),
    prisma.customerToken.create({
      data: {
        tokenHash: hashToken(token),
        customerId,
        type,
        payload,
        expiresAt: new Date(Date.now() + ttlMs)
      }
    })
  ]);
  return token;
}

export type VerificationEmailResult = {
  link: string;
  delivery: EmailDeliveryResult;
};

/** Invia (o reinvia) l'email di verifica indirizzo. Ritorna il link (utile in dev senza SMTP). */
export async function sendVerificationEmail(customerId: string): Promise<VerificationEmailResult | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, firstName: true, emailVerified: true, anonymizedAt: true }
  });
  if (!customer || customer.anonymizedAt) return null;
  if (customer.emailVerified) return null;

  const token = await issueToken(customerId, "VERIFY_EMAIL", VERIFY_TTL_MS);
  const link = `${SITE_URL}/account/verifica-email?token=${token}`;
  const delivery = await enqueueEmail({
    toEmail: customer.email,
    subject: "Conferma la tua email — Sessa 1930",
    type: "EMAIL_VERIFICATION",
    body: `Ciao ${customer.firstName},\n\nconferma il tuo indirizzo email aprendo questo link (valido 24 ore):\n${link}\n\nSe non hai creato tu l'account, ignora questa email.`
  });
  return { link, delivery };
}

/** Consuma il token di verifica: marca l'email come verificata. */
export async function consumeVerifyEmailToken(token: string): Promise<void> {
  const row = await prisma.customerToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== "VERIFY_EMAIL" || row.usedAt || row.expiresAt < new Date()) {
    throw new DomainError("Link di verifica non valido o scaduto.");
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.customerToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (claimed.count !== 1) throw new DomainError("Link di verifica non valido o già utilizzato.");
    await tx.customer.update({ where: { id: row.customerId }, data: { emailVerified: true } });
  });
}

/**
 * Richiede il cambio email: il token viene spedito al NUOVO indirizzo; la vecchia
 * email riceve un avviso. Il cambio avviene solo alla conferma del link.
 */
export async function requestEmailChange(customerId: string, newEmail: string): Promise<VerificationEmailResult> {
  const email = newEmail.toLowerCase();
  const [customer, clash] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { email: true, firstName: true, anonymizedAt: true }
    }),
    prisma.customer.findUnique({ where: { email } })
  ]);
  if (!customer || customer.anonymizedAt) throw new DomainError("Account non valido.");
  if (customer.email === email) throw new DomainError("La nuova email coincide con quella attuale.");
  if (clash) throw new DomainError("Questa email è già collegata a un altro account.");

  const token = await issueToken(customerId, "CHANGE_EMAIL", CHANGE_TTL_MS, email);
  const link = `${SITE_URL}/account/verifica-email?token=${token}`;
  const delivery = await enqueueEmail({
    toEmail: email,
    subject: "Conferma il cambio email — Sessa 1930",
    type: "EMAIL_CHANGE",
    body: `Ciao ${customer.firstName},\n\nper completare il cambio email del tuo account Sessa 1930 apri questo link (valido 1 ora):\n${link}\n\nSe non hai richiesto tu il cambio, ignora questa email.`
  });
  await enqueueEmail({
    toEmail: customer.email,
    subject: "Richiesta cambio email sul tuo account Sessa 1930",
    type: "EMAIL_CHANGE",
    body: `Ciao ${customer.firstName},\n\nè stata richiesta la modifica dell'email del tuo account verso ${email}. Se non sei stato tu, cambia subito la password dalla sezione Sicurezza.`
  });
  return { link, delivery };
}

/** Consuma il token di cambio email: sposta l'account sul nuovo indirizzo (già verificato dal click). */
export async function consumeChangeEmailToken(token: string): Promise<void> {
  const row = await prisma.customerToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== "CHANGE_EMAIL" || row.usedAt || row.expiresAt < new Date() || !row.payload) {
    throw new DomainError("Link di conferma non valido o scaduto.");
  }
  const email = row.payload.toLowerCase();
  await prisma.$transaction(async (tx) => {
    const clash = await tx.customer.findUnique({ where: { email } });
    if (clash && clash.id !== row.customerId) {
      throw new DomainError("Questa email è stata nel frattempo collegata a un altro account.");
    }
    const claimed = await tx.customerToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (claimed.count !== 1) throw new DomainError("Link di conferma non valido o già utilizzato.");
    await tx.customer.update({
      where: { id: row.customerId },
      data: { email, emailVerified: true }
    });
    // Il cambio dell'identificativo di accesso revoca tutte le sessioni rubate
    // o dimenticate; il cliente effettuerà un nuovo login con la nuova email.
    await tx.customerSession.deleteMany({ where: { customerId: row.customerId } });
    await tx.customerToken.deleteMany({
      where: { customerId: row.customerId, id: { not: row.id }, usedAt: null }
    });
  });
}

/** Router unico per i link email: capisce il tipo dal token e lo consuma. */
export async function consumeCustomerToken(token: string): Promise<"VERIFY_EMAIL" | "CHANGE_EMAIL"> {
  const row = await prisma.customerToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new DomainError("Link non valido o scaduto.");
  }
  if (row.type === "CHANGE_EMAIL") {
    await consumeChangeEmailToken(token);
    return "CHANGE_EMAIL";
  }
  await consumeVerifyEmailToken(token);
  return "VERIFY_EMAIL";
}
