import { prisma } from "@/lib/db";
import { pruneRegistrationRequests } from "@/lib/services/registration";
import { pruneCheckoutNonces } from "@/lib/services/checkout";
import { pruneEmailHistory } from "@/lib/services/email";
import { getPreviousAuthSecret } from "@/lib/auth/secret";
import { reencryptSensitiveData } from "@/lib/services/secret-rotation";

const DAY = 24 * 60 * 60_000;

/**
 * Periodi di conservazione (da riportare nell'informativa privacy):
 * - richieste di registrazione non confermate: 24 ore;
 * - profili senza account, senza ordini ne carrelli: 30 giorni;
 * - sessioni scadute: subito; email inviate: 30 giorni (corpo già redatto);
 * - eventi operativi risolti: 12 mesi; audit log gestionale: 24 mesi.
 * Ordini e registri di pagamento restano per gli obblighi contabili (10 anni,
 * art. 2220 c.c.) e si anonimizzano alla cancellazione dell'account.
 */
export async function runRetention(now = new Date()): Promise<Record<string, number>> {
  const [registrations, orphanCustomers, auditLogs, operationalEvents, nonces, emails] = await Promise.all([
    pruneRegistrationRequests(),
    prisma.customer
      .deleteMany({
        where: {
          passwordHash: null,
          anonymizedAt: null,
          createdAt: { lt: new Date(now.getTime() - 30 * DAY) },
          orders: { none: {} },
          carts: { none: {} },
          giftCards: { none: {} },
          reservedDiscounts: { none: {} }
        }
      })
      .then((result) => result.count),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 730 * DAY) } } }).then((result) => result.count),
    prisma.operationalEvent
      .deleteMany({ where: { resolvedAt: { lt: new Date(now.getTime() - 365 * DAY) } } })
      .then((result) => result.count),
    pruneCheckoutNonces(),
    pruneEmailHistory().then((result) => result.sent + result.dead)
  ]);
  // Delete dirette: i moduli di sessione sono server-only (cookie/headers) e
  // il job gira fuori da una richiesta.
  await Promise.all([
    prisma.customerSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.adminSession.deleteMany({ where: { expiresAt: { lt: now } } })
  ]);
  const reencrypted = getPreviousAuthSecret() ? await reencryptSensitiveData() : null;
  return {
    registrations,
    orphanCustomers,
    auditLogs,
    operationalEvents,
    nonces,
    emails,
    reencrypted: reencrypted ? reencrypted.admins + reencrypted.customers + reencrypted.emails : 0,
    reencryptRemaining: reencrypted?.remaining ?? 0
  };
}
