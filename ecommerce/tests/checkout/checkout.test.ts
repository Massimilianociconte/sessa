import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { checkoutSchema } from "@/lib/validation";
import { evaluateDiscount } from "@/lib/services/discounts";
import { quoteRatesForCountry } from "@/lib/services/shipping";
import { parseCheckoutIdempotencyKey } from "@/lib/commerce/checkout-idempotency";
import { planCartQuantity, planSetCartQuantity, CART_LINE_MAX_QTY } from "@/lib/commerce/cart-integrity";
import { isBrowserReusableCartToken, buildIsolatedCartToken } from "@/lib/commerce/cart-session-isolation";
import { includedTax, parseEuroToCents, percentOf } from "@/lib/money";
import { checkoutPickupInput, futureCheckoutWhen, makeDiscount } from "../support/fixtures";

test("il checkout ritiro non chiede indirizzo, la consegna si", () => {
  assert.equal(checkoutSchema.safeParse(checkoutPickupInput()).success, true);
  const deliveryMissing = checkoutSchema.safeParse(
    checkoutPickupInput({
      fulfillmentType: "DELIVERY",
      paymentMethod: "cash_on_pickup"
    })
  );
  assert.equal(deliveryMissing.success, false);
  const deliveryOk = checkoutSchema.safeParse(
    checkoutPickupInput({
      fulfillmentType: "DELIVERY",
      paymentMethod: "bank_transfer",
      line1: "Via Dante 1",
      city: "Milano",
      province: "MI",
      postalCode: "20121",
      shippingRateId: "rate-1"
    })
  );
  assert.equal(deliveryOk.success, true);
});

test("la fascia orario rifiuta il passato prossimo e le date troppo lontane", () => {
  const tooSoon = checkoutSchema.safeParse(checkoutPickupInput({ fulfillmentAt: futureCheckoutWhen(0.2) }));
  assert.equal(tooSoon.success, false);
  const tooFar = checkoutSchema.safeParse(
    checkoutPickupInput({
      fulfillmentAt: futureCheckoutWhen(24 * 400)
    })
  );
  assert.equal(tooFar.success, false);
});

test("gli sconti restano granulari: percentuali, fissi, sede e primo ordine", () => {
  const ctx = {
    locationId: "loc-1",
    subtotalCents: 4000,
    lines: [
      { productId: "p1", categoryId: "c1", lineCents: 2500 },
      { productId: "p2", categoryId: "c2", lineCents: 1500 }
    ],
    customerId: "cust-1",
    isFirstOrder: true,
    customerRedemptions: 0
  };
  const percent = evaluateDiscount(makeDiscount(), ctx);
  assert.equal(percent.ok, true);
  if (percent.ok) assert.equal(percent.amountCents, 400);
  const fixed = evaluateDiscount(makeDiscount({ type: "FIXED", value: 700 }), ctx);
  assert.equal(fixed.ok, true);
  if (fixed.ok) assert.equal(fixed.amountCents, 700);
  const scoped = evaluateDiscount(
    makeDiscount({
      products: [{ id: "link", discountId: "disc-test", productId: "p1" }]
    }),
    ctx
  );
  assert.equal(scoped.ok, true);
  if (scoped.ok) {
    assert.equal(scoped.eligibleBaseCents, 2500);
    assert.equal(scoped.amountCents, 250);
  }
  assert.equal(evaluateDiscount(makeDiscount({ firstOrderOnly: true }), { ...ctx, isFirstOrder: false }).ok, false);
  assert.equal(
    evaluateDiscount(makeDiscount({ locations: [{ id: "l", discountId: "disc-test", locationId: "altra" }] }), ctx).ok,
    false
  );
  assert.equal(evaluateDiscount(makeDiscount({ isActive: false }), ctx).ok, false);
  assert.equal(evaluateDiscount(makeDiscount({ endsAt: new Date("2020-01-01T00:00:00.000Z") }), ctx).ok, false);
});

test("la spedizione diventa gratis sopra soglia e ignora paesi fuori zona", async () => {
  const db = {
    shippingZone: {
      findMany: async () => [
        {
          id: "z-it",
          name: "Italia",
          countries: "IT",
          position: 0,
          isActive: true,
          rates: [
            {
              id: "r-std",
              zoneId: "z-it",
              name: "Standard",
              amountCents: 590,
              freeAboveCents: 4000,
              position: 0,
              isActive: true
            }
          ]
        }
      ]
    }
  } as unknown as Pick<Prisma.TransactionClient, "shippingZone">;
  const paid = await quoteRatesForCountry("IT", 2000, db);
  assert.equal(paid[0]?.effectiveCents, 590);
  assert.equal(paid[0]?.isFree, false);
  const free = await quoteRatesForCountry("it", 4000, db);
  assert.equal(free[0]?.effectiveCents, 0);
  assert.equal(free[0]?.isFree, true);
  assert.deepEqual(await quoteRatesForCountry("DE", 9000, db), []);
});

test("il carrello clampa a stock e a 99, e il logout isola il token", () => {
  const add = planCartQuantity({ alreadyInCart: 90, addQty: 20, stockQty: 200 });
  assert.equal(add.qty, CART_LINE_MAX_QTY);
  assert.equal(add.clamped, true);
  const stock = planSetCartQuantity({ requestedQty: 8, stockQty: 3 });
  assert.equal(stock.qty, 3);
  assert.equal(stock.clamped, true);
  assert.equal(isBrowserReusableCartToken("a".repeat(32)), true);
  assert.equal(isBrowserReusableCartToken(buildIsolatedCartToken("cart-1", "deadbeef")), false);
});

test("importi e IVA restano in centesimi, la chiave checkout deve essere opaca", () => {
  assert.equal(parseEuroToCents("12,50"), 1250);
  assert.equal(parseEuroToCents("1.250,50"), 125050);
  assert.equal(includedTax(1100, 1000), 100);
  assert.equal(percentOf(4000, 1000), 400);
  assert.equal(parseCheckoutIdempotencyKey("too-short"), null);
  const key = "c".repeat(32);
  assert.equal(parseCheckoutIdempotencyKey(key), key);
});
