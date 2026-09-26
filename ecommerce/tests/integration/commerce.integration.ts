/**
 * Test di integrazione su PostgreSQL reale (solo `sessa_test` locale, ricreato
 * da tests/integration/reset-db.sh). Coprono i flussi che i test unitari non
 * vedono: transazioni SERIALIZABLE, concorrenza, idempotenza, outbox email,
 * webhook e rimborsi. Eseguire con `npm run test:integration`.
 */
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { getCartByToken } from "@/lib/services/cart";
import { placeOrder } from "@/lib/services/checkout";
import { earliestDateAfterBusinessDays } from "@/lib/commerce/scheduling";
import { transitionOrder } from "@/lib/services/orders";
import { reconcileStripeExternalReversal, reconcileStripeSuccess, refundOrder } from "@/lib/services/payment-attempts";
import { expireStockReservations } from "@/lib/services/stock-reservations";
import { beginRegistration, completeRegistration } from "@/lib/services/registration";
import { runRetention } from "@/lib/services/retention";
import { enqueueEmailInTx } from "@/lib/services/email";
import { issueGiftCard } from "@/lib/services/giftcards";
import {
  ALL_DAY_HOURS,
  assertDomainError,
  assertTestDatabase,
  checkoutInput as input,
  newCart as newCartAt,
  slotKeys as slotKeysAt
} from "./support";

let locationId = "";
let storeVariantId = "";
let shippableStoreVariantId = "";
let localRateId = "";

async function setStock(qty: number, id = storeVariantId) {
  await prisma.storeVariant.update({ where: { id }, data: { stockQty: qty } });
}

function newCart(qty = 1, id = storeVariantId) {
  return newCartAt(locationId, id, qty);
}

function slotKeys() {
  return slotKeysAt(locationId);
}

before(async () => {
  assertTestDatabase();
  const location = await prisma.location.create({
    data: {
      name: "Sede Test",
      slug: "sede-test",
      city: "Napoli",
      address: "Via Test 1",
      province: "NA",
      postalCode: "80100",
      openingHours: ALL_DAY_HOURS,
      leadTimeMinutes: 60,
      slotMinutes: 30,
      localDeliveryPostalCodes: "801"
    }
  });
  locationId = location.id;
  const category = await prisma.category.create({ data: { name: "Test", slug: "cat-test" } });
  const fresh = await prisma.product.create({
    data: { name: "Sfogliatella", slug: "sfogliatella-test", status: "ACTIVE", categoryId: category.id, allergens: "Glutine", ingredients: "Farina", storageInfo: "Fresco" }
  });
  const boxed = await prisma.product.create({
    data: { name: "Panettone", slug: "panettone-test", status: "ACTIVE", shippingScope: "NATIONAL", taxRateBps: 1000 }
  });
  const freshVariant = await prisma.productVariant.create({ data: { productId: fresh.id, name: "Classica", sku: "TEST-SFO", basePriceCents: 250 } });
  const boxedVariant = await prisma.productVariant.create({ data: { productId: boxed.id, name: "1 kg", sku: "TEST-PAN", basePriceCents: 3500 } });
  storeVariantId = (await prisma.storeVariant.create({ data: { locationId, variantId: freshVariant.id, stockQty: 50 } })).id;
  shippableStoreVariantId = (await prisma.storeVariant.create({ data: { locationId, variantId: boxedVariant.id, stockQty: 20 } })).id;
  const zone = await prisma.shippingZone.create({ data: { name: "Italia", countries: "IT" } });
  localRateId = (await prisma.shippingRate.create({ data: { zoneId: zone.id, name: "Locale", amountCents: 500, scope: "LOCAL" } })).id;
  await prisma.shippingRate.create({ data: { zoneId: zone.id, name: "Corriere", amountCents: 990, scope: "NATIONAL" } });
});

test("ordine ritiro con pagamento in sede: stock, fascia, IVA, email a cliente e sede", async () => {
  await prisma.location.update({ where: { id: locationId }, data: { notificationEmail: "sede@example.com" } });
  const cart = await newCart(4);
  const [slot] = await slotKeys();
  const placed = await placeOrder(cart, input({ slot, expectedAmountDueCents: 1000 }));
  assert.match(placed.code, /^SES-\d{4}-\d{6}$/);
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code }, include: { items: true } });
  assert.equal(order.status, "CONFIRMED");
  assert.equal(order.totalCents, 1000);
  assert.equal(order.taxCents, 91);
  assert.ok(order.fulfillmentAt);
  assert.equal(order.termsVersion, "2026-09");
  assert.equal((await prisma.storeVariant.findUniqueOrThrow({ where: { id: storeVariantId } })).stockQty, 46);
  const emails = await prisma.emailMessage.findMany({ where: { reference: placed.code } });
  // Pagamento in sede: l'istruzione sta nella conferma, nessuna email in più.
  assert.deepEqual(emails.map((email) => email.type).sort(), ["ORDER_CONFIRMATION", "STORE_NEW_ORDER"]);
  assert.ok(emails.some((email) => email.toEmail === "sede@example.com"));
});

test("stessa chiave di checkout: il ritentativo restituisce lo stesso ordine", async () => {
  const cart = await newCart(1);
  const [slot] = await slotKeys();
  const data = input({ slot });
  const first = await placeOrder(cart, data);
  const again = await placeOrder(cart, data);
  assert.equal(again.code, first.code);
  assert.equal(again.replayed, true);
  assert.equal(await prisma.order.count({ where: { email: data.email } }), 1);
});

test("doppio invio concorrente con la stessa chiave non crea due ordini", async () => {
  const cart = await newCart(1);
  const [slot] = await slotKeys();
  const data = input({ slot });
  const results = await Promise.allSettled([placeOrder(cart, data), placeOrder(cart, data)]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  assert.ok(fulfilled.length >= 1);
  assert.equal(await prisma.order.count({ where: { email: data.email } }), 1);
  for (const result of results) {
    if (result.status === "rejected") assert.ok(result.reason instanceof DomainError, String(result.reason));
  }
});

test("due clienti sull'ultimo pezzo: vende uno solo, stock mai negativo", async () => {
  await setStock(10);
  const [cartA, cartB] = [await newCart(1), await newCart(1)];
  await setStock(1);
  const [slot] = await slotKeys();
  const results = await Promise.allSettled([placeOrder(cartA, input({ slot })), placeOrder(cartB, input({ slot }))]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason?.message), /Disponibilità insufficiente/);
  assert.equal((await prisma.storeVariant.findUniqueOrThrow({ where: { id: storeVariantId } })).stockQty, 0);
  await setStock(50);
});

test("capienza della fascia: la seconda prenotazione nella stessa fascia è rifiutata", async () => {
  await prisma.location.update({ where: { id: locationId }, data: { slotCapacity: 1 } });
  const keys = await slotKeys();
  const slot = keys[3];
  await placeOrder(await newCart(1), input({ slot }));
  await assertDomainError(placeOrder(await newCart(1), input({ slot })), "SLOT_FULL");
  await prisma.location.update({ where: { id: locationId }, data: { slotCapacity: 0 } });
});

test("email di un account registrato senza sessione: serve il login", async () => {
  await prisma.customer.create({ data: { email: "registrato@example.com", firstName: "Reg", lastName: "Istrato", passwordHash: "x", emailVerified: true } });
  const [slot] = await slotKeys();
  await assertDomainError(placeOrder(await newCart(1), input({ slot, email: "registrato@example.com" })), "LOGIN_REQUIRED");
});

test("totale cambiato rispetto a quello visto dal cliente: nessun addebito diverso", async () => {
  const [slot] = await slotKeys();
  await assertDomainError(placeOrder(await newCart(2), input({ slot, expectedAmountDueCents: 400 })), "TOTAL_CHANGED");
});

test("contanti con consegna e bonifico senza anticipo vengono rifiutati", async () => {
  const [slot] = await slotKeys();
  await assertDomainError(
    placeOrder(await newCart(1), input({ slot, paymentMethod: "bank_transfer" })),
    "PAYMENT_METHOD_NOT_ALLOWED"
  );
  const earliest = earliestDateAfterBusinessDays(new Date(), 3);
  const later = (await slotKeys()).find((key) => key.slice(0, 10) >= earliest);
  assert.ok(later);
  const placed = await placeOrder(await newCart(1), input({ slot: later, paymentMethod: "bank_transfer" }));
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(await prisma.emailMessage.count({ where: { reference: placed.code, type: "PAYMENT_INSTRUCTIONS" } }), 1);
  assert.ok(order.stockReservationExpiresAt && order.stockReservationExpiresAt < order.fulfillmentAt!);
});

test("consegna: fresco solo nei CAP serviti, corriere solo per prodotti spedibili", async () => {
  const [slot] = await slotKeys();
  const delivery = { fulfillmentType: "DELIVERY", line1: "Via Roma 1", city: "Milano", province: "MI", postalCode: "20121" };
  const national = await prisma.shippingRate.findFirstOrThrow({ where: { scope: "NATIONAL" } });
  await assertDomainError(
    placeOrder(await newCart(1), input({ ...delivery, slot, paymentMethod: "bank_transfer", shippingRateId: national.id })),
    "SHIPPING_NOT_ALLOWED"
  );
  await assertDomainError(
    placeOrder(await newCart(1), input({ ...delivery, slot, paymentMethod: "bank_transfer", shippingRateId: localRateId })),
    "SHIPPING_NOT_ALLOWED"
  );
  const earliest = earliestDateAfterBusinessDays(new Date(), 3);
  const later = (await slotKeys()).find((key) => key.slice(0, 10) >= earliest)!;
  const local = await placeOrder(
    await newCart(4),
    input({ ...delivery, postalCode: "80121", city: "Napoli", province: "NA", slot: later, paymentMethod: "bank_transfer", shippingRateId: localRateId })
  );
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { code: local.code } })).shippingCents, 500);
  const shipped = await placeOrder(
    await newCart(1, shippableStoreVariantId),
    input({ ...delivery, paymentMethod: "bank_transfer", shippingRateId: national.id })
  );
  const shippedOrder = await prisma.order.findUniqueOrThrow({ where: { code: shipped.code } });
  assert.equal(shippedOrder.fulfillmentAt, null);
  assert.equal(shippedOrder.shippingCents, 990);
});

test("annullo dalla sede: stock ripristinato ed email al cliente", async () => {
  const [slot] = await slotKeys();
  const before = (await prisma.storeVariant.findUniqueOrThrow({ where: { id: storeVariantId } })).stockQty;
  const placed = await placeOrder(await newCart(3), input({ slot }));
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  await transitionOrder(order.id, "CANCELLED", "admin@example.com", { cancelReason: "STORE" });
  assert.equal((await prisma.storeVariant.findUniqueOrThrow({ where: { id: storeVariantId } })).stockQty, before);
  assert.equal(await prisma.emailMessage.count({ where: { reference: placed.code, type: "ORDER_CANCELLED" } }), 1);
});

test("rimborso di un ordine pagato con gift card: idempotente, credito restituito", async () => {
  const card = await issueGiftCard({ amountCents: 10_000 });
  const cart = await newCart(2);
  await prisma.cart.update({ where: { id: cart.id }, data: { giftCardCode: card.code } });
  const [slot] = await slotKeys();
  const placed = await placeOrder((await getCartByToken(cart.token))!, input({ slot }));
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  assert.equal(order.status, "PAID");
  await refundOrder(order.id, "admin@example.com");
  await refundOrder(order.id, "admin@example.com");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "REFUNDED");
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } })).balanceCents, 10_000);
  assert.equal(await prisma.emailMessage.count({ where: { reference: order.code, type: "REFUND_CONFIRMATION" } }), 1);
});

test("webhook Stripe: pagamento riconciliato una volta, rimborso da dashboard registrato", async () => {
  const [slot] = await slotKeys();
  const placed = await placeOrder(await newCart(2), input({ slot }));
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  // Simula un ordine carta in attesa (senza chiamare Stripe).
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "PENDING_PAYMENT", paymentProvider: "stripe", paymentMethod: "card", stockReservationExpiresAt: new Date(Date.now() + 30 * 60_000) }
  });
  await prisma.paymentAttempt.deleteMany({ where: { orderId: order.id } });
  const attempt = await prisma.paymentAttempt.create({
    data: { orderId: order.id, provider: "stripe", method: "card", amountCents: 500, status: "PENDING", idempotencyKey: `test:${order.id}`, providerRef: `cs_test_${order.id}` }
  });
  const event = {
    eventId: `evt_${order.id}`,
    eventType: "checkout.session.completed",
    providerRef: attempt.providerRef!,
    providerPaymentRef: `pi_${order.id}`,
    amountCents: 500,
    currency: "eur",
    metadataOrderId: order.id,
    metadataAttemptId: attempt.id
  };
  assert.equal(await reconcileStripeSuccess(event), "PAID");
  assert.equal(await reconcileStripeSuccess(event), "DUPLICATE");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus, "PAID");
  // Importo diverso su un altro evento: verifica manuale, niente PAID silenzioso.
  const mismatch = await prisma.paymentAttempt.create({
    data: { orderId: order.id, provider: "stripe", amountCents: 500, status: "FAILED", idempotencyKey: `test2:${order.id}`, providerRef: `cs_test2_${order.id}` }
  });
  assert.equal(await reconcileStripeSuccess({ ...event, eventId: `evt2_${order.id}`, providerRef: mismatch.providerRef!, amountCents: 1, metadataAttemptId: mismatch.id }), "REVIEW");

  const refundEvent = { eventId: `evt_refund_${order.id}`, eventType: "charge.refunded", providerPaymentRef: `pi_${order.id}`, amountRefundedCents: 200, amountCents: 500 };
  assert.equal(await reconcileStripeExternalReversal(refundEvent), "UPDATED");
  assert.equal(await reconcileStripeExternalReversal(refundEvent), "IGNORED");
  let refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(refreshed.paymentStatus, "PARTIALLY_REFUNDED");
  assert.equal(refreshed.refundedCents, 200);
  assert.equal(await reconcileStripeExternalReversal({ ...refundEvent, eventId: `evt_refund2_${order.id}`, amountRefundedCents: 500 }), "UPDATED");
  refreshed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(refreshed.status, "REFUNDED");
  assert.equal(refreshed.refundedCents, 500);
});

test("bonifico non accreditato: la prenotazione scade, stock libero, cliente avvisato", async () => {
  const earliest = earliestDateAfterBusinessDays(new Date(), 3);
  const later = (await slotKeys()).find((key) => key.slice(0, 10) >= earliest)!;
  const before = (await prisma.storeVariant.findUniqueOrThrow({ where: { id: storeVariantId } })).stockQty;
  const placed = await placeOrder(await newCart(2), input({ slot: later, paymentMethod: "bank_transfer" }));
  await prisma.order.update({ where: { code: placed.code }, data: { stockReservationExpiresAt: new Date(Date.now() - 60_000) } });
  const result = await expireStockReservations(25);
  assert.ok(result.released >= 1);
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  assert.equal(order.status, "CANCELLED");
  assert.equal((await prisma.storeVariant.findUniqueOrThrow({ where: { id: storeVariantId } })).stockQty, before);
  assert.equal(await prisma.emailMessage.count({ where: { reference: placed.code, type: "ORDER_CANCELLED" } }), 1);
});

test("registrazione: nessun profilo prima del link, profilo ospite completato dopo", async () => {
  await prisma.customer.create({ data: { email: "ospite@example.com", firstName: "Ospite", lastName: "Storico" } });
  const started = await beginRegistration({ email: "nuovo@example.com", firstName: "Nuovo", lastName: "Cliente" });
  assert.equal(await prisma.customer.count({ where: { email: "nuovo@example.com" } }), 0);
  const token = new URL(started.devLink!).searchParams.get("token")!;
  const created = await completeRegistration(token, "password-lunga-123");
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: created.customerId } })).emailVerified, true);
  await assertDomainError(completeRegistration(token, "password-lunga-123"));

  const guest = await beginRegistration({ email: "ospite@example.com", firstName: "Ospite", lastName: "Registrato" });
  const guestToken = new URL(guest.devLink!).searchParams.get("token")!;
  const claimed = await completeRegistration(guestToken, "password-lunga-456");
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: claimed.customerId } });
  assert.equal(customer.lastName, "Registrato");
  assert.ok(customer.passwordHash);
});

test("outbox in transazione: un duplicato non abortisce la transazione", async () => {
  await prisma.$transaction(async (tx) => {
    const email = { toEmail: "dup@example.com", subject: "x", body: "y", type: "OPS_ALERT" as const, dedupeKey: "dup-test" };
    await enqueueEmailInTx(tx, email);
    await enqueueEmailInTx(tx, email);
    await tx.setting.upsert({ where: { key: "test.after-dup" }, create: { key: "test.after-dup", value: "1" }, update: { value: "1" } });
  });
  assert.equal(await prisma.emailMessage.count({ where: { dedupeKey: "dup-test" } }), 1);
});

test("conservazione: i profili vuoti vecchi spariscono, quelli con ordini restano", async () => {
  const old = await prisma.customer.create({
    data: { email: "vuoto@example.com", firstName: "V", lastName: "U", createdAt: new Date(Date.now() - 40 * 24 * 60 * 60_000) }
  });
  const result = await runRetention();
  assert.ok(result.orphanCustomers >= 1);
  assert.equal(await prisma.customer.count({ where: { id: old.id } }), 0);
  assert.ok((await prisma.customer.count({ where: { orders: { some: {} } } })) > 0);
});
