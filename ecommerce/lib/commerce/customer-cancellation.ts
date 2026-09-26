/**
 * Annullamento self-service: solo prima della preparazione E con un anticipo
 * minimo sulla fascia di ritiro/consegna. Senza il vincolo temporale un
 * ordine pagato poteva essere annullato (e rimborsato in automatico) a
 * prodotto già preparato, se lo staff non aveva ancora cambiato lo stato.
 */
export const CUSTOMER_CANCELLABLE_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "PAID"] as const;
export const DEFAULT_CUSTOMER_CANCEL_HOURS = 24;

export type CancellationCheck = { allowed: true } | { allowed: false; reason: string };

export function customerCancellation(
  order: { status: string; fulfillmentAt: Date | null; paymentStatus: string; paymentProvider: string; paymentMethod: string | null },
  now: Date,
  windowHours = DEFAULT_CUSTOMER_CANCEL_HOURS
): CancellationCheck {
  if (!(CUSTOMER_CANCELLABLE_STATUSES as readonly string[]).includes(order.status)) {
    return { allowed: false, reason: "L'ordine è già in preparazione: contatta la sede per assistenza." };
  }
  if (order.fulfillmentAt && order.fulfillmentAt.getTime() - now.getTime() < windowHours * 60 * 60_000) {
    return {
      allowed: false,
      reason: `L'annullamento online è possibile fino a ${windowHours} ore prima del ritiro o della consegna: contatta la sede.`
    };
  }
  const paid = order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED";
  if (paid && order.paymentProvider !== "stripe" && order.paymentMethod !== "gift_card") {
    return { allowed: false, reason: "Per annullare un ordine già pagato con bonifico o in sede contatta la sede." };
  }
  return { allowed: true };
}
