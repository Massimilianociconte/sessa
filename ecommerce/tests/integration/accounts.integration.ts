/**
 * Flussi account, promozioni e post-vendita su PostgreSQL reale. Sostituisce
 * lo script prisma/verify-flow.ts (stesse garanzie, fixture propri invece del
 * seed, API attuali). Eseguire con `npm run test:integration`.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test, { before } from "node:test";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { base32Decode, currentTotpStep, verifyTotpCode } from "@/lib/auth/totp";
import { encryptSensitiveValue } from "@/lib/security/secret-box";
import { attachDiscount, attachGiftCard, getCartByToken } from "@/lib/services/cart";
import { placeOrder } from "@/lib/services/checkout";
import {
  consumeResetToken,
  createResetToken,
  getEffectiveFulfillmentPreference,
  listCustomerOrders
} from "@/lib/services/customer-account";
import { confirmTotpEnrollment, disableTotp, startTotpEnrollment, verifySecondFactor } from "@/lib/services/customer-2fa";
import { deleteCustomerAccount, exportCustomerData } from "@/lib/services/customer-gdpr";
import { consumeCustomerToken, requestEmailChange, sendVerificationEmail } from "@/lib/services/customer-verification";
import { evaluateDiscount, loadDiscount } from "@/lib/services/discounts";
import { processEmailQueue } from "@/lib/services/email";
import { issueGiftCard } from "@/lib/services/giftcards";
import { transitionOrder } from "@/lib/services/orders";
import { recordManualPayment, refundOrder } from "@/lib/services/payment-attempts";
import { linkReferralOnSignup } from "@/lib/services/referral";
import {
  ALL_DAY_HOURS,
  assertDomainError,
  assertTestDatabase,
  checkoutInput,
  newCart as newCartAt,
  registerAccount,
  slotKeys,
  stockOf
} from "./support";

let locationId = "";
let otherLocationId = "";
let categoryId = "";
let productId = "";
let storeVariantId = "";
const UNIT_CENTS = 3500;

function newCart(qty = 1) {
  return newCartAt(locationId, storeVariantId, qty);
}

async function pickupInput(overrides: Record<string, unknown> = {}) {
  const [slot] = await slotKeys(locationId);
  return checkoutInput({ slot, ...overrides });
}

/** Codice TOTP atteso per uno step (RFC 6238, stessa logica del server). */
function totpCodeFor(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    (((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff)) %
    1_000_000;
  return String(code).padStart(6, "0");
}

before(async () => {
  assertTestDatabase();
  const base = { city: "Ottaviano", address: "Via Test 2", province: "NA", postalCode: "80044", openingHours: ALL_DAY_HOURS, leadTimeMinutes: 60 };
  locationId = (await prisma.location.create({ data: { ...base, name: "Sede Conti", slug: "sede-conti" } })).id;
  otherLocationId = (await prisma.location.create({ data: { ...base, name: "Sede Altra", slug: "sede-altra" } })).id;
  categoryId = (await prisma.category.create({ data: { name: "Box regalo", slug: "box-regalo-test" } })).id;
  const product = await prisma.product.create({
    data: {
      name: "Colomba",
      slug: "colomba-test",
      status: "ACTIVE",
      categoryId,
      shippingScope: "NATIONAL",
      ingredients: "Farina, burro, uova",
      allergens: "Glutine, latte, uova",
      storageInfo: "Luogo fresco e asciutto"
    }
  });
  productId = product.id;
  const variant = await prisma.productVariant.create({ data: { productId, name: "1 kg", sku: "TEST-COL-1KG", basePriceCents: UNIT_CENTS } });
  storeVariantId = (await prisma.storeVariant.create({ data: { locationId, variantId: variant.id, stockQty: 40 } })).id;
});

test("macchina a stati: transizioni ammesse, salto vietato, rimborso con restock", async () => {
  const before = await stockOf(storeVariantId);
  const placed = await placeOrder(await newCart(2), await pickupInput());
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  assert.equal(order.shippingCents, 0);
  assert.equal(order.totalCents, order.subtotalCents - order.discountCents + order.shippingCents);
  assert.equal(await prisma.stockMovement.count({ where: { storeVariantId, reference: placed.code } }), 1);

  await recordManualPayment(order.id, "test@admin", `verify:${order.code}`);
  await transitionOrder(order.id, "PROCESSING", "test@admin");
  await transitionOrder(order.id, "READY", "test@admin");
  await assertDomainError(transitionOrder(order.id, "SHIPPED", "test@admin"));
  await refundOrder(order.id, "test@admin", "test");
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "REFUNDED");
  assert.equal(await stockOf(storeVariantId), before);
});

test("ordine oltre la disponibilità: rifiutato senza toccare lo stock", async () => {
  const before = await stockOf(storeVariantId);
  const cart = await newCart(1);
  await prisma.cartItem.updateMany({ where: { cartId: cart.id }, data: { qty: before + 10 } });
  await assertDomainError(placeOrder((await getCartByToken(cart.token))!, await pickupInput()));
  assert.equal(await stockOf(storeVariantId), before);
});

test("ordini concorrenti validi ricevono codici distinti", async () => {
  const before = await stockOf(storeVariantId);
  const [cartA, cartB] = [await newCart(1), await newCart(1)];
  const results = await Promise.all([placeOrder(cartA, await pickupInput()), placeOrder(cartB, await pickupInput())]);
  assert.equal(new Set(results.map((order) => order.code)).size, 2);
  assert.equal(await stockOf(storeVariantId), before - 2);
});

test("sconto per categoria: applicato, contato e stornato all'annullo", async () => {
  const discount = await prisma.discountCode.create({
    data: { code: "BOXTEST20", type: "PERCENT", value: 2000, scope: "CATEGORIES", categories: { create: { categoryId } } }
  });
  const loaded = await loadDiscount("BOXTEST20");
  assert.ok(loaded);
  const evaluation = evaluateDiscount(loaded, {
    locationId,
    subtotalCents: UNIT_CENTS,
    lines: [{ productId, categoryId, lineCents: UNIT_CENTS }]
  });
  assert.ok(evaluation.ok);
  assert.equal(evaluation.amountCents, Math.round(UNIT_CENTS * 0.2));

  const cart = await newCart(1);
  await attachDiscount(cart.id, discount.id);
  const placed = await placeOrder((await getCartByToken(cart.token))!, await pickupInput());
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  assert.equal(order.discountCents, 700);
  assert.equal((await prisma.discountCode.findUniqueOrThrow({ where: { id: discount.id } })).usedCount, 1);
  await transitionOrder(order.id, "CANCELLED", "test@admin");
  assert.notEqual((await prisma.discountRedemption.findUniqueOrThrow({ where: { orderId: order.id } })).reversedAt, null);
  assert.equal((await prisma.discountCode.findUniqueOrThrow({ where: { id: discount.id } })).usedCount, 0);
});

test("sconto vincolato a un'altra sede: rifiutato", async () => {
  await prisma.discountCode.create({
    data: { code: "ALTRASEDE15", type: "PERCENT", value: 1500, scope: "LOCATIONS", locations: { create: { locationId: otherLocationId } } }
  });
  const loaded = await loadDiscount("ALTRASEDE15");
  assert.ok(loaded);
  const evaluation = evaluateDiscount(loaded, {
    locationId,
    subtotalCents: UNIT_CENTS,
    lines: [{ productId, categoryId, lineCents: UNIT_CENTS }]
  });
  assert.equal(evaluation.ok, false);
});

test("account: ordine collegato, storico, conferma, reset password monouso", async () => {
  const email = "account-test@example.com";
  const customerId = await registerAccount(email);
  assert.ok((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).referralCode);

  const placed = await placeOrder(await newCart(1), await pickupInput({ email, firstName: "Anna", lastName: "Verdi" }), {
    authenticatedCustomerId: customerId
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  assert.equal(order.customerId, customerId);
  assert.notEqual(order.fulfillmentAt, null);
  assert.ok((await listCustomerOrders(customerId)).some((row) => row.code === placed.code));
  assert.equal(await prisma.emailMessage.count({ where: { reference: placed.code, type: "ORDER_CONFIRMATION" } }), 1);

  const resetToken = await createResetToken(email);
  assert.ok(resetToken);
  await consumeResetToken(resetToken, "nuovapassword9");
  assert.ok(verifyPassword("nuovapassword9", (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).passwordHash!));
  await assertDomainError(consumeResetToken(resetToken, "altra12345678"));
});

test("gift card: copertura parziale, ripristino all'annullo, copertura totale", async () => {
  const partial = await issueGiftCard({ amountCents: 1000 });
  const cart = await newCart(1);
  await attachGiftCard(cart.id, partial.code);
  const placed = await placeOrder((await getCartByToken(cart.token))!, await pickupInput());
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  assert.equal(order.giftCardCents, 1000);
  assert.equal(order.status, "CONFIRMED");
  assert.equal(order.paymentStatus, "PENDING");
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: partial.id } })).balanceCents, 0);
  assert.equal(await prisma.giftCardTransaction.count({ where: { giftCardId: partial.id, reason: "REDEEM" } }), 1);
  await transitionOrder(order.id, "CANCELLED", "test@admin");
  assert.equal((await prisma.giftCard.findUniqueOrThrow({ where: { id: partial.id } })).balanceCents, 1000);
  assert.equal(
    await prisma.giftCardTransaction.count({ where: { giftCardId: partial.id, reason: "REFUND", reference: placed.code } }),
    1
  );

  const full = await issueGiftCard({ amountCents: 100_000 });
  const fullCart = await newCart(1);
  await attachGiftCard(fullCart.id, full.code);
  const fullPlaced = await placeOrder((await getCartByToken(fullCart.token))!, await pickupInput());
  const fullOrder = await prisma.order.findUniqueOrThrow({ where: { code: fullPlaced.code } });
  assert.equal(fullOrder.status, "PAID");
  assert.equal(fullOrder.paymentMethod, "gift_card");
  assert.equal(fullOrder.giftCardCents, fullOrder.totalCents);
});

test("referral: anti-abuso e premio solo a ordine pagato e consegnato", async () => {
  const referrerId = await registerAccount("ref-a@example.com", "Ref", "A");
  const invitedId = await registerAccount("ref-b@example.com", "Inv", "B");
  const referrer = await prisma.customer.findUniqueOrThrow({ where: { id: referrerId } });

  await linkReferralOnSignup(invitedId, "ref-b@example.com", referrer.referralCode!);
  const referral = await prisma.referral.findUniqueOrThrow({ where: { invitedCustomerId: invitedId } });
  assert.equal(referral.status, "SIGNED_UP");
  assert.equal(await prisma.discountCode.count({ where: { customerId: invitedId } }), 1);

  await linkReferralOnSignup(referrerId, referrer.email, referrer.referralCode!);
  await linkReferralOnSignup(invitedId, "ref-b@example.com", referrer.referralCode!);
  await linkReferralOnSignup(invitedId, "r.e.f-a+alias@example.com", referrer.referralCode!);
  assert.equal(await prisma.referral.count({ where: { referrerId } }), 1);

  const placed = await placeOrder(await newCart(1), await pickupInput({ email: "ref-b@example.com", firstName: "Inv", lastName: "B" }), {
    authenticatedCustomerId: invitedId
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  await recordManualPayment(order.id, "test@admin", `verify:${placed.code}`);
  assert.equal((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).status, "SIGNED_UP");
  await transitionOrder(order.id, "PROCESSING", "test@admin");
  await transitionOrder(order.id, "READY", "test@admin");
  await transitionOrder(order.id, "DELIVERED", "test@admin");
  assert.equal((await prisma.referral.findUniqueOrThrow({ where: { id: referral.id } })).status, "REDEEMED");
  assert.equal(await prisma.discountCode.count({ where: { customerId: referrerId } }), 1);
});

test("account: verifica e cambio email, preferenze, annullo, export e cancellazione GDPR", async () => {
  // Account storico non ancora verificato (prima della registrazione via link).
  const legacy = await prisma.customer.create({
    data: { email: "acct-ent@example.com", firstName: "Enter", lastName: "Prise", passwordHash: "x", emailVerified: false }
  });
  const verification = await sendVerificationEmail(legacy.id);
  assert.ok(verification);
  const verifyToken = new URL(verification.link).searchParams.get("token")!;
  await consumeCustomerToken(verifyToken);
  assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } })).emailVerified, true);
  await assertDomainError(consumeCustomerToken(verifyToken));

  const newEmail = "acct-ent-2@example.com";
  const change = await requestEmailChange(legacy.id, newEmail);
  await consumeCustomerToken(new URL(change.link).searchParams.get("token")!);
  let customer = await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.equal(customer.email, newEmail);

  await prisma.customer.update({ where: { id: legacy.id }, data: { preferredLocationId: otherLocationId, preferredFulfillment: "DELIVERY" } });
  assert.equal(await getEffectiveFulfillmentPreference(legacy.id), "DELIVERY");

  const before = await stockOf(storeVariantId);
  const placed = await placeOrder(await newCart(2), await pickupInput({ email: newEmail, firstName: "Enter", lastName: "Prise" }), {
    authenticatedCustomerId: legacy.id
  });
  const order = await prisma.order.findUniqueOrThrow({ where: { code: placed.code } });
  // Ordine in corso: i dati servono per evaderlo, la cancellazione aspetta.
  await assertDomainError(deleteCustomerAccount(legacy.id));
  await transitionOrder(order.id, "CANCELLED", newEmail, { note: "Annullato dal cliente (test).", cancelReason: "CUSTOMER" });
  assert.equal(await stockOf(storeVariantId), before);

  const exported = await exportCustomerData(legacy.id);
  assert.equal(exported.profile.email, newEmail);
  assert.equal(exported.orders.length, 1);
  assert.equal(exported.orders[0]!.items.length, 1);

  await deleteCustomerAccount(legacy.id);
  customer = await prisma.customer.findUniqueOrThrow({ where: { id: legacy.id } });
  const anonymized = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  assert.notEqual(customer.anonymizedAt, null);
  assert.equal(customer.passwordHash, null);
  assert.ok(customer.email.endsWith(".invalid"));
  assert.equal(anonymized.customerId, null);
  assert.ok(anonymized.email.endsWith(".invalid"));
  assert.equal(anonymized.shipFullName, "Cliente anonimizzato");
  await assertDomainError(exportCustomerData(legacy.id));
});

test("2FA TOTP: conferma, anti-replay, backup code monouso, disattivazione", async () => {
  const customerId = await registerAccount("acct-2fa@example.com", "Due", "Fattori");
  const { secret } = await startTotpEnrollment(customerId);
  await assertDomainError(confirmTotpEnrollment(customerId, "000000"));
  const step = currentTotpStep();
  assert.notEqual(verifyTotpCode(secret, totpCodeFor(secret, step)), null);
  const backupCodes = await confirmTotpEnrollment(customerId, totpCodeFor(secret, step));
  assert.equal(backupCodes.length, 10);
  assert.notEqual((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).totpEnabledAt, null);

  assert.equal(await verifySecondFactor(customerId, totpCodeFor(secret, step)), false);
  assert.equal(await verifySecondFactor(customerId, totpCodeFor(secret, step + 1)), true);
  assert.equal(await verifySecondFactor(customerId, backupCodes[0]!), true);
  assert.equal(await verifySecondFactor(customerId, backupCodes[0]!), false);

  await disableTotp(customerId, backupCodes[1]!);
  const after = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  assert.equal(after.totpSecret, null);
  assert.equal(after.totpEnabledAt, null);
  assert.equal(await prisma.customerBackupCode.count({ where: { customerId } }), 0);
});

test("outbox email: un lotto reclamato e inviato senza collisioni di lock", async () => {
  // Le email accodate dagli altri test restano fuori dal lotto.
  await prisma.emailMessage.updateMany({ where: { status: "QUEUED" }, data: { nextAttemptAt: new Date(Date.now() + 86_400_000) } });
  const recipients = ["queue-batch-1@example.invalid", "queue-batch-2@example.invalid", "queue-batch-3@example.invalid"];
  await prisma.emailMessage.createMany({
    data: recipients.map((toEmail, index) => ({
      toEmail,
      subject: `Test coda ${index + 1}`,
      body: encryptSensitiveValue("Contenuto di test senza dati reali."),
      type: "SECURITY_LOGIN",
      status: "QUEUED",
      nextAttemptAt: new Date(0)
    }))
  });
  const result = await processEmailQueue({ limit: 3 });
  assert.equal(result.claimed, 3);
  assert.equal(result.sent, 3);
  assert.equal(await prisma.emailMessage.count({ where: { toEmail: { in: recipients }, status: "SENT", lockToken: null } }), 3);
});
