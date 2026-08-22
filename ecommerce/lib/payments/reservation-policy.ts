const MIN_STRIPE_MINUTES = 31;
const MAX_STRIPE_MINUTES = 24 * 60;

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export const STRIPE_MIN_AMOUNT_CENTS = 50;

export function stripePayableAmountCents(amountCents: number): boolean {
  return amountCents === 0 || amountCents >= STRIPE_MIN_AMOUNT_CENTS;
}

export function stockReservationExpiry(paymentMethod: string | null | undefined, now = new Date()): Date | null {
  if (paymentMethod === "card") {
    const minutes = boundedInteger(process.env.STOCK_RESERVATION_MINUTES, 35, MIN_STRIPE_MINUTES, MAX_STRIPE_MINUTES);
    return new Date(now.getTime() + minutes * 60_000);
  }
  if (paymentMethod === "cash_on_pickup") {
    return null;
  }
  const hours = boundedInteger(process.env.BANK_TRANSFER_RESERVATION_HOURS, 48, 1, 24 * 14);
  return new Date(now.getTime() + hours * 60 * 60_000);
}

/** Stripe accepts 30 minutes to 24 hours from Session creation. */
export function stripeSessionExpiry(requested: Date | null | undefined, now = new Date()): Date {
  const minimum = now.getTime() + 30 * 60_000 + 60_000;
  const maximum = now.getTime() + 24 * 60 * 60_000;
  const timestamp = requested?.getTime() ?? minimum;
  return new Date(Math.min(maximum, Math.max(minimum, timestamp)));
}
