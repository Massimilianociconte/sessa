import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  describeCartIntegrityWarnings,
  describeStockClamp,
  planCartQuantity,
  planSetCartQuantity,
  sanitizeCartLines
} from "@/lib/commerce/cart-integrity";
import {
  buildIsolatedCartToken,
  isBrowserReusableCartToken
} from "@/lib/commerce/cart-session-isolation";
import { rankCatalogHits, matchesCatalogQuery } from "@/lib/catalog-discovery";
import { assessCheckoutVelocity } from "@/lib/commerce/fraud";
import { CircuitBreaker } from "@/lib/commerce/circuit-breaker";
import {
  classifyStripeCapture,
  pickRefundablePaymentAttempt,
  planRefund,
  REFUNDABLE_PAYMENT_ATTEMPT_STATUSES
} from "@/lib/commerce/refund-math";
import { parseCheckoutIdempotencyKey } from "@/lib/commerce/checkout-idempotency";
import { isValidItalianPostalCode, isValidItalianProvince, normalizeItalianPhone } from "@/lib/commerce/address-it";
import { italianAddressSchema } from "@/lib/validation";
import { giftCardApplicable } from "@/lib/services/giftcards";

test("il carrello scarta i prodotti non vendibili e clampa lo stock senza oversell", () => {
  const result = sanitizeCartLines([
    {
      itemId: "a",
      storeVariantId: "sv-a",
      qty: 4,
      live: { available: true, productActive: true, variantActive: true, stockQty: 2, unitCents: 500, previousUnitCents: 500 }
    },
    {
      itemId: "b",
      storeVariantId: "sv-b",
      qty: 1,
      live: { available: false, productActive: true, variantActive: true, stockQty: 8, unitCents: 900, previousUnitCents: 900 }
    },
    {
      itemId: "c",
      storeVariantId: "sv-c",
      qty: 1,
      live: { available: true, productActive: true, variantActive: true, stockQty: 3, unitCents: 700, previousUnitCents: 600 }
    }
  ]);
  assert.deepEqual(result.kept.map((line) => ({ id: line.itemId, qty: line.qty })), [
    { id: "a", qty: 2 },
    { id: "c", qty: 1 }
  ]);
  assert.equal(result.removed.some((item) => item.itemId === "b" && item.reason === "unavailable"), true);
  assert.equal(result.clamped.some((item) => item.itemId === "a" && item.to === 2), true);
  assert.equal(result.priceChanges.some((item) => item.itemId === "c" && item.from === 600 && item.to === 700), true);
  const warnings = describeCartIntegrityWarnings(result, { a: "Sfogliatelle", b: "Babà" });
  assert.equal(warnings.some((text) => text.includes("Sfogliatelle") && text.includes("2")), true);
  assert.equal(warnings.some((text) => text.includes("Babà")), true);
});

test("add e update del carrello segnalano quando lo stock clampa la quantita", () => {
  const added = planCartQuantity({ alreadyInCart: 2, addQty: 3, stockQty: 4 });
  assert.equal(added.qty, 4);
  assert.equal(added.requested, 5);
  assert.equal(added.clamped, true);
  const fits = planCartQuantity({ alreadyInCart: 0, addQty: 2, stockQty: 8 });
  assert.equal(fits.clamped, false);
  assert.equal(fits.qty, 2);
  const updated = planSetCartQuantity({ requestedQty: 6, stockQty: 2 });
  assert.equal(updated.qty, 2);
  assert.equal(updated.clamped, true);
  const message = describeStockClamp({ productName: "Babà", requested: 5, kept: 2 });
  assert.match(message, /Babà/);
  assert.match(message, /2/);
  assert.match(message, /5/);
});

test("il logout isola il token carrello cosi il browser successivo non lo eredita", () => {
  const previous = "a".repeat(32);
  const isolated = buildIsolatedCartToken("cart-1", "deadbeef");
  assert.notEqual(isolated, previous);
  assert.equal(isBrowserReusableCartToken(previous), true);
  assert.equal(isBrowserReusableCartToken(isolated), false);
  assert.equal(isBrowserReusableCartToken("converted:cart-1"), false);
  assert.equal(isBrowserReusableCartToken("merged:cart-2"), false);

  const authSource = readFileSync(resolve(process.cwd(), "lib/actions/account/auth.ts"), "utf8");
  assert.match(authSource, /isolateCurrentCartCookie/);
  assert.match(authSource, /syncCartCookieAfterLogin/);
  const cartSource = readFileSync(resolve(process.cwd(), "lib/services/cart.ts"), "utf8");
  assert.match(cartSource, /planCartQuantity/);
  assert.match(cartSource, /describeStockClamp/);
  const checkoutSource = readFileSync(resolve(process.cwd(), "app/checkout/page.tsx"), "utf8");
  assert.match(checkoutSource, /integrityWarnings/);
});

test("la ricerca catalogo trova SKU, ignora accenti e classifica i match", () => {
  const products = [
    { id: "1", name: "Sfogliatella riccia", sku: "SFO-RIC", tags: "classici", category: "Sfogliatelle" },
    { id: "2", name: "Babà al rum", sku: "BABA-01", tags: "tradizionale", category: "Pasticceria" },
    { id: "3", name: "Box regalo", sku: "BOX-REG", tags: "regalo", category: "Box Regalo" }
  ];
  assert.equal(matchesCatalogQuery({ name: "Sfogliatella", sku: "SFO-RIC", tags: "", category: "Sfogliatelle" }, "sfo-ric"), true);
  assert.equal(matchesCatalogQuery({ name: "Babà al rum", sku: "BABA-01", tags: "", category: "" }, "baba"), true);
  const ranked = rankCatalogHits(products, "sfogliatella");
  assert.equal(ranked[0]?.id, "1");
  assert.equal(rankCatalogHits(products, "xyz-inesistente").length, 0);
});

test("il controllo velocity blocca burst di checkout dallo stesso account o IP", () => {
  const now = Date.now();
  assert.equal(
    assessCheckoutVelocity({
      now,
      recentByEmail: 1,
      recentByIp: 1,
      emailWindowMinutes: 15,
      ipWindowMinutes: 15,
      emailLimit: 3,
      ipLimit: 8
    }).ok,
    true
  );
  const blocked = assessCheckoutVelocity({
    now,
    recentByEmail: 3,
    recentByIp: 1,
    emailWindowMinutes: 15,
    ipWindowMinutes: 15,
    emailLimit: 3,
    ipLimit: 8
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason ?? "", /troppi ordini/i);
});

test("il circuit breaker apre dopo errori consecutivi e si richiude dopo il cooldown", () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50, now: () => 1_000 });
  assert.equal(breaker.canRequest(), true);
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.canRequest(), false);
  breaker.now = () => 1_060;
  assert.equal(breaker.canRequest(), true);
  breaker.recordSuccess();
  assert.equal(breaker.canRequest(), true);
});

test("il piano rimborso distingue parziale e totale e rifiuta importi oltre il residuo", () => {
  const partial = planRefund({ totalCents: 2000, alreadyRefundedCents: 0, giftCardCents: 0, requestedCents: 500 });
  assert.equal(partial.ok, true);
  if (partial.ok) {
    assert.equal(partial.amountCents, 500);
    assert.equal(partial.fullyRefunded, false);
    assert.equal(partial.nextRefundedCents, 500);
  }
  const full = planRefund({ totalCents: 2000, alreadyRefundedCents: 500, giftCardCents: 0, requestedCents: 1500 });
  assert.equal(full.ok, true);
  if (full.ok) assert.equal(full.fullyRefunded, true);
  const overflow = planRefund({ totalCents: 2000, alreadyRefundedCents: 1800, giftCardCents: 0, requestedCents: 400 });
  assert.equal(overflow.ok, false);
});

test("la gift card detrae parziale o totale e il rimborso Stripe non include quel credito", () => {
  const card = { balanceCents: 1500 } as Parameters<typeof giftCardApplicable>[0];
  assert.equal(giftCardApplicable(card, 4000), 1500);
  assert.equal(giftCardApplicable({ ...card, balanceCents: 5000 }, 4000), 4000);
  assert.equal(giftCardApplicable(card, 0), 0);

  const mixedFull = planRefund({
    totalCents: 5000,
    alreadyRefundedCents: 0,
    giftCardCents: 2000,
    requestedCents: 5000
  });
  assert.equal(mixedFull.ok, true);
  if (mixedFull.ok) {
    assert.equal(mixedFull.amountCents, 3000);
    assert.equal(mixedFull.fullyRefunded, true);
  }

  const mixedPartial = planRefund({
    totalCents: 5000,
    alreadyRefundedCents: 0,
    giftCardCents: 2000,
    requestedCents: 1000
  });
  assert.equal(mixedPartial.ok, true);
  if (mixedPartial.ok) {
    assert.equal(mixedPartial.amountCents, 1000);
    assert.equal(mixedPartial.fullyRefunded, false);
  }

  const giftOnly = planRefund({
    totalCents: 2000,
    alreadyRefundedCents: 0,
    giftCardCents: 2000,
    requestedCents: 2000
  });
  assert.equal(giftOnly.ok, true);
  if (giftOnly.ok) {
    assert.equal(giftOnly.amountCents, 0);
    assert.equal(giftOnly.fullyRefunded, true);
  }

  const overCash = planRefund({
    totalCents: 5000,
    alreadyRefundedCents: 0,
    giftCardCents: 2000,
    requestedCents: 3500
  });
  assert.equal(overCash.ok, false);
});

test("un incasso Stripe in ritardo su CANCELLED lascia il tentativo in REVIEW ma il rimborso trova il PaymentIntent", () => {
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
  assert.equal(
    classifyStripeCapture({
      orderStatus: "CANCELLED",
      attemptStatus: "PAID",
      orderPaymentStatus: "PAID"
    }),
    "duplicate"
  );
  assert.equal(REFUNDABLE_PAYMENT_ATTEMPT_STATUSES.includes("REVIEW"), true);
  assert.equal(REFUNDABLE_PAYMENT_ATTEMPT_STATUSES.includes("PAID"), true);

  const late = pickRefundablePaymentAttempt([
    { status: "FAILED", providerPaymentRef: "pi_old" },
    { status: "REVIEW", providerPaymentRef: "pi_late_capture" }
  ]);
  assert.equal(late?.status, "REVIEW");
  assert.equal(late?.providerPaymentRef, "pi_late_capture");

  const prefersPaid = pickRefundablePaymentAttempt([
    { status: "REVIEW", providerPaymentRef: "pi_review" },
    { status: "PAID", providerPaymentRef: "pi_paid" }
  ]);
  assert.equal(prefersPaid?.providerPaymentRef, "pi_paid");

  assert.equal(pickRefundablePaymentAttempt([{ status: "REVIEW", providerPaymentRef: null }]), null);
  assert.equal(pickRefundablePaymentAttempt([{ status: "FAILED", providerPaymentRef: "pi_x" }]), null);

  const refundSource = readFileSync(resolve(process.cwd(), "lib/services/payment-attempts.ts"), "utf8");
  assert.match(refundSource, /REFUNDABLE_PAYMENT_ATTEMPT_STATUSES/);
  assert.match(refundSource, /pickRefundablePaymentAttempt\(order\.paymentAttempts\)/);
  assert.match(refundSource, /classifyStripeCapture\(/);
});

test("la chiave idempotente del checkout deve essere opaca e lunga abbastanza", () => {
  assert.equal(parseCheckoutIdempotencyKey("abc"), null);
  assert.equal(parseCheckoutIdempotencyKey("a".repeat(16)), null);
  const key = "c".repeat(32);
  assert.equal(parseCheckoutIdempotencyKey(key), key);
});

test("indirizzo italiano: CAP, provincia e telefono sono validati in modo deterministico", () => {
  assert.equal(isValidItalianPostalCode("20125"), true);
  assert.equal(isValidItalianPostalCode("2012"), false);
  assert.equal(isValidItalianProvince("MI"), true);
  assert.equal(isValidItalianProvince("milano"), false);
  assert.equal(normalizeItalianPhone("02 1234567"), "+39021234567");
  assert.equal(italianAddressSchema.safeParse({
    fullName: "Ada Lovelace",
    line1: "Via Dante 1",
    city: "Milano",
    province: "MI",
    postalCode: "20121",
    phone: "3331234567"
  }).success, true);
  assert.equal(italianAddressSchema.safeParse({
    fullName: "Ada",
    line1: "Via Dante 1",
    city: "Milano",
    province: "MILANO",
    postalCode: "21",
    phone: "abc"
  }).success, false);
});

test("HSTS e' dichiarato nella configurazione Next spedita", () => {
  const config = readFileSync(resolve(process.cwd(), "next.config.mjs"), "utf8");
  assert.match(config, /Strict-Transport-Security/);
  assert.match(config, /max-age=31536000/);
});
