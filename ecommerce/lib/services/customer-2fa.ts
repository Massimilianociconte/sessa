import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import {
  generateBackupCode,
  generateTotpSecret,
  otpauthUri,
  verifyTotpCode
} from "@/lib/auth/totp";
import { enqueueEmail } from "@/lib/services/email";

const BACKUP_CODES_COUNT = 10;

function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.toUpperCase().replace(/\s+/g, "")).digest("hex");
}

/**
 * Avvia l'attivazione 2FA: genera un secret PENDING (totpEnabledAt resta null
 * finché il cliente non conferma un codice valido). Riavviare rigenera il secret.
 */
export async function startTotpEnrollment(customerId: string): Promise<{ secret: string; uri: string }> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, totpEnabledAt: true, anonymizedAt: true }
  });
  if (!customer || customer.anonymizedAt) throw new DomainError("Account non valido.");
  if (customer.totpEnabledAt) throw new DomainError("La verifica in due passaggi è già attiva.");

  const secret = generateTotpSecret();
  await prisma.customer.update({ where: { id: customerId }, data: { totpSecret: secret, totpLastStep: null } });
  return { secret, uri: otpauthUri(customer.email, secret) };
}

/**
 * Conferma l'attivazione con un codice dall'app: abilita la 2FA e genera i
 * codici di recupero (ritornati in chiaro UNA sola volta; a DB restano gli hash).
 */
export async function confirmTotpEnrollment(customerId: string, code: string): Promise<string[]> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, firstName: true, totpSecret: true, totpEnabledAt: true }
  });
  if (!customer?.totpSecret) throw new DomainError("Nessuna attivazione in corso: rigenera il codice QR.");
  if (customer.totpEnabledAt) throw new DomainError("La verifica in due passaggi è già attiva.");

  const step = verifyTotpCode(customer.totpSecret, code);
  if (step === null) throw new DomainError("Codice non valido: controlla l'app e riprova.");

  const codes = Array.from({ length: BACKUP_CODES_COUNT }, generateBackupCode);
  await prisma.$transaction([
    prisma.customerBackupCode.deleteMany({ where: { customerId } }),
    prisma.customerBackupCode.createMany({
      data: codes.map((c) => ({ customerId, codeHash: hashBackupCode(c) }))
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: { totpEnabledAt: new Date(), totpLastStep: step }
    })
  ]);

  await enqueueEmail({
    toEmail: customer.email,
    subject: "Verifica in due passaggi attivata — Sessa 1930",
    type: "SECURITY_2FA",
    body: `Ciao ${customer.firstName},\n\nla verifica in due passaggi è ora ATTIVA sul tuo account. Da adesso il login richiede il codice dell'app authenticator.\n\nConserva i codici di recupero in un posto sicuro.\n\nSe non sei stato tu, reimposta subito la password.`
  });
  return codes;
}

/** Disattiva la 2FA (richiede un codice valido: TOTP o recupero). */
export async function disableTotp(customerId: string, code: string): Promise<void> {
  const ok = await verifySecondFactor(customerId, code);
  if (!ok) throw new DomainError("Codice non valido.");
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, firstName: true }
  });
  await prisma.$transaction([
    prisma.customerBackupCode.deleteMany({ where: { customerId } }),
    prisma.customer.update({
      where: { id: customerId },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null }
    })
  ]);
  if (customer) {
    await enqueueEmail({
      toEmail: customer.email,
      subject: "Verifica in due passaggi disattivata — Sessa 1930",
      type: "SECURITY_2FA",
      body: `Ciao ${customer.firstName},\n\nla verifica in due passaggi è stata DISATTIVATA sul tuo account.\n\nSe non sei stato tu, reimposta subito la password e riattivala dalla sezione Sicurezza.`
    });
  }
}

/** Rigenera i codici di recupero (invalida i precedenti). Richiede 2FA attiva + codice valido. */
export async function regenerateBackupCodes(customerId: string, code: string): Promise<string[]> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { totpEnabledAt: true }
  });
  if (!customer?.totpEnabledAt) throw new DomainError("La verifica in due passaggi non è attiva.");
  const ok = await verifySecondFactor(customerId, code);
  if (!ok) throw new DomainError("Codice non valido.");

  const codes = Array.from({ length: BACKUP_CODES_COUNT }, generateBackupCode);
  await prisma.$transaction([
    prisma.customerBackupCode.deleteMany({ where: { customerId } }),
    prisma.customerBackupCode.createMany({
      data: codes.map((c) => ({ customerId, codeHash: hashBackupCode(c) }))
    })
  ]);
  return codes;
}

/**
 * Verifica il secondo fattore al login: prima TOTP (con anti-replay sullo step),
 * poi codice di recupero (consumato atomicamente, monouso).
 */
export async function verifySecondFactor(customerId: string, code: string): Promise<boolean> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { totpSecret: true, totpLastStep: true }
  });
  if (!customer?.totpSecret) return false;

  const step = verifyTotpCode(customer.totpSecret, code);
  if (step !== null) {
    // Anti-replay: lo stesso step non può essere riusato (accetta solo step più avanti).
    const updated = await prisma.customer.updateMany({
      where: {
        id: customerId,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }]
      },
      data: { totpLastStep: step }
    });
    return updated.count === 1;
  }

  // Codice di recupero: consumo atomico (usedAt null → valorizzato).
  const consumed = await prisma.customerBackupCode.updateMany({
    where: { customerId, codeHash: hashBackupCode(code), usedAt: null },
    data: { usedAt: new Date() }
  });
  return consumed.count === 1;
}

/** Stato 2FA per la pagina Sicurezza. */
export async function getTwoFactorStatus(customerId: string) {
  const [customer, backupTotal, backupUsed] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { totpEnabledAt: true }
    }),
    prisma.customerBackupCode.count({ where: { customerId } }),
    prisma.customerBackupCode.count({ where: { customerId, usedAt: { not: null } } })
  ]);
  return {
    enabled: Boolean(customer?.totpEnabledAt),
    enabledAt: customer?.totpEnabledAt ?? null,
    backupRemaining: backupTotal - backupUsed,
    backupTotal
  };
}
