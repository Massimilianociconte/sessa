import { prisma } from "@/lib/db";
import { isCurrentEnvelope, isEncryptedSensitiveValue, refreshEncryptedValue } from "@/lib/security/secret-box";

export type ReencryptResult = { admins: number; customers: number; emails: number; failed: number; remaining: number };

/**
 * Dopo la rotazione di SESSION_SECRET: ricifra con il segreto corrente i
 * segreti TOTP e i corpi email ancora cifrati con il precedente, cosi
 * SESSION_SECRET_PREVIOUS può essere rimosso senza attendere che ogni utente
 * rientri. Idempotente e a lotti (chiamato dal job orario e dal pannello).
 */
export async function reencryptSensitiveData(batch = 200): Promise<ReencryptResult> {
  const result: ReencryptResult = { admins: 0, customers: 0, emails: 0, failed: 0, remaining: 0 };

  const admins = await prisma.adminUser.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } });
  for (const admin of admins) {
    if (!admin.totpSecret || isCurrentEnvelope(admin.totpSecret)) continue;
    try {
      await prisma.adminUser.updateMany({
        where: { id: admin.id, totpSecret: admin.totpSecret },
        data: { totpSecret: refreshEncryptedValue(admin.totpSecret) }
      });
      result.admins += 1;
    } catch {
      result.failed += 1;
    }
  }

  // Tutti i clienti con 2FA, a pagine: nessuno resta legato al vecchio segreto.
  let cursor: string | undefined;
  for (;;) {
    const customers = await prisma.customer.findMany({
      where: { totpSecret: { not: null } },
      select: { id: true, totpSecret: true },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });
    if (customers.length === 0) break;
    for (const customer of customers) {
      if (!customer.totpSecret || isCurrentEnvelope(customer.totpSecret)) continue;
      try {
        await prisma.customer.updateMany({
          where: { id: customer.id, totpSecret: customer.totpSecret },
          data: { totpSecret: refreshEncryptedValue(customer.totpSecret) }
        });
        result.customers += 1;
      } catch {
        result.failed += 1;
      }
    }
    cursor = customers[customers.length - 1].id;
    if (customers.length < batch) break;
  }

  const emails = await prisma.emailMessage.findMany({
    where: { status: { in: ["QUEUED", "FAILED", "PROCESSING"] } },
    select: { id: true, body: true },
    take: batch
  });
  for (const email of emails) {
    if (!isEncryptedSensitiveValue(email.body) || isCurrentEnvelope(email.body)) continue;
    try {
      await prisma.emailMessage.updateMany({ where: { id: email.id, body: email.body }, data: { body: refreshEncryptedValue(email.body) } });
      result.emails += 1;
    } catch {
      result.failed += 1;
    }
  }

  result.remaining = await countStaleEncryptedValues();
  return result;
}

/** Valori cifrati non ancora con il segreto corrente (0 = rotazione completata). */
export async function countStaleEncryptedValues(): Promise<number> {
  const [adminRows, customerRows, emailRows] = await Promise.all([
    prisma.adminUser.findMany({ where: { totpSecret: { not: null } }, select: { totpSecret: true } }),
    prisma.customer.findMany({ where: { totpSecret: { not: null } }, select: { totpSecret: true } }),
    prisma.emailMessage.findMany({ where: { status: { in: ["QUEUED", "FAILED", "PROCESSING"] } }, select: { body: true } })
  ]);
  return [
    ...adminRows.map((row) => row.totpSecret),
    ...customerRows.map((row) => row.totpSecret),
    ...emailRows.map((row) => (isEncryptedSensitiveValue(row.body) ? row.body : null))
  ].filter((value): value is string => Boolean(value) && !isCurrentEnvelope(value as string)).length;
}
