import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import {
  generateBackupCode,
  generateTotpSecret,
  otpauthUri,
  verifyTotpCode
} from "@/lib/auth/totp";
import { BACKUP_CODES_COUNT, hashBackupCode, legacyBackupCodeHash } from "@/lib/auth/two-factor-credentials";
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  isEncryptedSensitiveValue,
  refreshEncryptedValue
} from "@/lib/security/secret-box";
import { enqueueEmail } from "@/lib/services/email";

function decryptTotpSecret(stored: string): string {
  try {
    return decryptSensitiveValue(stored);
  } catch {
    throw new DomainError("Configurazione 2FA non valida: riattivala dalla sezione Sicurezza.");
  }
}

export async function startAdminTotpEnrollment(adminId: string): Promise<{ secret: string; uri: string }> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { email: true, isActive: true, totpEnabledAt: true }
  });
  if (!admin?.isActive) throw new DomainError("Account amministratore non valido.");
  if (admin.totpEnabledAt) throw new DomainError("La verifica in due passaggi è già attiva.");

  const secret = generateTotpSecret();
  await prisma.adminUser.update({
    where: { id: adminId },
    data: { totpSecret: encryptSensitiveValue(secret), totpLastStep: null }
  });
  return { secret, uri: otpauthUri(admin.email, secret, "Sessa 1930 Gestionale") };
}

export async function confirmAdminTotpEnrollment(adminId: string, code: string): Promise<string[]> {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { email: true, name: true, totpSecret: true, totpEnabledAt: true }
  });
  if (!admin?.totpSecret) throw new DomainError("Nessuna attivazione in corso: rigenera il codice QR.");
  if (admin.totpEnabledAt) throw new DomainError("La verifica in due passaggi è già attiva.");

  const storedSecret = admin.totpSecret;
  const plainSecret = decryptTotpSecret(storedSecret);
  const step = verifyTotpCode(plainSecret, code);
  if (step === null) throw new DomainError("Codice non valido: controlla l'app e riprova.");
  const backupCodes = Array.from({ length: BACKUP_CODES_COUNT }, generateBackupCode);

  await prisma.$transaction(async (tx) => {
    const enabled = await tx.adminUser.updateMany({
      where: { id: adminId, totpEnabledAt: null, totpSecret: storedSecret },
      data: {
        totpEnabledAt: new Date(),
        totpLastStep: step,
        totpSecret: isEncryptedSensitiveValue(storedSecret)
          ? storedSecret
          : encryptSensitiveValue(plainSecret)
      }
    });
    if (enabled.count !== 1) throw new DomainError("La verifica in due passaggi è già stata configurata.");
    await tx.adminBackupCode.deleteMany({ where: { adminId } });
    await tx.adminBackupCode.createMany({
      data: backupCodes.map((backupCode) => ({ adminId, codeHash: hashBackupCode(backupCode) }))
    });
  });

  await enqueueEmail({
    toEmail: admin.email,
    subject: "Protezione 2FA attivata sul gestionale Sessa 1930",
    type: "SECURITY_2FA",
    body: `Ciao ${admin.name},\n\nla verifica in due passaggi è ora attiva sul tuo accesso al gestionale Sessa 1930. I prossimi login richiederanno un codice authenticator o un codice di recupero.\n\nSe non riconosci questa attività, contatta subito il proprietario del gestionale.`
  }).catch(() => undefined);
  return backupCodes;
}

export async function verifyAdminSecondFactor(adminId: string, code: string): Promise<boolean> {
  if (code.length > 32) return false;
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true }
  });
  if (!admin?.totpSecret || !admin.totpEnabledAt) return false;

  let secret: string;
  try {
    secret = decryptSensitiveValue(admin.totpSecret);
  } catch {
    return false;
  }
  const step = verifyTotpCode(secret, code);
  if (step !== null) {
    // Anti-replay monotono + upgrade opportunistico della busta cifrata
    // (legacy v1 → formato corrente) ad ogni verifica riuscita.
    const updated = await prisma.adminUser.updateMany({
      where: {
        id: adminId,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }]
      },
      data: {
        totpLastStep: step,
        totpSecret: isEncryptedSensitiveValue(admin.totpSecret)
          ? refreshEncryptedValue(admin.totpSecret)
          : encryptSensitiveValue(secret)
      }
    });
    return updated.count === 1;
  }

  // Codice di recupero monouso con claim atomico; i legacy hash (SHA-256
  // semplice, pre-hardening) vengono ri-hashati HMAC al primo utilizzo.
  const matched = await prisma.adminBackupCode.findFirst({
    where: {
      adminId,
      codeHash: { in: [hashBackupCode(code), legacyBackupCodeHash(code)] },
      usedAt: null
    },
    select: { id: true, codeHash: true }
  });
  if (!matched) return false;
  const consumed = await prisma.adminBackupCode.updateMany({
    where: { id: matched.id, usedAt: null },
    data: { usedAt: new Date() }
  });
  if (consumed.count !== 1) return false;
  if (matched.codeHash === legacyBackupCodeHash(code)) {
    await prisma.adminBackupCode
      .update({
        where: { id: matched.id },
        data: { codeHash: hashBackupCode(code) }
      })
      .catch(() => undefined);
  }
  return true;
}

export async function regenerateAdminBackupCodes(adminId: string, code: string): Promise<string[]> {
  if (!(await verifyAdminSecondFactor(adminId, code))) throw new DomainError("Codice non valido.");
  const backupCodes = Array.from({ length: BACKUP_CODES_COUNT }, generateBackupCode);
  await prisma.$transaction([
    prisma.adminBackupCode.deleteMany({ where: { adminId } }),
    prisma.adminBackupCode.createMany({
      data: backupCodes.map((backupCode) => ({ adminId, codeHash: hashBackupCode(backupCode) }))
    })
  ]);
  return backupCodes;
}

export async function disableAdminTotp(adminId: string, code: string): Promise<void> {
  if (!(await verifyAdminSecondFactor(adminId, code))) throw new DomainError("Codice non valido.");
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminId },
    select: { email: true, name: true }
  });
  await prisma.$transaction([
    prisma.adminBackupCode.deleteMany({ where: { adminId } }),
    prisma.adminUser.update({
      where: { id: adminId },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null }
    })
  ]);
  if (admin) {
    await enqueueEmail({
      toEmail: admin.email,
      subject: "Protezione 2FA disattivata sul gestionale Sessa 1930",
      type: "SECURITY_2FA",
      body: `Ciao ${admin.name},\n\nla verifica in due passaggi è stata disattivata sul tuo accesso al gestionale.\n\nSe non sei stato tu, cambia subito la password e avvisa il proprietario.`
    }).catch(() => undefined);
  }
}

export async function getAdminTwoFactorStatus(adminId: string) {
  const [admin, backupTotal, backupUsed] = await Promise.all([
    prisma.adminUser.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true } }),
    prisma.adminBackupCode.count({ where: { adminId } }),
    prisma.adminBackupCode.count({ where: { adminId, usedAt: { not: null } } })
  ]);
  return {
    enabled: Boolean(admin?.totpEnabledAt),
    enabledAt: admin?.totpEnabledAt ?? null,
    backupRemaining: backupTotal - backupUsed,
    backupTotal
  };
}
