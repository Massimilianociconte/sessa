import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { hashPassword } from "@/lib/auth/password";
import { enqueueEmail, type EmailDeliveryResult } from "@/lib/services/email";
import { createResetToken } from "@/lib/services/customer-account";
import { allocateReferralCodeInTx } from "@/lib/services/referral";
import { serializableTransaction } from "@/lib/services/transaction";
import { SITE_URL } from "@/lib/site";

const REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type RegistrationStart = { delivery: EmailDeliveryResult | null; devLink: string | null };

/**
 * Registrazione email-first senza effetti su dati altrui: la richiesta vive
 * in RegistrationRequest finché il proprietario dell'email non apre il link.
 * Nessun Customer viene creato o modificato qui e l'email non contiene testo
 * scelto da chi compila il form (niente phishing con il marchio Sessa).
 */
export async function beginRegistration(input: {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
}): Promise<RegistrationStart> {
  const email = input.email.toLowerCase();
  const existing = await prisma.customer.findUnique({
    where: { email },
    select: { passwordHash: true, anonymizedAt: true }
  });

  if (existing?.passwordHash && !existing.anonymizedAt) {
    // Account già registrato: stessa risposta neutra all'utente, email al
    // proprietario con un link di recupero (nessuna enumerazione account).
    const token = await createResetToken(email);
    if (!token) return { delivery: null, devLink: null };
    const link = `${SITE_URL}/account/reset?token=${token}`;
    const delivery = await enqueueEmail({
      toEmail: email,
      subject: "Il tuo account Sessa 1930 esiste già",
      body: "Ciao,\n\nè stata richiesta una registrazione con questo indirizzo, che ha già un account Sessa 1930. Se hai dimenticato la password puoi sceglierne una nuova dal link (valido 1 ora).\n\nSe non sei stato tu, ignora questa email: il tuo account non è stato modificato.",
      cta: { url: link, label: "Scegli una nuova password" },
      type: "PASSWORD_RESET"
    });
    return { delivery, devLink: link };
  }

  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.registrationRequest.deleteMany({ where: { email, usedAt: null } }),
    prisma.registrationRequest.create({
      data: {
        tokenHash: hashToken(token),
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        expiresAt: new Date(Date.now() + REGISTRATION_TTL_MS)
      }
    })
  ]);
  const link = `${SITE_URL}/account/attiva?token=${token}`;
  const delivery = await enqueueEmail({
    toEmail: email,
    subject: "Completa la registrazione a Sessa 1930",
    body: "Ciao,\n\nper completare la registrazione scegli la password dal link qui sotto (valido 24 ore). Solo chi controlla questa casella email può attivare l'account e ritrovare gli ordini fatti con questo indirizzo.\n\nSe non hai richiesto tu la registrazione, ignora questa email: nessun account verrà creato.",
    cta: { url: link, label: "Scegli la password" },
    type: "REGISTRATION"
  });
  return { delivery, devLink: link };
}

/** Attivazione dal link: crea l'account o completa un profilo ospite storico. */
export async function completeRegistration(token: string, password: string): Promise<{ customerId: string; email: string }> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new DomainError("Link di attivazione non valido o scaduto.");
  const passwordHash = hashPassword(password);
  return serializableTransaction(async (tx) => {
    const request = await tx.registrationRequest.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!request || request.usedAt || request.expiresAt < new Date()) {
      throw new DomainError("Link di attivazione non valido o scaduto. Ripeti la registrazione.");
    }
    const claimed = await tx.registrationRequest.updateMany({
      where: { id: request.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (claimed.count !== 1) throw new DomainError("Link di attivazione già utilizzato.");

    const existing = await tx.customer.findUnique({ where: { email: request.email } });
    if (existing?.passwordHash && !existing.anonymizedAt) {
      throw new DomainError("Esiste già un account con questa email: accedi o usa «Password dimenticata?».");
    }
    if (existing && !existing.anonymizedAt) {
      // Profilo ospite (ordini precedenti): il possesso dell'email e provato dal link.
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          emailVerified: true,
          firstName: request.firstName,
          lastName: request.lastName,
          phone: request.phone ?? existing.phone
        }
      });
      await tx.customerSession.deleteMany({ where: { customerId: existing.id } });
      return { customerId: existing.id, email: existing.email };
    }
    const created = await tx.customer.create({
      data: {
        email: request.email,
        firstName: request.firstName,
        lastName: request.lastName,
        phone: request.phone,
        passwordHash,
        emailVerified: true,
        referralCode: await allocateReferralCodeInTx(tx, request.firstName)
      }
    });
    return { customerId: created.id, email: created.email };
  });
}

export async function pruneRegistrationRequests(): Promise<number> {
  const result = await prisma.registrationRequest.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }] }
  });
  return result.count;
}
