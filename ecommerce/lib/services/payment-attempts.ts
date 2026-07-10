import { randomUUID } from "node:crypto";
import type { Order, PaymentAttempt } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError, type OrderStatus } from "@/lib/domain";
import { getPaymentProvider } from "@/lib/payments";
import { maybeConvertReferral } from "@/lib/services/referral";
import { transitionOrderInTx } from "@/lib/services/orders";
import { prismaErrorCode, serializableTransaction } from "@/lib/services/transaction";

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
  for (let raceRetry = 0; raceRetry < 3; raceRetry += 1) {
    try {
      return await serializableTransaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new DomainError("Ordine non trovato.");
        const amountCents = order.totalCents - order.giftCardCents;
        if (amountCents <= 0 || order.paymentStatus === "PAID") {
          return { order, attempt: null, ownsLease: false };
        }
        if (order.status !== "PENDING_PAYMENT") {
          throw new DomainError("Questo ordine non puo avviare un nuovo pagamento.");
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
  throw new DomainError("Pagamento gia in inizializzazione.");
}

/** Un solo lease CAS puo parlare al provider; tutti gli altri leggono il risultato persistito. */
export async function initializeOrderPayment(orderId: string): Promise<PaymentLaunch> {
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
      idempotencyKey: state.attempt.idempotencyKey
    });
  } catch (error) {
    await prisma.paymentAttempt.updateMany({
      where: { id: state.attempt.id, status: "INITIALIZING" },
      data: { status: "CREATED", error: "Provider temporaneamente non raggiungibile." }
    });
    return {
      attemptId: state.attempt.id,
      instructions: null,
      redirectUrl: null,
      error: error instanceof Error ? error.message : "Provider temporaneamente non raggiungibile."
    };
  }

  if (!init.ok) {
    if (init.retryable) {
      await prisma.paymentAttempt.updateMany({
        where: { id: state.attempt.id, status: "INITIALIZING" },
        data: { status: "CREATED", error: init.error }
      });
      return { attemptId: state.attempt.id, instructions: null, redirectUrl: null, error: init.error };
    }
    await prisma.$transaction(async (tx) => {
      const failed = await tx.paymentAttempt.updateMany({
        where: { id: state.attempt!.id, status: "INITIALIZING" },
        data: { status: "FAILED", error: init.error, completedAt: new Date() }
      });
      if (failed.count === 0) return;
      await transitionOrderInTx(tx, state.order.id, "CANCELLED", "system", {
        paymentStatus: "FAILED",
        note: `Inizializzazione pagamento fallita (${provider.label}): ${init.error}`
      });
    });
    return { attemptId: state.attempt.id, instructions: null, redirectUrl: null, error: init.error };
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
        where: { id: state.order.id, status: "PENDING_PAYMENT", paymentStatus: { not: "PAID" } },
        data: { paymentStatus: "PENDING", paymentRef: init.reference }
      });
      if (linked.count === 0) {
        await tx.paymentAttempt.update({
          where: { id: state.attempt!.id },
          data: { status: "REVIEW", error: "Ordine non piu pagabile durante il collegamento." }
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
      data: { status: "REVIEW", error: "Riferimento provider gia associato: riconciliazione richiesta." }
    });
  }

  const stored = await prisma.paymentAttempt.findUnique({ where: { id: state.attempt.id } });
  if (persisted && stored?.status === "PENDING" && stored.providerRef === init.reference) {
    return launchFromPersistedAttempt(stored)!;
  }
  // Un webhook puo aver chiuso l'attempt mentre la risposta del provider era in
  // volo. In quel caso non si tenta di scadere una sessione gia pagata.
  if (stored?.status !== "PAID" && stored?.status !== "REFUNDED" && provider.cancel) {
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
  providerRef: string;
  providerPaymentRef: string | null;
  amountCents: number | null;
  currency: string | null;
  metadataOrderId?: string;
  metadataAttemptId?: string;
};

export type StripeReconcileResult = "PAID" | "DUPLICATE" | "IGNORED" | "REVIEW";

/**
 * Associa un pagamento Stripe solo al PaymentAttempt che ha creato la sessione.
 * Il fallback sull'ID firmato nei metadata chiude la race webhook-before-attach:
 * la sessione puo risultare pagata prima che providerRef sia stato persistito.
 */
export async function reconcileStripeSuccess(input: StripeSuccessInput): Promise<StripeReconcileResult> {
  let convertedCustomerId: string | null = null;
  let convertedOrderId: string | null = null;
  const result = await prisma.$transaction(async (tx): Promise<StripeReconcileResult> => {
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
      await tx.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { not: "PAID" } },
        data: {
          status: "REVIEW",
          providerRef: attempt.providerRef ?? input.providerRef,
          providerPaymentRef: input.providerPaymentRef,
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
      return "REVIEW";
    }

    if (attempt.status === "PAID" && attempt.order.paymentStatus === "PAID") {
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
      convertedCustomerId = attempt.order.customerId;
      convertedOrderId = attempt.orderId;
      return "DUPLICATE";
    }
    if ((attempt.order.status as OrderStatus) !== "PENDING_PAYMENT") {
      await tx.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "REVIEW",
          providerPaymentRef: input.providerPaymentRef,
          error: `Pagamento acquisito per ordine in stato ${attempt.order.status}.`,
          completedAt: new Date()
        }
      });
      await tx.order.update({ where: { id: attempt.orderId }, data: { paymentStatus: "PAID" } });
      await tx.orderEvent.create({
        data: {
          orderId: attempt.orderId,
          type: "PAYMENT",
          message: `Pagamento Stripe acquisito ma ordine in stato ${attempt.order.status}: verifica manuale richiesta.`,
          actor: "stripe"
        }
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
    const transition = await transitionOrderInTx(tx, attempt.orderId, "PAID", "stripe", {
      paymentRef: input.providerRef,
      note: "Pagamento Stripe confermato"
    });
    convertedCustomerId = transition.customerId;
    convertedOrderId = transition.orderId;
    await tx.paymentAttempt.updateMany({
      where: { orderId: attempt.orderId, id: { not: attempt.id }, status: { in: ACTIVE_ATTEMPT_STATUSES } },
      data: { status: "FAILED", error: "Superato da un pagamento gia acquisito.", completedAt: new Date() }
    });
    await tx.orderEvent.create({
      data: {
        orderId: attempt.orderId,
        type: "PAYMENT",
        message: "Pagamento Stripe riconciliato con importo e valuta verificati.",
        actor: "stripe"
      }
    });
    return "PAID";
  });

  if ((result === "PAID" || result === "DUPLICATE") && convertedCustomerId && convertedOrderId) {
    await maybeConvertReferral(convertedCustomerId, convertedOrderId).catch((error) =>
      console.error("Conversione referral post-pagamento fallita:", error)
    );
  }
  return result;
}

/** Fallimento/expiry agisce solo sul tentativo esatto; un vecchio webhook non puo annullare un retry nuovo. */
export async function reconcileStripeFailure(
  providerRef: string,
  status: "FAILED" | "EXPIRED",
  reason: string
): Promise<"UPDATED" | "IGNORED"> {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.paymentAttempt.findUnique({
      where: { providerRef },
      include: { order: true }
    });
    if (!attempt || attempt.provider !== "stripe" || attempt.status === "PAID" || attempt.status === "REFUNDED") {
      return "IGNORED";
    }
    const updated = await tx.paymentAttempt.updateMany({
      where: { id: attempt.id, status: { in: ACTIVE_ATTEMPT_STATUSES } },
      data: { status, error: reason, completedAt: new Date() }
    });
    if (updated.count === 0) return "IGNORED";

    await tx.orderEvent.create({
      data: { orderId: attempt.orderId, type: "PAYMENT", message: reason, actor: "stripe" }
    });
    if (attempt.order.status !== "PENDING_PAYMENT" || attempt.order.paymentRef !== providerRef) return "UPDATED";

    const otherActive = await tx.paymentAttempt.count({
      where: { orderId: attempt.orderId, id: { not: attempt.id }, status: { in: ACTIVE_ATTEMPT_STATUSES } }
    });
    if (otherActive === 0) {
      await transitionOrderInTx(tx, attempt.orderId, "CANCELLED", "stripe", {
        paymentStatus: "FAILED",
        note: reason
      });
    } else {
      await tx.order.updateMany({
        where: { id: attempt.orderId, status: "PENDING_PAYMENT", paymentRef: providerRef },
        data: { paymentStatus: "FAILED" }
      });
    }
    return "UPDATED";
  });
}

/** Rimborso pieno: provider prima, commit locale idempotente dopo. */
export async function refundOrder(orderId: string, actorEmail: string, note?: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { paymentAttempts: { where: { status: "PAID" }, orderBy: { completedAt: "desc" }, take: 1 } }
  });
  if (!order) throw new DomainError("Ordine non trovato.");
  if (order.status === "REFUNDED" && order.paymentStatus === "REFUNDED") return;
  if (order.paymentStatus !== "PAID") throw new DomainError("L'ordine non risulta pagato.");

  const paidAttempt = order.paymentAttempts[0] ?? null;
  let refundReference: string | null = null;
  if (order.paymentProvider === "stripe") {
    if (!paidAttempt?.providerPaymentRef) {
      throw new DomainError("PaymentIntent Stripe assente: rimborso bloccato per riconciliazione manuale.");
    }
    const provider = getPaymentProvider("stripe");
    if (!provider.refund) throw new DomainError("Provider Stripe senza supporto rimborso.");
    const refunded = await provider.refund(
      paidAttempt.providerPaymentRef,
      paidAttempt.amountCents,
      `stripe-refund:${order.id}:full`
    );
    if (!refunded.ok) throw new DomainError(refunded.error ?? "Rimborso Stripe non riuscito.");
    refundReference = refunded.reference ?? null;
  }

  await prisma.$transaction(async (tx) => {
    await transitionOrderInTx(tx, order.id, "REFUNDED", actorEmail, {
      note: `${note ?? "Rimborso completo"}${refundReference ? ` (ref ${refundReference})` : ""}`
    });
    if (paidAttempt) {
      await tx.paymentAttempt.updateMany({
        where: { id: paidAttempt.id, status: "PAID" },
        data: { status: "REFUNDED", completedAt: new Date() }
      });
    }
  });
  await audit(actorEmail, "order.refund", "Order", order.id, {
    provider: order.paymentProvider,
    amountCents: paidAttempt?.amountCents ?? 0,
    refundReference
  });
}
