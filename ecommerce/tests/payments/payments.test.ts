import assert from "node:assert/strict";
import test from "node:test";
import { CHECKOUT_PAYMENT_METHODS, PAYMENT_METHODS } from "@/lib/domain";
import { providerForMethod } from "@/lib/payments";
import {
  stockReservationExpiry,
  stripePayableAmountCents,
  stripeSessionExpiry,
  STRIPE_MIN_AMOUNT_CENTS
} from "@/lib/payments/reservation-policy";
import {
  classifyStripeCapture,
  pickRefundablePaymentAttempt,
  planRefund,
  REFUNDABLE_PAYMENT_ATTEMPT_STATUSES
} from "@/lib/commerce/refund-math";
import { checkoutSchema } from "@/lib/validation";
import { checkGiftCard, giftCardApplicable } from "@/lib/services/giftcards";
import { checkoutPickupInput, makeGiftCard } from "../support/fixtures";

test("la carta passa da Stripe, gli altri metodi restano manuali", () => {
  assert.equal(providerForMethod("card"), "stripe");
  assert.equal(providerForMethod("bank_transfer"), "manual");
  assert.equal(providerForMethod("cash_on_pickup"), "manual");
  assert.equal(providerForMethod("gift_card"), "manual");
  assert.equal(providerForMethod(undefined), "manual");
});

test("le prenotazioni stock rispettano carta, ritiro e fallback bonifico", () => {
  const now = new Date("2026-07-11T10:00:00.000Z");
  const prevCard = process.env.STOCK_RESERVATION_MINUTES;
  const prevBank = process.env.BANK_TRANSFER_RESERVATION_HOURS;
  process.env.STOCK_RESERVATION_MINUTES = "35";
  process.env.BANK_TRANSFER_RESERVATION_HOURS = "48";
  try {
    assert.equal(stockReservationExpiry("card", now)?.toISOString(), "2026-07-11T10:35:00.000Z");
    assert.equal(stockReservationExpiry("cash_on_pickup", now), null);
    assert.equal(stockReservationExpiry("bank_transfer", now)?.toISOString(), "2026-07-13T10:00:00.000Z");
    assert.equal(stockReservationExpiry("gift_card", now)?.toISOString(), "2026-07-13T10:00:00.000Z");
    assert.equal(stockReservationExpiry("unknown-future-method", now)?.toISOString(), "2026-07-13T10:00:00.000Z");
  } finally {
    if (prevCard === undefined) delete process.env.STOCK_RESERVATION_MINUTES;
    else process.env.STOCK_RESERVATION_MINUTES = prevCard;
    if (prevBank === undefined) delete process.env.BANK_TRANSFER_RESERVATION_HOURS;
    else process.env.BANK_TRANSFER_RESERVATION_HOURS = prevBank;
  }
});

test("Stripe accetta zero (gia coperto) o almeno 50 centesimi", () => {
  assert.equal(STRIPE_MIN_AMOUNT_CENTS, 50);
  assert.equal(stripePayableAmountCents(0), true);
  assert.equal(stripePayableAmountCents(49), false);
  assert.equal(stripePayableAmountCents(50), true);
  assert.equal(stripePayableAmountCents(1990), true);
});

test("la sessione Stripe non scade prima di 31 minuti ne oltre 24 ore", () => {
  const now = new Date("2026-07-11T10:00:00.000Z");
  assert.equal(stripeSessionExpiry(new Date(now.getTime() + 5_000), now).toISOString(), "2026-07-11T10:31:00.000Z");
  assert.equal(
    stripeSessionExpiry(new Date(now.getTime() + 30 * 60 * 60_000), now).toISOString(),
    "2026-07-12T10:00:00.000Z"
  );
});

test("il rimborso manda a Stripe solo il cash, mai il credito gift card", () => {
  const mixed = planRefund({ totalCents: 8000, alreadyRefundedCents: 0, giftCardCents: 3000, requestedCents: 8000 });
  assert.equal(mixed.ok, true);
  if (mixed.ok) {
    assert.equal(mixed.amountCents, 5000);
    assert.equal(mixed.fullyRefunded, true);
  }
  const overflow = planRefund({
    totalCents: 8000,
    alreadyRefundedCents: 0,
    giftCardCents: 3000,
    requestedCents: 5500
  });
  assert.equal(overflow.ok, false);
  const giftOnly = planRefund({
    totalCents: 2000,
    alreadyRefundedCents: 0,
    giftCardCents: 2000,
    requestedCents: 2000
  });
  assert.equal(giftOnly.ok, true);
  if (giftOnly.ok) assert.equal(giftOnly.amountCents, 0);
});

test("un incasso in ritardo su ordine non PENDING resta REVIEW ma rimborsabile", () => {
  assert.equal(
    classifyStripeCapture({
      orderStatus: "CANCELLED",
      attemptStatus: "PENDING",
      orderPaymentStatus: "PENDING"
    }),
    "late"
  );
  assert.equal(
    classifyStripeCapture({
      orderStatus: "PENDING_PAYMENT",
      attemptStatus: "PENDING",
      orderPaymentStatus: "PENDING"
    }),
    "normal"
  );
  assert.ok(REFUNDABLE_PAYMENT_ATTEMPT_STATUSES.includes("REVIEW"));
  const attempt = pickRefundablePaymentAttempt([
    { status: "FAILED", providerPaymentRef: "pi_old" },
    { status: "REVIEW", providerPaymentRef: "pi_late" }
  ]);
  assert.equal(attempt?.providerPaymentRef, "pi_late");
});

test("il cliente non puo scegliere gift_card come radio: e un credito", () => {
  assert.deepEqual([...CHECKOUT_PAYMENT_METHODS].sort(), ["bank_transfer", "card", "cash_on_pickup"].sort());
  assert.ok((PAYMENT_METHODS as readonly string[]).includes("gift_card"));
  assert.equal(CHECKOUT_PAYMENT_METHODS.includes("gift_card" as (typeof CHECKOUT_PAYMENT_METHODS)[number]), false);
  const parsed = checkoutSchema.safeParse({ ...checkoutPickupInput(), paymentMethod: "gift_card" });
  assert.equal(parsed.success, false);
  assert.equal(checkoutSchema.safeParse(checkoutPickupInput({ paymentMethod: "bank_transfer" })).success, true);
});

test("la gift card valida detrae fino al saldo e rifiuta card altrui o scadute", () => {
  const live = makeGiftCard({ balanceCents: 1200 });
  assert.equal(giftCardApplicable(live, 4000), 1200);
  assert.equal(giftCardApplicable(live, 800), 800);
  assert.equal(checkGiftCard(live, null).ok, true);
  assert.equal(checkGiftCard(makeGiftCard({ isActive: false }), null).ok, false);
  assert.equal(checkGiftCard(makeGiftCard({ balanceCents: 0 }), null).ok, false);
  assert.equal(checkGiftCard(makeGiftCard({ expiresAt: new Date("2020-01-01T00:00:00.000Z") }), null).ok, false);
  assert.equal(checkGiftCard(makeGiftCard({ customerId: "cust-a" }), "cust-b").ok, false);
  assert.equal(checkGiftCard(makeGiftCard({ customerId: "cust-a" }), "cust-a").ok, true);
});
