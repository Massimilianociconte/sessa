import { randomUUID } from "node:crypto";
import type { Order, PaymentAttempt, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/domain";
import {
  classifyStripeCapture,
  pickRefundablePaymentAttempt,
  planRefund,
  REFUNDABLE_PAYMENT_ATTEMPT_STATUSES
} from "@/lib/commerce/refund-math";
import { enqueueEmailInTx } from "@/lib/services/email";
import { getPaymentProvider } from "@/lib/payments";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";
import { transitionOrderInTx } from "@/lib/services/orders";
import { prismaErrorCode, serializableTransaction } from "@/lib/services/transaction";
import { refundMessage } from "@/lib/services/order-messages";
import { getCheckoutPolicy } from "@/lib/services/commerce-settings";
import { recordOperationalEvent } from "@/lib/observability";

const ACTIVE_ATTEMPT_STATUSES = ["CREATED", "INITIALIZING", "PENDING"];
const INITIALIZATION_LEASE_MS = 60_000;
const INITIALIZATION_WAIT_MS = 2_500;

export type PaymentLaunch = {
  attemptId: string | null;
  instructions: string | null;
  redirectUrl: string | null;
  error: string | null;
};

type InitializationState = { order: Order; attempt: PaymentAttempt | null; ownsLease: boolean };

/** Messaggi per il cliente: mai il testo tecnico del provider (resta nel tentativo). */
const USER_PAYMENT_ERROR = "Il pagamento online non è disponibile in questo momento. Riprova tra qualche minuto dalla pagina dell'ordine.";

function launchFromPersistedAttempt(attempt: PaymentAttempt): PaymentLaunch | null {
  if (attempt.status === "PENDING") {
    if (!attempt.providerRef || (!attempt.checkoutUrl && !attempt.instructions)) {
      return {
        attemptId: attempt.id,
        instructions: null,
        redirectUrl: null,
        error: "Tentativo provider incompleto: riconciliazione richiesta."
      };
    }
    return {
      attemptId: attempt.id,
      instructions: attempt.instructions,
      redirectUrl: attempt.checkoutUrl,
      error: null
    };
  }
  if (["FAILED", "EXPIRED", "REVIEW"].includes(attempt.status)) {
    return {
      attemptId: attempt.id,
      instructions: null,
      redirectUrl: null,
      error: attempt.error ?? "Pagamento non disponibile."
    };
  }
  if (attempt.status === "PAID" || attempt.status === "REFUNDED") {
    return { attemptId: attempt.id, instructions: null, redirectUrl: null, error: null };
  }
  return null;
}

async function waitForInitialization(attemptId: string): Promise<PaymentLaunch> {
  const deadline = Date.now() + INITIALIZATION_WAIT_MS;
  while (Date.now() < deadline) {
    const attempt = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) break;
    const launch = launchFromPersistedAttempt(attempt);
    if (launch) return launch;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    attemptId,
    instructions: null,
    redirectUrl: null,
    error: "Pagamento in inizializzazione. Attendi qualche secondo e riprova dalla pagina ordine."
  };
}

async function acquireInitializationLease(orderId: string): Promise<InitializationState> {
  const { maxCardAttempts: maxAttempts } = await getCheckoutPolicy();
  for (let raceRetry = 0; raceRetry < 3; raceRetry += 1) {
    try {
      return await serializableTransaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new DomainError("Ordine non trovato.");
        const amountCents = order.totalCents - order.giftCardCents;
        if (amountCents <= 0 || order.paymentStatus === "PAID") {
          return { order, attempt: null, ownsLease: false };
        }
        const isConfirmedManualPayment =
          order.status === "CONFIRMED" && order.paymentProvider === "manual" && order.paymentMethod === "cash_on_pickup";
        if (order.status !== "PENDING_PAYMENT" && !isConfirmedManualPayment) {
          throw new DomainError("Questo ordine non può avviare un nuovo pagamento.");
        }

        const now = new Date();
        let active = await tx.paymentAttempt.findFirst({
          where: { orderId, status: { in: ACTIVE_ATTEMPT_STATUSES } },
          orderBy: { createdAt: "desc" }
        });
        if (active?.status === "PENDING" && active.expiresAt && active.expiresAt <= now) {
          await tx.paymentAttempt.updateMany({
            where: { id: active.id, status: "PENDING" },
            data: { status: "EXPIRED", error: "Tentativo scaduto prima del riuso.", completedAt: now }
          });
          active = null;
        }

        if (!active) {
          // Ogni tentativo carta prolunga la prenotazione dello stock: tetto
          // ai tentativi per ordine contro il blocco artificiale dell'inventario.
          if (order.paymentProvider === "stripe") {
            const attempts = await tx.paymentAttempt.count({ where: { orderId } });
            if (attempts >= maxAttempts) {
              throw new DomainError(
                "Hai raggiunto il numero massimo di tentativi di pagamento per questo ordine. Contatta la sede indicando il codice ordine.",
                "PAYMENT_ATTEMPTS_EXHAUSTED"
              );
            }
          }
          const attempt = await tx.paymentAttempt.create({
            data: {
              orderId,
              provider: order.paymentProvider,
              method: order.paymentMethod,
              amountCents,
              currency: "EUR",
              status: "INITIALIZING",
              idempotencyKey: `${order.paymentProvider}:${order.id}:${randomUUID()}`
            }
          });
          return { order, attempt, ownsLease: true };
        }
        if (active.status === "PENDING") return { order, attempt: active, ownsLease: false };

        const leaseCutoff = new Date(now.getTime() - INITIALIZATION_LEASE_MS);
        if (active.status === "INITIALIZING" && active.updatedAt > leaseCutoff) {
          return { order, attempt: active, ownsLease: false };
        }
        const claimed = await tx.paymentAttempt.updateMany({
          where: {
            id: active.id,
            status: active.status,
            ...(active.status === "INITIALIZING" ? { updatedAt: { lte: leaseCutoff } } : {})
          },
          data: { status: "INITIALIZING", error: null, completedAt: null }
        });
        const attempt = await tx.paymentAttempt.findUnique({ where: { id: active.id } });
        if (!attempt) throw new DomainError("Tentativo pagamento non trovato.");
        return { order, attempt, ownsLease: claimed.count === 1 };
      });
    } catch (error) {
      if (prismaErrorCode(error) !== "P2002" || raceRetry === 2) throw error;
    }
  }
  throw new DomainError("Pagamento già in inizializzazione.");
}

/** Un solo lease CAS può parlare al provider; tutti gli altri leggono il risultato persistito. */
export async function initializeOrderPayment(orderId: string): Promise<PaymentLaunch> {
  const reusable = await prisma.paymentAttempt.findFirst({
    where: { orderId, provider: "stripe", status: { in: ACTIVE_ATTEMPT_STATUSES } },
    orderBy: { createdAt: "desc" }
  });
  if (reusable?.providerRef && isStripeConfigured()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(reusable.providerRef);
      if (session.payment_status === "paid") {
        const paymentIntent = typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null;
        await reconcileStripeSuccess({
          eventId: `retry:${session.id}:paid`,
          eventType: "maintenance.checkout_session.reconciled",
          providerRef: session.id,
          providerPaymentRef: paymentIntent,
          amountCents: session.amount_total,
          currency: session.currency,
          metadataOrderId: session.metadata?.orderId,
          metadataAttemptId: session.metadata?.paymentAttemptId
        });
        return { attemptId: reusable.id, instructions: null, redirectUrl: null, error: null };
      }
      if (session.status === "open") {
        const live = launchFromPersistedAttempt({
          ...reusable,
          checkoutUrl: session.url ?? reusable.checkoutUrl,
          status: reusable.status === "INITIALIZING" ? "PENDING" : reusable.status
        });
        if (live && !live.error) return live;
      }
    } catch {
      // Se Stripe non risponde si procede con il lease locale.
    }
  }
  const state = await acquireInitializationLease(orderId);
  if (!state.attempt) return { attemptId: null, instructions: null, redirectUrl: null, error: null };
  if (!state.ownsLease) {
    return launchFromPersistedAttempt(state.attempt) ?? waitForInitialization(state.attempt.id);
  }

  const provider = getPaymentProvider(state.attempt.provider);
  let init;
  try {
    init = await provider.init({
      attemptId: state.attempt.id,
      orderId: state.order.id,
      orderCode: state.order.code,
      publicToken: state.order.publicToken,
      totalCents: state.attempt.amountCents,
      email: state.order.email,
      method: state.order.paymentMethod,
      idempotencyKey: state.attempt.idempotencyKey,
      reservationExpiresAt: state.order.stockReservationExpiresAt
    });
  } catch {
    await prisma.paymentAttempt.updateMany({
      where: { id: state.attempt.id, status: "INITIALIZING" },
      data: { status: "CREATED", error: "Provider temporaneamente non raggiungibile." }
    });
    return { attemptId: state.attempt.id, instructions: null, redirectUrl: null, error: USER_PAYMENT_ERROR };
  }

  if (!init.ok) {
    if (init.retryable) {
      await prisma.paymentAttempt.updateMany({
        where: { id: state.attempt.id, status: "INITIALIZING" },
        data: { status: "CREATED", error: init.error.slice(0, 500) }
      });
      return { attemptId: state.attempt.id, instructions: null, redirectUrl: null, error: USER_PAYMENT_ERROR };
    }
    await prisma.$transaction(async (tx) => {
      const failed = await tx.paymentAttempt.updateMany({
        where: { id: state.attempt!.id, status: "INITIALIZING" },
        data: { status: "FAILED", error: init.error.slice(0, 500), completedAt: new Date() }
      });
      if (failed.count === 0) return;
      await transitionOrderInTx(tx, state.order.id, "CANCELLED", "system", {
        paymentStatus: "FAILED",
        cancelReason: "PAYMENT_FAILED",
        note: `Inizializzazione pagamento fallita (${provider.label}).`
      });
    });
    return {
      attemptId: state.attempt.id,
      instructions: null,
      redirectUrl: null,
      error: "Il pagamento non può essere avviato per questo ordine, che è stato annullato. Nessun importo è stato addebitato."
    };
  }

  let persisted = false;
  try {
    persisted = await prisma.$transaction(async (tx) => {
      const attached = await tx.paymentAttempt.updateMany({
        where: { id: state.attempt!.id, status: "INITIALIZING" },
        data: {
          status: "PENDING",
          providerRef: init.reference,
          checkoutUrl: init.redirectUrl ?? null,
          instructions: init.instructions ?? null,
          expiresAt: init.expiresAt ?? null,
          error: null
        }
      });
      if (attached.count === 0) return false;
      const linked = await tx.order.updateMany({
        where: {
          id: state.order.id,
          status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
          paymentStatus: { not: "PAID" }
        },
        data: {
          paymentStatus: "PENDING",
          paymentRef: init.reference,
          stockReservationExpiresAt: init.expiresAt ?? state.order.stockReservationExpiresAt
        }
      });
      if (linked.count === 0) {
        await tx.paymentAttempt.update({
          where: { id: state.attempt!.id },
          data: { status: "REVIEW", error: "Ordine non più pagabile durante il collegamento." }
        });
        return false;
      }
      await tx.orderEvent.create({
        data: {
          orderId: state.order.id,
          type: "PAYMENT",
          message: `Pagamento inizializzato (${provider.label}).`,
          actor: "system"
        }
      });
      return true;
    });
  } catch (error) {
    if (prismaErrorCode(error) !== "P2002") throw error;
    await prisma.paymentAttempt.updateMany({
      where: { id: state.attempt.id, status: "INITIALIZING" },
      data: { status: "REVIEW", error: "Riferimento provider già associato: riconciliazione richiesta." }
    });
  }

  const stored = await prisma.paymentAttempt.findUnique({ where: { id: state.attempt.id } });
  if (persisted && stored?.status === "PENDING" && stored.providerRef === init.reference) {
    return launchFromPersistedAttempt(stored)!;
  }
  // Un webhook può aver chiuso l'attempt mentre la risposta del provider era in
  // volo. In quel caso non si tenta di scadere una sessione già pagata.
  if (
    stored?.status !== "PAID" &&
    stored?.status !== "REFUNDED" &&
    stored?.providerRef !== init.reference &&
    provider.cancel
  ) {
    await provider.cancel(init.reference).catch(() => undefined);
  }
  return stored
    ? launchFromPersistedAttempt(stored) ?? {
        attemptId: stored.id,
        instructions: null,
        redirectUrl: null,
        error: "Pagamento non collegato: riprova dalla pagina ordine."
      }
    : { attemptId: state.attempt.id, instructions: null, redirectUrl: null, error: "Pagamento non collegato." };
}

export type StripeSuccessInput = {
  eventId: string;
  eventType: string;
  providerRef: string;
  providerPaymentRef: string | null;
  amountCents: number | null;
  currency: string | null;
  metadataOrderId?: string;
  metadataAttemptId?: string;
};

export type StripeReconcileResult = "PAID" | "DUPLICATE" | "IGNORED" | "REVIEW";

async function finishWebhookInTx(
  tx: Prisma.TransactionClient,
  webhookId: string,
  data: {
    status: "PROCESSED" | "IGNORED" | "REVIEW";
    orderId?: string;
    paymentAttemptId?: string;
    error?: string;
  }
): Promise<void> {
  await tx.paymentWebhookEvent.update({
    where: { id: webhookId },
    data: {
      status: data.status,
      orderId: data.orderId,
      paymentAttemptId: data.paymentAttemptId,
      error: data.error,
      processedAt: new Date()
    }
  });
}

async function isPersistedWebhook(eventId: string): Promise<boolean> {
  return Boolean(
    await prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider: "stripe", eventId } },
      select: { id: true }
    })
  );
}

/**
 * Associa un pagamento Stripe solo al PaymentAttempt che ha creato la sessione.
 * Il fallback sull'ID firmato nei metadata chiude la race webhook-before-attach:
 * la sessione può risultare pagata prima che providerRef sia stato persistito.
 */
export async function reconcileStripeSuccess(input: StripeSuccessInput): Promise<StripeReconcileResult> {
  let result: StripeReconcileResult;
  try {
    result = await prisma.$transaction(async (tx): Promise<StripeReconcileResult> => {
      const webhook = await tx.paymentWebhookEvent.create({
        data: {
          provider: "stripe",
          eventId: input.eventId,
          eventType: input.eventType,
          status: "RECEIVED"
        }
      });
      let attempt = await tx.paymentAttempt.findUnique({
        where: { providerRef: input.providerRef },
        include: { order: true }
      });
      if (!attempt && input.metadataAttemptId) {
        attempt = await tx.paymentAttempt.findUnique({
          where: { id: input.metadataAttemptId },
          include: { order: true }
        });
      }
      if (!attempt || attempt.provider !== "stripe") {
        // Compatibilita con sessioni create prima del metadata paymentAttemptId:
        // se l'ordine indica un attempt ancora in attach, un 5xx forza il retry
        // Stripe invece di confermare con 200 un pagamento non riconciliato.
        const attaching = input.metadataOrderId
          ? await tx.paymentAttempt.findFirst({
              where: {
                orderId: input.metadataOrderId,
                provider: "stripe",
                status: "INITIALIZING",
                providerRef: null
              },
              select: { id: true }
            })
          : null;
        if (attaching) throw new Error("STRIPE_ATTEMPT_ATTACH_IN_PROGRESS");
        await finishWebhookInTx(tx, webhook.id, {
          status: "IGNORED",
          error: "Nessun tentativo Stripe riconciliabile."
        });
        return "IGNORED";
      }

      const currency = input.currency?.toUpperCase() ?? null;
      const mismatch =
        input.amountCents !== attempt.amountCents ||
        currency !== attempt.currency ||
        (input.metadataOrderId !== undefined && input.metadataOrderId !== attempt.orderId) ||
        (input.metadataAttemptId !== undefined && input.metadataAttemptId !== attempt.id) ||
        (attempt.providerRef !== null && attempt.providerRef !== input.providerRef);
      if (mismatch) {
        // Un PaymentIntent già legato a un altro tentativo violerebbe l'unique
        // e farebbe fallire il webhook a ogni retry: si registra solo se libero.
        const paymentRefOwner = input.providerPaymentRef
          ? await tx.paymentAttempt.findUnique({
              where: { providerPaymentRef: input.providerPaymentRef },
              select: { id: true }
            })
          : null;
        await tx.paymentAttempt.updateMany({
          where: { id: attempt.id, status: { not: "PAID" } },
          data: {
            status: "REVIEW",
            providerRef: attempt.providerRef ?? input.providerRef,
            ...(paymentRefOwner && paymentRefOwner.id !== attempt.id ? {} : { providerPaymentRef: input.providerPaymentRef }),
            error: "Webhook Stripe con importo, valuta o ordine non coerente.",
            completedAt: new Date()
          }
        });
        await tx.orderEvent.create({
          data: {
            orderId: attempt.orderId,
            type: "PAYMENT",
            message: "Pagamento Stripe sospeso: importo, valuta o metadati non coerenti.",
            actor: "stripe"
          }
        });
        await finishWebhookInTx(tx, webhook.id, {
          status: "REVIEW",
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id,
          error: "Importo, valuta o metadata non coerenti."
        });
        return "REVIEW";
      }

      const captureClass = classifyStripeCapture({
        orderStatus: attempt.order.status,
        attemptStatus: attempt.status,
        orderPaymentStatus: attempt.order.paymentStatus
      });
      if (captureClass === "duplicate") {
        if (!attempt.providerPaymentRef && input.providerPaymentRef) {
          await tx.paymentAttempt.update({
            where: { id: attempt.id },
            data: {
              providerRef: attempt.providerRef ?? input.providerRef,
              providerPaymentRef: input.providerPaymentRef,
              completedAt: attempt.completedAt ?? new Date()
            }
          });
        }
        await finishWebhookInTx(tx, webhook.id, {
          status: "PROCESSED",
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id
        });
        return "DUPLICATE";
      }
      if (captureClass === "late") {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "REVIEW",
            providerRef: attempt.providerRef ?? input.providerRef,
            providerPaymentRef: input.providerPaymentRef,
            error: `Pagamento acquisito per ordine in stato ${attempt.order.status}.`,
            completedAt: new Date()
          }
        });
        await tx.order.update({
          where: { id: attempt.orderId },
          data: { paymentStatus: "PAID", paidAt: attempt.order.paidAt ?? new Date() }
        });
        await tx.orderEvent.create({
          data: {
            orderId: attempt.orderId,
            type: "PAYMENT",
            message: `Pagamento Stripe acquisito ma ordine in stato ${attempt.order.status}: verifica manuale richiesta.`,
            actor: "stripe"
          }
        });
        await finishWebhookInTx(tx, webhook.id, {
          status: "REVIEW",
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id,
          error: `Ordine in stato ${attempt.order.status}.`
        });
        return "REVIEW";
      }

      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "PAID",
          providerRef: input.providerRef,
          providerPaymentRef: input.providerPaymentRef,
          completedAt: new Date(),
          error: null
        }
      });
      await transitionOrderInTx(tx, attempt.orderId, "PAID", "stripe", {
        paymentRef: input.providerRef,
        note: "Pagamento Stripe confermato"
      });
      await tx.paymentAttempt.updateMany({
        where: { orderId: attempt.orderId, id: { not: attempt.id }, status: { in: ACTIVE_ATTEMPT_STATUSES } },
        data: { status: "FAILED", error: "Superato da un pagamento già acquisito.", completedAt: new Date() }
      });
      await tx.orderEvent.create({
        data: {
          orderId: attempt.orderId,
          type: "PAYMENT",
          message: "Pagamento Stripe riconciliato con importo e valuta verificati.",
          actor: "stripe"
        }
      });
      await finishWebhookInTx(tx, webhook.id, {
        status: "PROCESSED",
        orderId: attempt.orderId,
        paymentAttemptId: attempt.id
      });
      return "PAID";
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002" && (await isPersistedWebhook(input.eventId))) {
      return "DUPLICATE";
    }
    throw error;
  }
  return result;
}

/** Fallimento/expiry agisce solo sul tentativo esatto; un vecchio webhook non può annullare un retry nuovo. */
export async function reconcileStripeFailure(
  providerRef: string,
  status: "FAILED" | "EXPIRED",
  reason: string,
  webhookInput: { eventId: string; eventType: string }
): Promise<"UPDATED" | "IGNORED"> {
  try {
    return await prisma.$transaction(async (tx) => {
      const webhook = await tx.paymentWebhookEvent.create({
        data: {
          provider: "stripe",
          eventId: webhookInput.eventId,
          eventType: webhookInput.eventType,
          status: "RECEIVED"
        }
      });
      const attempt = await tx.paymentAttempt.findUnique({
        where: { providerRef },
        include: { order: true }
      });
      if (!attempt || attempt.provider !== "stripe" || attempt.status === "PAID" || attempt.status === "REFUNDED") {
        await finishWebhookInTx(tx, webhook.id, {
          status: "IGNORED",
          orderId: attempt?.orderId,
          paymentAttemptId: attempt?.id,
          error: "Tentativo assente o già concluso."
        });
        return "IGNORED";
      }
      const updated = await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: ACTIVE_ATTEMPT_STATUSES } },
        data: { status, error: reason, completedAt: new Date() }
      });
      if (updated.count === 0) {
        await finishWebhookInTx(tx, webhook.id, {
          status: "IGNORED",
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id,
          error: "Il tentativo non era più attivo."
        });
        return "IGNORED";
      }

      await tx.orderEvent.create({
        data: { orderId: attempt.orderId, type: "PAYMENT", message: reason, actor: "stripe" }
      });
      if (attempt.order.status === "PENDING_PAYMENT" && attempt.order.paymentRef === providerRef) {
        const otherActive = await tx.paymentAttempt.count({
          where: { orderId: attempt.orderId, id: { not: attempt.id }, status: { in: ACTIVE_ATTEMPT_STATUSES } }
        });
        if (otherActive === 0) {
          await transitionOrderInTx(tx, attempt.orderId, "CANCELLED", "stripe", {
            paymentStatus: "FAILED",
            cancelReason: status === "EXPIRED" ? "RESERVATION_EXPIRED" : "PAYMENT_FAILED",
            note: reason
          });
        } else {
          await tx.order.updateMany({
            where: { id: attempt.orderId, status: "PENDING_PAYMENT", paymentRef: providerRef },
            data: { paymentStatus: "FAILED" }
          });
        }
      }

      await finishWebhookInTx(tx, webhook.id, {
        status: "PROCESSED",
        orderId: attempt.orderId,
        paymentAttemptId: attempt.id
      });
      return "UPDATED";
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002" && (await isPersistedWebhook(webhookInput.eventId))) {
      return "IGNORED";
    }
    throw error;
  }
}

/** Registra l'incasso manuale sul solo tentativo selezionato, senza alterare
 * lo stato di evasione di un ordine già confermato o in preparazione. */
export async function recordManualPayment(
  orderId: string,
  actorEmail: string,
  paymentReference?: string
): Promise<void> {
  try {
    await serializableTransaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new DomainError("Ordine non trovato.");
      if (order.paymentProvider !== "manual") {
        throw new DomainError("Il pagamento di questo ordine viene confermato dal provider online.");
      }
      if (order.paymentStatus === "PAID") return;
      if (order.status === "CANCELLED" || order.status === "REFUNDED") {
        throw new DomainError("Non è possibile registrare un pagamento su un ordine chiuso.");
      }

      const now = new Date();
      const providerRef = order.paymentRef ?? `manual:${order.code}`;
      const receiptRef = paymentReference?.trim() || `manual-receipt:${order.code}`;
      const amountCents = order.totalCents - order.giftCardCents;
      if (amountCents <= 0) throw new DomainError("Questo ordine non ha un importo manuale da incassare.");
      let attempt = await tx.paymentAttempt.findFirst({
        where: { orderId, provider: "manual", status: { in: ACTIVE_ATTEMPT_STATUSES } },
        orderBy: { createdAt: "desc" }
      });
      if (attempt) {
        attempt = await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: {
            status: "PAID",
            providerRef: attempt.providerRef ?? providerRef,
            providerPaymentRef: receiptRef,
            error: null,
            completedAt: now
          }
        });
      } else {
        attempt = await tx.paymentAttempt.create({
          data: {
            orderId,
            provider: "manual",
            method: order.paymentMethod,
            amountCents,
            currency: "EUR",
            status: "PAID",
            idempotencyKey: `manual-paid:${order.id}`,
            providerRef,
            providerPaymentRef: receiptRef,
            completedAt: now
          }
        });
      }

      if (order.status === "PENDING_PAYMENT") {
        await transitionOrderInTx(tx, orderId, "PAID", actorEmail, {
          paymentRef: receiptRef,
          note: "Pagamento manuale verificato"
        });
      } else {
        const paid = await tx.order.updateMany({
          where: { id: orderId, paymentStatus: { not: "PAID" } },
          data: { paymentStatus: "PAID", paymentRef: receiptRef, paidAt: now }
        });
        if (paid.count === 0) return;
        await tx.orderEvent.create({
          data: {
            orderId,
            type: "PAYMENT",
            message: `Pagamento manuale registrato (rif. ${receiptRef}).`,
            actor: actorEmail
          }
        });
      }

      await tx.paymentAttempt.updateMany({
        where: { orderId, id: { not: attempt.id }, status: { in: ACTIVE_ATTEMPT_STATUSES } },
        data: { status: "FAILED", error: "Superato dall'incasso manuale registrato.", completedAt: now }
      });
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002") {
      throw new DomainError("Riferimento pagamento già associato a un altro incasso.");
    }
    throw error;
  }

  await audit(actorEmail, "order.payment.manual", "Order", orderId, {
    paymentReference: paymentReference?.trim() || null
  });
}

/**
 * Applica localmente un rimborso fino a `targetRefundedCents` (cumulativo, sul
 * solo importo incassato). Idempotente: se il rimborso e già registrato (da
 * webhook o da un'altra richiesta) non fa nulla. Deve girare nella stessa
 * transazione che registra l'evento provider o la richiesta admin.
 */
async function applyRefundInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  input: { targetRefundedCents: number; actor: string; note: string; refundReference: string | null; automatic: boolean }
): Promise<{ applied: boolean; amountCents: number; fully: boolean }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      location: true,
      paymentAttempts: { where: { status: { in: [...REFUNDABLE_PAYMENT_ATTEMPT_STATUSES] } }, orderBy: { completedAt: "desc" } }
    }
  });
  if (!order) throw new DomainError("Ordine non trovato.");
  const cashCaptured = Math.max(0, order.totalCents - order.giftCardCents);
  const target = Math.max(0, Math.min(input.targetRefundedCents, cashCaptured));
  const fully = target >= cashCaptured;
  const alreadyApplied = target <= order.refundedCents && (!fully || order.status === "REFUNDED");
  if (alreadyApplied) return { applied: false, amountCents: 0, fully: order.status === "REFUNDED" };
  const amountCents = Math.max(0, target - order.refundedCents);

  if (fully) {
    if (order.status !== "REFUNDED") {
      await transitionOrderInTx(tx, order.id, "REFUNDED", input.actor, {
        note: `${input.note}${input.refundReference ? ` (ref ${input.refundReference})` : ""}`,
        notifyCustomer: false
      });
    }
    const paidAttempt = pickRefundablePaymentAttempt(order.paymentAttempts);
    if (paidAttempt) {
      await tx.paymentAttempt.updateMany({
        where: { id: paidAttempt.id, status: { in: [...REFUNDABLE_PAYMENT_ATTEMPT_STATUSES] } },
        data: { status: "REFUNDED", completedAt: new Date() }
      });
    }
  } else {
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PARTIALLY_REFUNDED" } });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "PAYMENT",
        message: `Rimborso parziale di ${(amountCents / 100).toFixed(2)} EUR${input.refundReference ? ` (ref ${input.refundReference})` : ""}.`,
        actor: input.actor
      }
    });
  }
  await tx.order.update({ where: { id: order.id }, data: { refundedCents: Math.max(order.refundedCents, target) } });

  const message = refundMessage(
    { ...order, location: order.location ? { ...order.location } : null },
    {
      amountCents,
      fully,
      automatic: input.automatic,
      giftCardRestoredCents: fully ? order.giftCardCents : 0
    }
  );
  await enqueueEmailInTx(tx, {
    toEmail: order.email,
    subject: message.subject,
    body: message.body,
    cta: message.cta,
    type: "REFUND_CONFIRMATION",
    reference: order.code,
    dedupeKey: `REFUND_CONFIRMATION:${order.code}:${target}:${fully ? "full" : "partial"}`
  });
  return { applied: true, amountCents, fully };
}

export async function reconcileStripeExternalReversal(input: {
  eventId: string;
  eventType: string;
  providerPaymentRef: string | null;
  amountRefundedCents: number | null;
  amountCents: number | null;
}): Promise<"UPDATED" | "IGNORED" | "REVIEW"> {
  if (!input.providerPaymentRef) return "IGNORED";
  let result: "UPDATED" | "IGNORED" | "REVIEW";
  let disputeOrderId: string | null = null;
  try {
    // Evento webhook e aggiornamento dell'ordine nella STESSA transazione: se la
    // riconciliazione fallisce, anche l'evento torna indietro e Stripe ritenta.
    result = await prisma.$transaction(async (tx) => {
      const webhook = await tx.paymentWebhookEvent.create({
        data: {
          provider: "stripe",
          eventId: input.eventId,
          eventType: input.eventType,
          status: "RECEIVED"
        }
      });
      const attempt = await tx.paymentAttempt.findFirst({
        where: { providerPaymentRef: input.providerPaymentRef, provider: "stripe" },
        include: { order: true }
      });
      if (!attempt) {
        await finishWebhookInTx(tx, webhook.id, { status: "IGNORED", error: "PaymentIntent non associato." });
        return "IGNORED";
      }
      if (input.eventType === "charge.dispute.created") {
        await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { status: attempt.status === "PAID" ? "REVIEW" : attempt.status, error: "Dispute Stripe aperta." }
        });
        await tx.orderEvent.create({
          data: {
            orderId: attempt.orderId,
            type: "PAYMENT",
            message: "Dispute Stripe aperta: verifica manuale richiesta prima di evadere.",
            actor: "stripe"
          }
        });
        await finishWebhookInTx(tx, webhook.id, {
          status: "REVIEW",
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id,
          error: "Dispute aperta."
        });
        disputeOrderId = attempt.orderId;
        return "REVIEW";
      }
      const capturedPaid = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(attempt.order.paymentStatus);
      if (!capturedPaid || input.amountRefundedCents == null) {
        await finishWebhookInTx(tx, webhook.id, {
          status: "IGNORED",
          orderId: attempt.orderId,
          paymentAttemptId: attempt.id,
          error: "Ordine non pagato o importo rimborsato assente."
        });
        return "IGNORED";
      }
      // amount_refunded e cumulativo sul charge: rimborsi fatti da gestionale
      // (già registrati) diventano no-op, quelli fatti dalla dashboard Stripe
      // vengono registrati qui, parziali compresi.
      await applyRefundInTx(tx, attempt.orderId, {
        targetRefundedCents: input.amountRefundedCents,
        actor: "stripe",
        note: "Rimborso registrato da Stripe",
        refundReference: null,
        automatic: true
      });
      await finishWebhookInTx(tx, webhook.id, {
        status: "PROCESSED",
        orderId: attempt.orderId,
        paymentAttemptId: attempt.id
      });
      return "UPDATED";
    });
  } catch (error) {
    if (prismaErrorCode(error) === "P2002" && (await isPersistedWebhook(input.eventId))) {
      return "IGNORED";
    }
    throw error;
  }
  if (disputeOrderId) {
    await recordOperationalEvent({
      level: "CRITICAL",
      source: "stripe-webhook",
      code: "PAYMENT_DISPUTE_OPENED",
      message: "Contestazione (dispute) aperta su un pagamento: non evadere prima della verifica.",
      orderId: disputeOrderId,
      entityType: "Order",
      entityId: disputeOrderId
    });
  }
  return result;
}

/**
 * Rimborso (pieno o parziale): prima il provider con idempotency key legata
 * all'importo cumulativo, poi il commit locale idempotente. Se il webhook di
 * Stripe arriva prima del commit, lo registra lui e qui diventa un no-op.
 */
export async function refundOrder(
  orderId: string,
  actorEmail: string,
  note?: string,
  opts?: { alreadyRefundedOnProvider?: boolean; amountCents?: number }
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      paymentAttempts: {
        where: { status: { in: [...REFUNDABLE_PAYMENT_ATTEMPT_STATUSES] } },
        orderBy: { completedAt: "desc" }
      }
    }
  });
  if (!order) throw new DomainError("Ordine non trovato.");
  if (order.status === "REFUNDED" && order.paymentStatus === "REFUNDED") return;
  if (order.paymentStatus !== "PAID" && order.paymentStatus !== "PARTIALLY_REFUNDED") {
    throw new DomainError("L'ordine non risulta pagato.");
  }

  const plan = planRefund({
    totalCents: order.totalCents,
    alreadyRefundedCents: order.refundedCents,
    giftCardCents: order.giftCardCents,
    requestedCents: opts?.amountCents ?? order.totalCents - order.refundedCents
  });
  if (!plan.ok) throw new DomainError(plan.reason);

  const paidAttempt = pickRefundablePaymentAttempt(order.paymentAttempts);
  const automatic = order.paymentProvider === "stripe";
  let refundReference: string | null = null;
  if (automatic && !opts?.alreadyRefundedOnProvider && plan.amountCents > 0) {
    if (!paidAttempt?.providerPaymentRef) {
      throw new DomainError("PaymentIntent Stripe assente: rimborso bloccato per riconciliazione manuale.");
    }
    const provider = getPaymentProvider("stripe");
    if (!provider.refund) throw new DomainError("Provider Stripe senza supporto rimborso.");
    const refunded = await provider.refund(
      paidAttempt.providerPaymentRef,
      plan.amountCents,
      `stripe-refund:${order.id}:${plan.nextRefundedCents}`
    );
    if (!refunded.ok) {
      throw new DomainError("Stripe non ha accettato il rimborso. Riprova tra qualche minuto o verifica dalla dashboard Stripe.");
    }
    refundReference = refunded.reference ?? null;
  }

  const outcome = await prisma.$transaction((tx) =>
    applyRefundInTx(tx, order.id, {
      targetRefundedCents: plan.nextRefundedCents,
      actor: actorEmail,
      note: note ?? (plan.fullyRefunded ? "Rimborso completo" : "Rimborso parziale"),
      refundReference,
      automatic
    })
  );
  await audit(actorEmail, "order.refund", "Order", order.id, {
    provider: order.paymentProvider,
    amountCents: plan.amountCents,
    fullyRefunded: plan.fullyRefunded,
    refundReference,
    appliedLocally: outcome.applied
  });
}

/**
 * Ritorno da Stripe (success_url): verifica subito la sessione lato server, cosi
 * il cliente vede "pagato" senza dipendere dai tempi del webhook. La sessione
 * deve appartenere all'ordine (metadata firmati alla creazione).
 */
export async function reconcileStripeReturn(orderId: string, sessionId: string): Promise<void> {
  if (!isStripeConfigured() || !/^cs_[A-Za-z0-9_]{8,200}$/.test(sessionId)) return;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.metadata?.orderId !== orderId || session.payment_status !== "paid") return;
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    await reconcileStripeSuccess({
      eventId: `return:${session.id}:paid`,
      eventType: "return.checkout_session.paid",
      providerRef: session.id,
      providerPaymentRef: paymentIntent,
      amountCents: session.amount_total,
      currency: session.currency,
      metadataOrderId: session.metadata?.orderId,
      metadataAttemptId: session.metadata?.paymentAttemptId
    });
  } catch {
    // Il webhook resta la fonte autoritativa: qui e solo un'accelerazione.
  }
}
