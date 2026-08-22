import assert from "node:assert/strict";
import test from "node:test";
import { stockReservationExpiry, stripeSessionExpiry, stripePayableAmountCents } from "@/lib/payments/reservation-policy";
import { decryptSensitiveValue, encryptSensitiveValue, isEncryptedSensitiveValue } from "@/lib/security/secret-box";
import { authorizeInternalJob } from "@/lib/auth/internal-jobs";
import { authorizeMerchantFeed } from "@/lib/merchant/google-feeds";
import { checkoutSchema, locationSchema } from "@/lib/validation";
import { buildProductBreadcrumbJsonLd, hoursMatchForStructuredData, normalizeOpeningHoursText } from "@/lib/seo/sessa-local";
import type { StoreProductView } from "@/lib/services/catalog";

test("le prenotazioni carta rispettano la finestra Stripe e il bonifico ha una scadenza separata", () => {
  const now = new Date("2026-07-11T10:00:00.000Z");
  const oldCard = process.env.STOCK_RESERVATION_MINUTES;
  const oldBank = process.env.BANK_TRANSFER_RESERVATION_HOURS;
  process.env.STOCK_RESERVATION_MINUTES = "35";
  process.env.BANK_TRANSFER_RESERVATION_HOURS = "48";
  try {
    assert.equal(stockReservationExpiry("card", now)?.toISOString(), "2026-07-11T10:35:00.000Z");
    assert.equal(stockReservationExpiry("bank_transfer", now)?.toISOString(), "2026-07-13T10:00:00.000Z");
    assert.equal(stockReservationExpiry("cash_on_pickup", now), null);
    assert.equal(stockReservationExpiry("gift_card", now)?.toISOString(), "2026-07-13T10:00:00.000Z");
    assert.equal(stripeSessionExpiry(new Date(now.getTime() + 5_000), now).toISOString(), "2026-07-11T10:31:00.000Z");
    assert.equal(stripePayableAmountCents(49), false);
    assert.equal(stripePayableAmountCents(50), true);
    assert.equal(stripePayableAmountCents(0), true);
  } finally {
    if (oldCard === undefined) delete process.env.STOCK_RESERVATION_MINUTES;
    else process.env.STOCK_RESERVATION_MINUTES = oldCard;
    if (oldBank === undefined) delete process.env.BANK_TRANSFER_RESERVATION_HOURS;
    else process.env.BANK_TRANSFER_RESERVATION_HOURS = oldBank;
  }
});

test("i valori sensibili sono cifrati con autenticazione e il plaintext legacy resta leggibile", () => {
  const oldSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret-with-at-least-thirty-two-characters";
  try {
    const encrypted = encryptSensitiveValue("segreto operativo");
    assert.equal(isEncryptedSensitiveValue(encrypted), true);
    assert.equal(decryptSensitiveValue(encrypted), "segreto operativo");
    assert.equal(decryptSensitiveValue("legacy-plaintext"), "legacy-plaintext");
    assert.throws(() => decryptSensitiveValue(`${encrypted.slice(0, -2)}xx`));
  } finally {
    if (oldSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = oldSecret;
  }
});

test("job interni e feed Merchant richiedono segreti lunghi e confronto costante", () => {
  const oldMaintenance = process.env.MAINTENANCE_SECRET;
  const oldMerchant = process.env.MERCHANT_FEED_TOKEN;
  const maintenance = "maintenance-secret-1234567890-abcdefgh";
  const merchant = "merchant-feed-secret-1234567890-abcdefgh";
  process.env.MAINTENANCE_SECRET = maintenance;
  process.env.MERCHANT_FEED_TOKEN = merchant;
  try {
    assert.equal(authorizeInternalJob(new Request("https://example.test", { headers: { Authorization: `Bearer ${maintenance}` } })), true);
    assert.equal(authorizeInternalJob(new Request("https://example.test", { headers: { Authorization: "Bearer wrong" } })), false);
    assert.equal(authorizeMerchantFeed(new Request(`https://example.test/feed?key=${encodeURIComponent(merchant)}`)), true);
    assert.equal(authorizeMerchantFeed(new Request("https://example.test/feed?key=wrong")), false);
  } finally {
    if (oldMaintenance === undefined) delete process.env.MAINTENANCE_SECRET;
    else process.env.MAINTENANCE_SECRET = oldMaintenance;
    if (oldMerchant === undefined) delete process.env.MERCHANT_FEED_TOKEN;
    else process.env.MERCHANT_FEED_TOKEN = oldMerchant;
  }
});

test("Merchant accetta solo store code alfanumerici e SLA conformi al feed locale Google", () => {
  const base = {
    name: "Ottaviano",
    slug: "ottaviano",
    city: "Ottaviano",
    address: "Piazza Municipio 27",
    merchantStoreCode: "SESSAOTTAVIANO01",
    merchantPickupSla: "same day"
  };
  assert.equal(locationSchema.safeParse(base).success, true);
  assert.equal(locationSchema.safeParse({ ...base, merchantStoreCode: "sessa-ottaviano" }).success, false);
  assert.equal(locationSchema.safeParse({ ...base, merchantPickupSla: "same_day" }).success, false);
  assert.equal(
    locationSchema.safeParse({ ...base, isActive: true, pickupEnabled: false, deliveryEnabled: false }).success,
    false
  );
});

test("il checkout accetta la gift card come credito, non come metodo scelto dal client", () => {
  const when = "2026-12-24T16:00";
  const base = {
    email: "cliente@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    fulfillmentType: "PICKUP",
    fulfillmentAt: when,
    paymentMethod: "card"
  };
  assert.equal(checkoutSchema.safeParse(base).success, true);
  assert.equal(checkoutSchema.safeParse({ ...base, paymentMethod: "gift_card" }).success, false);
  assert.equal(checkoutSchema.safeParse({ ...base, paymentMethod: "cash_on_pickup" }).success, true);
});

test("gli orari 24:00 del gestionale restano confrontabili con lo schema 00:00", () => {
  assert.equal(normalizeOpeningHoursText("07:00–24:00"), "07:00-00:00");
  assert.equal(hoursMatchForStructuredData("07:00–24:00", "07:00-00:00"), true);
  assert.equal(hoursMatchForStructuredData("06:30-21:00, martedì chiuso", "06:30-21:00, martedì chiuso"), true);
});

test("il breadcrumb prodotto include la landing categoria della sede", () => {
  const location = {
    name: "Ottaviano",
    slug: "ottaviano",
    city: "Ottaviano",
    address: "Piazza Municipio, 27",
    province: "NA",
    postalCode: "80044",
    pickupEnabled: true,
    deliveryEnabled: true
  };
  const product = {
    slug: "sfogliatelle",
    name: "Sfogliatelle",
    category: { name: "Sfogliatelle", slug: "sfogliatelle" }
  } as StoreProductView;
  const crumbs = buildProductBreadcrumbJsonLd(location, product).itemListElement;
  assert.equal(crumbs.length, 4);
  assert.match(String(crumbs[2]?.item), /\/sede\/ottaviano\/categorie\/sfogliatelle$/);
  assert.equal(crumbs[2]?.name, "Sfogliatelle");
  assert.match(String(crumbs[3]?.item), /\/sede\/ottaviano\/prodotti\/sfogliatelle$/);
});
