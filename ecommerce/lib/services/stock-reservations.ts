import { prisma } from "@/lib/db";
import { isStripeConfigured, getStripe } from "@/lib/payments/stripe";
import { initializeOrderPayment, reconcileStripeSuccess } from "@/lib/services/payment-attempts";
import { transitionOrderInTx } from "@/lib/services/orders";
import { serializableTransaction } from "@/lib/services/transaction";
import { recordOperationalError, recordOperationalEvent } from "@/lib/observability";
import { shouldSendBankTransferReminder } from "@/lib/commerce/checkout-policy";
import { enqueueEmail } from "@/lib/services/email";
import { getSetting } from "@/lib/services/settings";
import { paymentReminderMessage } from "@/lib/services/order-messages";

const ACTIVE_ATTEMPT_STATUSES = ["CREATED", "INITIALIZING", "PENDING"];

export type ReservationWorkerResult = {
  scanned: number;
  released: number;
  recoveredPaid: number;
  deferred: number;
  errors: number;
  reminders: number;
};

async function cancelExpiredOrder(orderId: string, actor: string): Promise<boolean> {
  return serializableTransaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    const now = new Date();
    if (
      !order ||
      order.status !== "PENDING_PAYMENT" ||
      order.paymentStatus === "PAID" ||
      order.stockReleasedAt ||
      !order.stockReservationExpiresAt ||
      order.stockReservationExpiresAt > now
    ) {
      return false;
    }

    await tx.paymentAttempt.updateMany({
      where: { orderId, status: { in: ACTIVE_ATTEMPT_STATUSES } },
      data: {
        status: "EXPIRED",
        error: "Prenotazione stock scaduta senza pagamento acquisito.",
        completedAt: now
      }
    });
    await transitionOrderInTx(tx, orderId, "CANCELLED", actor, {
      paymentStatus: "FAILED",
      cancelReason: "RESERVATION_EXPIRED",
      note: "Prenotazione stock scaduta automaticamente"
    });
    return true;
  });
}

async function deferForReview(orderId: string, minutes = 15): Promise<void> {
  await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT", paymentStatus: { not: "PAID" } },
    data: { stockReservationExpiresAt: new Date(Date.now() + minutes * 60_000) }
  });
}

async function recoverStripeReference(orderId: string): Promise<void> {
  const recoverable = await prisma.paymentAttempt.findFirst({
    where: { orderId, provider: "stripe", status: { in: ["CREATED", "INITIALIZING"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  if (recoverable) await initializeOrderPayment(orderId);
}

async function processStripeOrder(orderId: string): Promise<"RELEASED" | "PAID" | "DEFERRED"> {
  if (!isStripeConfigured()) {
    await deferForReview(orderId, 30);
    await recordOperationalEvent({
      level: "CRITICAL",
      source: "stock-reservation",
      code: "STRIPE_UNAVAILABLE_AT_EXPIRY",
      message: "Prenotazione scaduta non rilasciata: Stripe non configurato per verificare il pagamento.",
      orderId,
      entityType: "Order",
      entityId: orderId
    });
    return "DEFERRED";
  }

  await recoverStripeReference(orderId);
  const refreshedOrder = await prisma.order.findUnique({
    where: { id: orderId },
    select: { stockReservationExpiresAt: true, paymentStatus: true, status: true }
  });
  if (
    !refreshedOrder ||
    refreshedOrder.paymentStatus === "PAID" ||
    refreshedOrder.status !== "PENDING_PAYMENT" ||
    (refreshedOrder.stockReservationExpiresAt && refreshedOrder.stockReservationExpiresAt > new Date())
  ) {
    return "DEFERRED";
  }
  const attempt = await prisma.paymentAttempt.findFirst({
    where: { orderId, provider: "stripe", status: { in: [...ACTIVE_ATTEMPT_STATUSES, "REVIEW"] } },
    orderBy: { createdAt: "desc" }
  });
  if (!attempt) {
    return (await cancelExpiredOrder(orderId, "stock-reservation-worker")) ? "RELEASED" : "DEFERRED";
  }
  if (!attempt.providerRef) {
    await deferForReview(orderId);
    await recordOperationalEvent({
      level: "CRITICAL",
      source: "stock-reservation",
      code: "STRIPE_REFERENCE_MISSING",
      message: "Tentativo Stripe senza riferimento provider: rilascio stock sospeso per sicurezza.",
      orderId,
      entityType: "PaymentAttempt",
      entityId: attempt.id
    });
    return "DEFERRED";
  }

  const session = await getStripe().checkout.sessions.retrieve(attempt.providerRef);
  if (session.payment_status === "paid") {
    const paymentIntent = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
    await reconcileStripeSuccess({
      eventId: `maintenance:${session.id}:paid`,
      eventType: "maintenance.checkout_session.reconciled",
      providerRef: session.id,
      providerPaymentRef: paymentIntent,
      amountCents: session.amount_total,
      currency: session.currency,
      metadataOrderId: session.metadata?.orderId,
      metadataAttemptId: session.metadata?.paymentAttemptId
    });
    return "PAID";
  }

  if (session.status === "open") {
    await getStripe().checkout.sessions.expire(session.id);
  } else if (session.status !== "expired") {
    // Sessione completata ma non pagata (metodo asincrono): NON si annulla,
    // altrimenti l'incasso arriverebbe su un ordine già annullato e stock
    // già rivenduto. Resta in verifica con allarme finché Stripe non decide.
    await deferForReview(orderId, 60);
    await prisma.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { in: ACTIVE_ATTEMPT_STATUSES } },
      data: { status: "REVIEW", error: `Sessione Stripe ${session.status} non pagata alla scadenza.` }
    });
    await recordOperationalEvent({
      level: "CRITICAL",
      source: "stock-reservation",
      code: "STRIPE_SESSION_AMBIGUOUS",
      message: "Sessione Stripe non pagata in stato ambiguo: rilascio stock sospeso.",
      orderId,
      entityType: "PaymentAttempt",
      entityId: attempt.id,
      metadata: { sessionStatus: session.status ?? "unknown", paymentStatus: session.payment_status }
    });
    return "DEFERRED";
  }

  return (await cancelExpiredOrder(orderId, "stock-reservation-worker")) ? "RELEASED" : "DEFERRED";
}

/** Promemoria bonifico 24 ore prima della scadenza della prenotazione. */
async function sendBankTransferReminders(now = new Date()): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      paymentMethod: "bank_transfer",
      paymentReminderSentAt: null,
      stockReservationExpiresAt: { gt: now, lte: new Date(now.getTime() + 24 * 60 * 60_000) }
    },
    include: { items: true, location: true },
    take: 25
  });
  if (candidates.length === 0) return 0;
  const instructions = await getSetting(
    "payments.bankTransferInstructions",
    "Trovi le coordinate per il bonifico nella pagina dell'ordine."
  );
  let sent = 0;
  for (const order of candidates) {
    if (
      !order.stockReservationExpiresAt ||
      !shouldSendBankTransferReminder({
        now,
        placedAt: order.placedAt,
        expiresAt: order.stockReservationExpiresAt,
        alreadySent: false
      })
    ) {
      continue;
    }
    const claimed = await prisma.order.updateMany({
      where: { id: order.id, paymentReminderSentAt: null },
      data: { paymentReminderSentAt: now }
    });
    if (claimed.count === 0) continue;
    const message = paymentReminderMessage(order, order.stockReservationExpiresAt, instructions);
    await enqueueEmail({
      toEmail: order.email,
      subject: message.subject,
      body: message.body,
      cta: message.cta,
      type: "PAYMENT_REMINDER",
      reference: order.code
    }).catch(() => undefined);
    sent += 1;
  }
  return sent;
}

export async function expireStockReservations(limit = 25): Promise<ReservationWorkerResult> {
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      paymentStatus: { not: "PAID" },
      stockReleasedAt: null,
      stockReservationExpiresAt: { lte: new Date() }
    },
    orderBy: { stockReservationExpiresAt: "asc" },
    take: Math.max(1, Math.min(limit, 25)),
    select: { id: true, code: true, paymentProvider: true, paymentMethod: true, locationId: true }
  });
  const result: ReservationWorkerResult = {
    scanned: candidates.length,
    released: 0,
    recoveredPaid: 0,
    deferred: 0,
    errors: 0,
    reminders: 0
  };
  result.reminders = await sendBankTransferReminders().catch(() => 0);

  for (const order of candidates) {
    try {
      const outcome = order.paymentProvider === "stripe"
        ? await processStripeOrder(order.id)
        : (await cancelExpiredOrder(order.id, "stock-reservation-worker"))
          ? "RELEASED"
          : "DEFERRED";
      if (outcome === "RELEASED") result.released += 1;
      else if (outcome === "PAID") result.recoveredPaid += 1;
      else result.deferred += 1;
    } catch (error) {
      result.errors += 1;
      await deferForReview(order.id).catch(() => undefined);
      await recordOperationalError({
        level: "CRITICAL",
        source: "stock-reservation",
        code: "RESERVATION_EXPIRY_FAILED",
        message: "Errore durante la riconciliazione di una prenotazione stock scaduta.",
        orderId: order.id,
        locationId: order.locationId,
        entityType: "Order",
        entityId: order.id,
        error,
        metadata: { paymentProvider: order.paymentProvider, paymentMethod: order.paymentMethod ?? "unknown" }
      });
    }
  }

  return result;
}
