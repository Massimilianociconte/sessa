export type RefundPlanInput = {
  totalCents: number;
  alreadyRefundedCents: number;
  giftCardCents: number;
  requestedCents: number;
};

export type RefundPlan =
  | { ok: true; amountCents: number; nextRefundedCents: number; fullyRefunded: boolean }
  | { ok: false; reason: string };

/** Tentativi da cui si puo leggere un PaymentIntent da rimborsare, incluso il late-capture. */
export const REFUNDABLE_PAYMENT_ATTEMPT_STATUSES = ["PAID", "REFUNDED", "REVIEW"] as const;

export type StripeCaptureClass = "duplicate" | "normal" | "late";

/** Classifica un webhook di incasso rispetto allo stato ordine/tentativo gia persistito. */
export function classifyStripeCapture(input: {
  orderStatus: string;
  attemptStatus: string;
  orderPaymentStatus: string;
}): StripeCaptureClass {
  if (input.attemptStatus === "PAID" && input.orderPaymentStatus === "PAID") return "duplicate";
  if (input.orderStatus === "PENDING_PAYMENT") return "normal";
  return "late";
}

/** Sceglie il tentativo da cui rimborsare: PAID se c'e, altrimenti REVIEW con PaymentIntent. */
export function pickRefundablePaymentAttempt<T extends { status: string; providerPaymentRef: string | null }>(
  attempts: T[]
): T | null {
  const allowed = new Set<string>(REFUNDABLE_PAYMENT_ATTEMPT_STATUSES);
  const eligible = attempts.filter((attempt) => allowed.has(attempt.status) && Boolean(attempt.providerPaymentRef));
  return (
    eligible.find((attempt) => attempt.status === "PAID") ??
    eligible.find((attempt) => attempt.status === "REVIEW") ??
    eligible[0] ??
    null
  );
}

/** Calcola un rimborso parziale o totale sul residuo ancora rimborsabile. */
export function planRefund(input: RefundPlanInput): RefundPlan {
  if (!Number.isInteger(input.requestedCents) || input.requestedCents < 0) {
    return { ok: false, reason: "Importo rimborso non valido." };
  }
  const giftCardCents = Math.max(0, input.giftCardCents);
  const cashCaptured = Math.max(0, input.totalCents - giftCardCents);
  const cashRefundable = Math.max(0, cashCaptured - input.alreadyRefundedCents);
  const remainingOrderCents = Math.max(0, input.totalCents - input.alreadyRefundedCents);

  if (cashRefundable <= 0 && giftCardCents === 0) {
    return { ok: false, reason: "Questo ordine e gia stato rimborsato per intero." };
  }

  // Un rimborso "dell'intero ordine" include il credito gift card, che si
  // ripristina a parte: il provider riceve solo il residuo incassato.
  const requested = input.requestedCents === remainingOrderCents ? cashRefundable : input.requestedCents;

  if (requested === 0 && cashRefundable === 0) {
    return {
      ok: true,
      amountCents: 0,
      nextRefundedCents: input.alreadyRefundedCents,
      fullyRefunded: true
    };
  }
  if (requested <= 0) {
    return { ok: false, reason: "Importo rimborso non valido." };
  }
  if (requested > cashRefundable) {
    return { ok: false, reason: "L'importo supera il residuo rimborsabile." };
  }
  const nextRefundedCents = input.alreadyRefundedCents + requested;
  return {
    ok: true,
    amountCents: requested,
    nextRefundedCents,
    fullyRefunded: nextRefundedCents >= cashCaptured
  };
}
