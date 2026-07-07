/**
 * Test d'integrazione dei flussi critici multi-sede.
 * Gira contro dev.db; ripulisce i dati che crea.
 * Uso: npx tsx prisma/verify-flow.ts
 */
import { PrismaClient } from "@prisma/client";
import { placeOrder } from "@/lib/services/checkout";
import { getCartByToken, getOrCreateCartForLocation, addItemToCart } from "@/lib/services/cart";
import { checkDiscount } from "@/lib/services/discounts";
import { transitionOrder } from "@/lib/services/orders";
import { DomainError } from "@/lib/domain";
import { effectivePrice } from "@/lib/services/catalog";
import {
  consumeResetToken,
  createResetToken,
  listCustomerOrders,
  registerCustomer
} from "@/lib/services/customer-account";
import { verifyPassword } from "@/lib/auth/password";
import { attachGiftCard } from "@/lib/services/cart";
import { issueGiftCard } from "@/lib/services/giftcards";
import { linkReferralOnSignup } from "@/lib/services/referral";
import { isStripeConfigured } from "@/lib/payments";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

const BASE = {
  email: "test-verify@example.com",
  firstName: "Mario",
  lastName: "Rossi",
  phone: "0810000000",
  paymentMethod: "cash_on_pickup" as const,
  marketingOptIn: false,
  fulfillmentType: "PICKUP" as const,
  fulfillmentAt: "2030-01-01T10:00"
};

async function main() {
  console.log("Verifica flussi critici multi-sede\n");

  const ottaviano = await prisma.location.findUnique({ where: { slug: "ottaviano" } });
  const merlata = await prisma.location.findUnique({ where: { slug: "merlata-bloom" } });
  if (!ottaviano || !merlata) throw new Error("Sedi non trovate: esegui il seed.");

  // StoreVariant di una colomba (categoria box-regalo) a Ottaviano, con stock.
  const sv = await prisma.storeVariant.findFirst({
    where: { locationId: ottaviano.id, isAvailable: true, stockQty: { gt: 5 }, variant: { sku: "COL-1KG-CLA" } },
    include: { variant: { include: { product: true } } }
  });
  if (!sv) throw new Error("StoreVariant colomba a Ottaviano non trovato.");
  const unit = effectivePrice(sv.priceCentsOverride, sv.variant.basePriceCents);
  const startStock = sv.stockQty;
  const token = `verify-${sv.id.slice(0, 8)}`;

  // ---- 1. Ordine base (ritiro) + scarico stock sede + ledger ----
  console.log("1. Ordine base (ritiro in sede)");
  const cart = await getOrCreateCartForLocation(token, ottaviano.id);
  await addItemToCart(cart.id, sv.id, 2);
  const fresh = await getCartByToken(token);
  const placed = await placeOrder(fresh!, BASE);
  check("ordine creato", Boolean(placed.code));
  const order = await prisma.order.findUnique({ where: { code: placed.code }, include: { items: true } });
  check("sede e modalità salvate", order!.locationId === ottaviano.id && order!.fulfillmentType === "PICKUP");
  check("spedizione 0 per ritiro", order!.shippingCents === 0);
  const afterStock = (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty;
  check("stock sede scalato di 2", afterStock === startStock - 2);
  const mov = await prisma.stockMovement.count({ where: { storeVariantId: sv.id, reference: placed.code } });
  check("movimento magazzino sede registrato", mov === 1);
  check("totale coerente", order!.totalCents === order!.subtotalCents - order!.discountCents + order!.shippingCents);

  // ---- 2. Idempotenza anti-doppio ordine ----
  console.log("2. Idempotenza");
  let doubleBlocked = false;
  try {
    await placeOrder(fresh!, BASE);
  } catch (e) {
    doubleBlocked = e instanceof DomainError;
  }
  check("secondo placeOrder bloccato", doubleBlocked);
  check("stock non scalato due volte", (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty === startStock - 2);

  // ---- 3. Anti-oversell per sede ----
  console.log("3. Anti-oversell");
  const cur = (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty;
  const token2 = `verify-os-${sv.id.slice(0, 8)}`;
  const cart2 = await getOrCreateCartForLocation(token2, ottaviano.id);
  await addItemToCart(cart2.id, sv.id, 1);
  await prisma.cartItem.updateMany({ where: { cartId: cart2.id }, data: { qty: cur + 10 } });
  const fresh2 = await getCartByToken(token2);
  let oversellBlocked = false;
  try {
    await placeOrder(fresh2!, BASE);
  } catch (e) {
    oversellBlocked = e instanceof DomainError;
  }
  check("ordine oltre stock rifiutato", oversellBlocked);
  check("stock invariato dopo rifiuto", (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty === cur);

  // ---- 3b. Concorrenza: due checkout simultanei, un solo stock disponibile ----
  console.log("3b. Concorrenza su stock singolo");
  const raceStockBefore = (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty;
  await prisma.storeVariant.update({ where: { id: sv.id }, data: { stockQty: 1 } });
  const tokenRaceA = `verify-race-a-${sv.id.slice(0, 6)}`;
  const tokenRaceB = `verify-race-b-${sv.id.slice(0, 6)}`;
  const cartRaceA = await getOrCreateCartForLocation(tokenRaceA, ottaviano.id);
  const cartRaceB = await getOrCreateCartForLocation(tokenRaceB, ottaviano.id);
  await addItemToCart(cartRaceA.id, sv.id, 1);
  await addItemToCart(cartRaceB.id, sv.id, 1);
  const [freshRaceA, freshRaceB] = await Promise.all([getCartByToken(tokenRaceA), getCartByToken(tokenRaceB)]);
  const race = await Promise.allSettled([
    placeOrder(freshRaceA!, { ...BASE, email: "race-a@example.com" }),
    placeOrder(freshRaceB!, { ...BASE, email: "race-b@example.com" })
  ]);
  check("un solo checkout simultaneo completa", race.filter((r) => r.status === "fulfilled").length === 1);
  check("un checkout simultaneo viene respinto", race.filter((r) => r.status === "rejected").length === 1);
  check("stock non va mai sotto zero", (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty === 0);
  const raceEmails = ["race-a@example.com", "race-b@example.com"];
  const raceOrders = await prisma.order.findMany({ where: { email: { in: raceEmails } }, select: { id: true } });
  await prisma.discountRedemption.deleteMany({ where: { orderId: { in: raceOrders.map((o) => o.id) } } });
  await prisma.emailMessage.deleteMany({ where: { toEmail: { in: raceEmails } } });
  await prisma.order.deleteMany({ where: { email: { in: raceEmails } } });
  await prisma.customer.deleteMany({ where: { email: { in: raceEmails } } });
  await prisma.storeVariant.update({ where: { id: sv.id }, data: { stockQty: raceStockBefore } });

  // ---- 3c. Pagamento esterno non inizializzato: ordine annullato + stock rilasciato ----
  console.log("3c. Fallimento pagamento e rilascio stock");
  if (!isStripeConfigured()) {
    const failStockBefore = (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty;
    const tokenPayFail = `verify-payfail-${sv.id.slice(0, 6)}`;
    const cartPayFail = await getOrCreateCartForLocation(tokenPayFail, ottaviano.id);
    await addItemToCart(cartPayFail.id, sv.id, 1);
    const freshPayFail = await getCartByToken(tokenPayFail);
    const placedFail = await placeOrder(freshPayFail!, { ...BASE, email: "payment-fail@example.com", paymentMethod: "card" });
    const failOrder = await prisma.order.findUnique({ where: { code: placedFail.code } });
    check("fallimento init pagamento tracciato", Boolean(placedFail.paymentInitError));
    check("ordine fallito viene annullato", failOrder!.status === "CANCELLED" && failOrder!.paymentStatus === "FAILED");
    check("stock rilasciato dopo pagamento non inizializzato", (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty === failStockBefore);
    await prisma.emailMessage.deleteMany({ where: { toEmail: "payment-fail@example.com" } });
    await prisma.order.deleteMany({ where: { email: "payment-fail@example.com" } });
    await prisma.customer.deleteMany({ where: { email: "payment-fail@example.com" } });
  } else {
    check("test fallimento Stripe locale saltato: Stripe configurato", true);
  }

  // ---- 4. Macchina a stati (percorso ritiro) + restock su annullo ----
  console.log("4. Transizioni ritiro + restock");
  await transitionOrder(order!.id, "PAID", "test@admin");
  await transitionOrder(order!.id, "PROCESSING", "test@admin");
  await transitionOrder(order!.id, "READY", "test@admin");
  check("PENDING → PAID → PROCESSING → READY ok", (await prisma.order.findUnique({ where: { id: order!.id } }))!.status === "READY");
  let illegal = false;
  try {
    await transitionOrder(order!.id, "SHIPPED", "test@admin"); // da READY non ammesso
  } catch (e) {
    illegal = e instanceof DomainError;
  }
  check("READY → SHIPPED bloccato", illegal);
  await transitionOrder(order!.id, "CANCELLED", "test@admin", { note: "test" });
  check("stock ricaricato su annullo", (await prisma.storeVariant.findUnique({ where: { id: sv.id } }))!.stockQty === cur + 2);

  // ---- 5. Sconto scoped per categoria (BOXREGALO20 su box-regalo) ----
  console.log("5. Sconto per categoria");
  const token3 = `verify-cat-${sv.id.slice(0, 8)}`;
  const cart3 = await getOrCreateCartForLocation(token3, ottaviano.id);
  await addItemToCart(cart3.id, sv.id, 1);
  const evalCat = await checkDiscount("BOXREGALO20", {
    locationId: ottaviano.id,
    subtotalCents: unit,
    lines: [{ productId: sv.variant.productId, categoryId: sv.variant.product.categoryId, lineCents: unit }]
  });
  check("BOXREGALO20 valido su box-regalo", evalCat.ok && evalCat.amountCents === Math.round(unit * 0.2));

  // ---- 6. Sconto scoped per SEDE errata (BABAMERLATA15 a Ottaviano) ----
  console.log("6. Sconto vincolato a sede");
  const evalWrong = await checkDiscount("BABAMERLATA15", {
    locationId: ottaviano.id,
    subtotalCents: unit,
    lines: [{ productId: sv.variant.productId, categoryId: sv.variant.product.categoryId, lineCents: unit }]
  });
  check("BABAMERLATA15 rifiutato fuori Merlata", !evalWrong.ok);

  // ---- 7. Prodotto non disponibile in una sede (delizia solo Ottaviano) ----
  console.log("7. Assortimento per sede");
  const deliziaMerlata = await prisma.storeVariant.findFirst({
    where: { locationId: merlata.id, variant: { sku: "DEL-BOX-4" } }
  });
  check("delizia NON presente a Merlata (esclusiva Ottaviano)", deliziaMerlata === null);

  // ---- 8. Account cliente: registrazione, collegamento ordine, reset ----
  console.log("8. Account clienti");
  const accEmail = "account-test@example.com";
  const custId = await registerCustomer({
    email: accEmail,
    password: "passwordlunga1",
    firstName: "Anna",
    lastName: "Verdi",
    marketingOptIn: false
  });
  check("registrazione crea account con referralCode", Boolean(custId));
  const withCode = await prisma.customer.findUnique({ where: { id: custId } });
  check("referralCode generato", Boolean(withCode?.referralCode));

  // Ordine con la stessa email → deve collegarsi all'account
  const tokenA = `verify-acc-${sv.id.slice(0, 8)}`;
  const cartA = await getOrCreateCartForLocation(tokenA, ottaviano.id);
  await addItemToCart(cartA.id, sv.id, 1);
  const freshA = await getCartByToken(tokenA);
  const placedA = await placeOrder(freshA!, { ...BASE, email: accEmail, firstName: "Anna", lastName: "Verdi" });
  const orderA = await prisma.order.findUnique({ where: { code: placedA.code } });
  check("ordine collegato all'account (customerId)", orderA!.customerId === custId);
  check("data/ora richiesta salvata sull'ordine", orderA!.fulfillmentAt !== null);
  const custOrders = await listCustomerOrders(custId);
  check("storico ordini del cliente popolato", custOrders.some((o) => o.code === placedA.code));
  check("email di conferma accodata", (await prisma.emailMessage.count({ where: { reference: placedA.code, type: "ORDER_CONFIRMATION" } })) === 1);

  // Reset password
  const resetToken = await createResetToken(accEmail);
  check("token di reset creato", Boolean(resetToken));
  await consumeResetToken(resetToken!, "nuovapassword9");
  const afterReset = await prisma.customer.findUnique({ where: { id: custId } });
  check("password reimpostata correttamente", verifyPassword("nuovapassword9", afterReset!.passwordHash!));
  let reused = false;
  try {
    await consumeResetToken(resetToken!, "altra12345");
  } catch (e) {
    reused = e instanceof DomainError;
  }
  check("token di reset non riutilizzabile", reused);

  // Pulizia account test
  const accOrders = await prisma.order.findMany({ where: { email: accEmail }, select: { id: true } });
  await prisma.discountRedemption.deleteMany({ where: { orderId: { in: accOrders.map((o) => o.id) } } });
  await prisma.emailMessage.deleteMany({ where: { toEmail: accEmail } });
  await prisma.order.deleteMany({ where: { email: accEmail } });
  await prisma.customer.deleteMany({ where: { email: accEmail } });

  // ---- 9. Gift card: applicazione parziale e copertura totale ----
  console.log("9. Gift card");
  const gcEmail = "gift-test@example.com";
  const gc = await issueGiftCard({ amountCents: 1000 }); // 10€ su colomba (35€) → parziale
  const tokenG = `verify-gc-${sv.id.slice(0, 8)}`;
  const cartG = await getOrCreateCartForLocation(tokenG, ottaviano.id);
  await addItemToCart(cartG.id, sv.id, 1);
  await attachGiftCard(cartG.id, gc.code);
  const freshG = await getCartByToken(tokenG);
  const placedG = await placeOrder(freshG!, { ...BASE, email: gcEmail });
  const orderG = await prisma.order.findUnique({ where: { code: placedG.code } });
  check("gift card applicata (min saldo)", orderG!.giftCardCents === 1000);
  check("ordine parziale resta da pagare", orderG!.status === "PENDING_PAYMENT");
  const gcAfter = await prisma.giftCard.findUnique({ where: { id: gc.id } });
  check("saldo gift card azzerato", gcAfter!.balanceCents === 0);
  check("movimento REDEEM registrato", (await prisma.giftCardTransaction.count({ where: { giftCardId: gc.id, reason: "REDEEM" } })) === 1);

  // Copertura totale
  const gc2 = await issueGiftCard({ amountCents: 100000 }); // 1000€
  const tokenG2 = `verify-gc2-${sv.id.slice(0, 8)}`;
  const cartG2 = await getOrCreateCartForLocation(tokenG2, ottaviano.id);
  await addItemToCart(cartG2.id, sv.id, 1);
  await attachGiftCard(cartG2.id, gc2.code);
  const freshG2 = await getCartByToken(tokenG2);
  const placedG2 = await placeOrder(freshG2!, { ...BASE, email: gcEmail });
  const orderG2 = await prisma.order.findUnique({ where: { code: placedG2.code } });
  check("gift card copre tutto → ordine PAID", orderG2!.status === "PAID" && orderG2!.paymentMethod === "gift_card");
  check("gift card = totale ordine", orderG2!.giftCardCents === orderG2!.totalCents);

  // ---- 10. Referral: collegamento, anti-abuso, conversione ----
  console.log("10. Referral");
  const refAId = await registerCustomer({ email: "ref-a@example.com", password: "passwordlunga1", firstName: "Ref", lastName: "A", marketingOptIn: false });
  const refA = await prisma.customer.findUnique({ where: { id: refAId } });
  const refBId = await registerCustomer({ email: "ref-b@example.com", password: "passwordlunga1", firstName: "Inv", lastName: "B", marketingOptIn: false });

  await linkReferralOnSignup(refBId, "ref-b@example.com", refA!.referralCode!);
  const referral = await prisma.referral.findUnique({ where: { invitedCustomerId: refBId } });
  check("referral creato SIGNED_UP", referral?.status === "SIGNED_UP");
  check("sconto benvenuto amico emesso", (await prisma.discountCode.count({ where: { customerId: refBId } })) === 1);

  // Anti-abuso: auto-invito e doppio invito non creano referral extra
  await linkReferralOnSignup(refAId, refA!.email, refA!.referralCode!);
  await linkReferralOnSignup(refBId, "ref-b@example.com", refA!.referralCode!);
  check("auto/doppio invito bloccati", (await prisma.referral.count({ where: { referrerId: refAId } })) === 1);

  // Conversione al primo ordine dell'invitato → ricompensa al referrer
  const tokenR = `verify-ref-${sv.id.slice(0, 8)}`;
  const cartR = await getOrCreateCartForLocation(tokenR, ottaviano.id);
  await addItemToCart(cartR.id, sv.id, 1);
  const freshR = await getCartByToken(tokenR);
  await placeOrder(freshR!, { ...BASE, email: "ref-b@example.com", firstName: "Inv", lastName: "B" });
  const refConv = await prisma.referral.findUnique({ where: { id: referral!.id } });
  check("referral convertito REDEEMED", refConv?.status === "REDEEMED");
  check("ricompensa referrer emessa", (await prisma.discountCode.count({ where: { customerId: refAId } })) === 1);

  // Pulizia gift/referral
  const gcRefEmails = [gcEmail, "ref-a@example.com", "ref-b@example.com"];
  const gcRefCustomers = await prisma.customer.findMany({ where: { email: { in: gcRefEmails } }, select: { id: true } });
  const gcRefCustomerIds = gcRefCustomers.map((c) => c.id);
  const gcRefOrders = await prisma.order.findMany({ where: { email: { in: gcRefEmails } }, select: { id: true } });
  await prisma.discountRedemption.deleteMany({ where: { orderId: { in: gcRefOrders.map((o) => o.id) } } });
  await prisma.emailMessage.deleteMany({ where: { toEmail: { in: gcRefEmails } } });
  await prisma.referral.deleteMany({ where: { referrerId: { in: gcRefCustomerIds } } });
  await prisma.order.deleteMany({ where: { email: { in: gcRefEmails } } });
  await prisma.discountCode.deleteMany({ where: { customerId: { in: gcRefCustomerIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: gcRefCustomerIds } } });
  await prisma.giftCard.deleteMany({ where: { id: { in: [gc.id, gc2.id] } } });

  // ---- Pulizia ----
  console.log("\nPulizia dati di test…");
  await prisma.cart.deleteMany({ where: { token: { startsWith: "verify-" } } });
  await prisma.emailMessage.deleteMany({ where: { toEmail: BASE.email } });
  const testOrders = await prisma.order.findMany({ where: { email: BASE.email }, select: { id: true } });
  await prisma.discountRedemption.deleteMany({ where: { orderId: { in: testOrders.map((o) => o.id) } } });
  await prisma.order.deleteMany({ where: { email: BASE.email } });
  await prisma.customer.deleteMany({ where: { email: BASE.email } });
  await prisma.storeVariant.update({ where: { id: sv.id }, data: { stockQty: startStock } });
  await prisma.stockMovement.deleteMany({ where: { storeVariantId: sv.id, reason: { in: ["ORDER", "CANCEL_RESTOCK"] } } });

  console.log(`\nRisultato: ${passed} passati, ${failed} falliti`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
