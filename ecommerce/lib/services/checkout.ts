import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { DomainError } from "@/lib/domain";
import { formatCents } from "@/lib/money";
import { formatRomeAppointment, romeDateKey } from "@/lib/datetime";
import { effectivePrice } from "@/lib/services/catalog";
import type { CartWithItems } from "@/lib/services/cart";
import { evaluateDiscount } from "@/lib/services/discounts";
import { checkGiftCard, giftCardApplicable, redeemGiftCardInTx } from "@/lib/services/giftcards";
import { allowedShippingScopes, getQuotedRate } from "@/lib/services/shipping";
import { isStripeConfigured, providerForMethod } from "@/lib/payments";
import { enqueueEmailInTx, enqueueEmail } from "@/lib/services/email";
import { allocateReferralCodeInTx } from "@/lib/services/referral";
import { initializeOrderPayment } from "@/lib/services/payment-attempts";
import { serializableTransaction } from "@/lib/services/transaction";
import { stockReservationExpiry, stripePayableAmountCents } from "@/lib/payments/reservation-policy";
import { parseCheckoutIdempotencyKey } from "@/lib/commerce/checkout-idempotency";
import { assessCheckoutVelocity, DEFAULT_CHECKOUT_VELOCITY } from "@/lib/commerce/fraud";
import { bankTransferReservationExpiry, checkPaymentMethod } from "@/lib/commerce/checkout-policy";
import { computeIncludedTax } from "@/lib/commerce/tax";
import type { InvoiceData } from "@/lib/commerce/italian-tax-ids";
import { safeErrorMetadata } from "@/lib/safe-log";
import { recordOperationalError } from "@/lib/observability";
import { getCheckoutPolicy, getOpsRecipients } from "@/lib/services/commerce-settings";
import { productLeadMinutes, reserveSlotInTx } from "@/lib/services/fulfillment-slots";
import { checkoutBlockedReason } from "@/lib/services/launch-readiness";
import { orderConfirmationMessage, storeNewOrderMessage, trackingUrl, type MessageOrder } from "@/lib/services/order-messages";
import type { CheckoutFormInput } from "@/lib/validation";
import { prisma } from "@/lib/db";

export type CheckoutInput = CheckoutFormInput;

export type PlacedOrder = {
  code: string;
  publicToken: string;
  totalCents: number;
  paymentInstructions: string | null;
  redirectUrl: string | null;
  paymentInitError: string | null;
  /** true se la richiesta era un ritentativo di un ordine già creato (stessa chiave). */
  replayed: boolean;
};

export type CheckoutContext = {
  /** Deriva esclusivamente dalla sessione server, mai dal FormData. */
  authenticatedCustomerId?: string | null;
  /** Ordini conclusi di recente dalla stessa rete (dal rate limiter). */
  recentOrdersFromIp?: number;
  now?: Date;
};

const txCartInclude = {
  location: true,
  discountCode: { include: { locations: true, categories: true, products: true } },
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      storeVariant: { include: { variant: { include: { product: true } } } }
    }
  }
} satisfies Prisma.CartInclude;

type CheckoutOrderRow = { id: string; code: string; publicToken: string; totalCents: number; giftCardCents: number; status: string; paymentProvider: string };

const replaySelect = {
  id: true,
  code: true,
  publicToken: true,
  totalCents: true,
  giftCardCents: true,
  status: true,
  paymentProvider: true
} satisfies Prisma.OrderSelect;

/**
 * I nonce di checkout senza ordine (tentativi falliti/ritirati) non servono
 * oltre la finestra di retry: vengono ripuliti dal job email orario per non
 * far crescere la tabella all'infinito. I nonce con ordine collegato restano
 * (servono all'idempotenza) e seguono il ciclo di vita dell'ordine via FK.
 */
export async function pruneCheckoutNonces(): Promise<number> {
  const result = await prisma.checkoutNonce.deleteMany({
    where: {
      orderId: null,
      createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60_000) }
    }
  });
  return result.count;
}

/**
 * Codice ordine leggibile da una SEQUENCE PostgreSQL: nextval non partecipa
 * alla transazione, quindi due checkout concorrenti non si contendono più la
 * stessa riga (prima OrderCounter generava abort SERIALIZABLE a catena).
 * L'anno e quello di Roma, non dell'orologio UTC della lambda.
 */
async function nextOrderCodeInTx(tx: Prisma.TransactionClient, now: Date): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('"order_number_seq"') AS value`;
  const sequence = Number(rows[0]?.value ?? 0);
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw new Error("ORDER_SEQUENCE_UNAVAILABLE");
  return `SES-${romeDateKey(now).slice(0, 4)}-${String(sequence).padStart(6, "0")}`;
}

/** Ordine già creato con questa chiave di checkout (ritentativo dopo risposta persa). */
export async function findOrderForCheckoutKey(rawKey: string | undefined | null): Promise<CheckoutOrderRow | null> {
  const key = parseCheckoutIdempotencyKey(rawKey ?? undefined);
  if (!key) return null;
  const nonce = await prisma.checkoutNonce.findUnique({ where: { key }, include: { order: { select: replaySelect } } });
  return nonce?.order ?? null;
}

/** Riprende un ordine già creato con la stessa chiave: niente duplicati, stesso pagamento. */
export async function resumeCheckoutOrder(order: CheckoutOrderRow): Promise<PlacedOrder> {
  let redirectUrl: string | null = null;
  let paymentInitError: string | null = null;
  // Carta ancora da pagare: si riusa la sessione Stripe aperta (stesso tentativo).
  if (order.status === "PENDING_PAYMENT" && order.paymentProvider === "stripe" && order.totalCents - order.giftCardCents > 0) {
    try {
      const launch = await initializeOrderPayment(order.id);
      redirectUrl = launch.redirectUrl;
      paymentInitError = launch.error;
    } catch {
      paymentInitError = "Pagamento non inizializzato. Puoi riprovare dalla pagina dell'ordine.";
    }
  }
  return {
    code: order.code,
    publicToken: order.publicToken,
    totalCents: order.totalCents,
    paymentInstructions: null,
    redirectUrl,
    paymentInitError,
    replayed: true
  };
}

function invoiceDataFrom(input: CheckoutInput): InvoiceData | null {
  if (!input.invoiceRequested || !input.invoiceName || !input.invoiceAddress) return null;
  return {
    name: input.invoiceName,
    vatNumber: input.invoiceVatNumber?.replace(/\s+/g, "").replace(/^IT/i, "") ?? null,
    taxCode: input.invoiceTaxCode?.replace(/\s+/g, "").toUpperCase() ?? null,
    sdiCode: input.invoiceSdi?.toUpperCase() ?? (input.invoiceVatNumber && input.invoicePec ? "0000000" : null),
    pec: input.invoicePec?.toLowerCase() ?? null,
    address: input.invoiceAddress
  };
}

/**
 * Cuore del checkout. Unica transazione con tutte le guardie:
 * idempotenza anti-doppio ordine, ricalcolo da DB, fascia con capienza,
 * regole di consegna e pagamento, sconto con consumo atomico, scarico stock
 * anti-oversell, snapshot completo, ledger, email a cliente e sede (outbox).
 */
export async function placeOrder(
  cart: CartWithItems,
  input: CheckoutInput,
  context: CheckoutContext = {}
): Promise<PlacedOrder> {
  const now = context.now ?? new Date();
  const blocked = await checkoutBlockedReason();
  if (blocked) throw new DomainError(blocked, "STORE_NOT_READY");
  const stripeEnabled = isStripeConfigured();
  if (input.paymentMethod === "card" && !stripeEnabled) {
    throw new DomainError("Pagamento con carta temporaneamente non disponibile.");
  }
  const idempotencyKey = parseCheckoutIdempotencyKey(input.checkoutIdempotencyKey);
  const replayOrder = await findOrderForCheckoutKey(idempotencyKey);
  if (replayOrder) return resumeCheckoutOrder(replayOrder);

  const since = new Date(now.getTime() - DEFAULT_CHECKOUT_VELOCITY.emailWindowMinutes * 60_000);
  const recentByEmail = await prisma.order.count({
    where: { email: input.email.toLowerCase(), placedAt: { gte: since }, status: { notIn: ["CANCELLED", "REFUNDED"] } }
  });
  const velocity = assessCheckoutVelocity({
    now: now.getTime(),
    recentByEmail,
    recentByIp: context.recentOrdersFromIp ?? 0,
    ...DEFAULT_CHECKOUT_VELOCITY
  });
  if (!velocity.ok) throw new DomainError(velocity.reason, "VELOCITY_LIMIT");

  const [policy, recipients] = await Promise.all([getCheckoutPolicy(), getOpsRecipients()]);

  const outcome = await serializableTransaction(async (tx) => {
    if (idempotencyKey) {
      // ON CONFLICT DO NOTHING: niente try/catch su errori di vincolo dentro una
      // transazione PostgreSQL (la lascerebbe abortita). Un conflitto con un
      // checkout concorrente non ancora visibile produce un serialization
      // failure (P2034) e il retry vede l'ordine già creato.
      const inserted = await tx.checkoutNonce.createMany({
        data: [{ key: idempotencyKey, cartId: cart.id }],
        skipDuplicates: true
      });
      if (inserted.count === 0) {
        const existing = await tx.checkoutNonce.findUnique({
          where: { key: idempotencyKey },
          include: { order: { select: replaySelect } }
        });
        if (existing?.order) return { replay: existing.order };
        throw new DomainError("Ordine già in elaborazione: attendi qualche secondo e ricarica la pagina.", "CHECKOUT_IN_PROGRESS");
      }
    }

    // 0. Ricarico dal DB dentro la transazione
    const txCart = await tx.cart.findUnique({
      where: { id: cart.id },
      include: txCartInclude,
      relationLoadStrategy: "join"
    });
    if (!txCart) throw new DomainError("Carrello non trovato.");
    if (txCart.status !== "ACTIVE") {
      throw new DomainError("Questo carrello è già stato trasformato in ordine.", "CART_ALREADY_CONVERTED");
    }
    if (txCart.items.length === 0) throw new DomainError("Il carrello è vuoto.");
    const location = txCart.location;
    if (!location.isActive) throw new DomainError("La sede selezionata non è disponibile.");

    // 1. Righe e subtotale dai prezzi effettivi correnti
    for (const item of txCart.items) {
      const sv = item.storeVariant;
      if (!sv.isAvailable || !sv.variant.isActive || sv.variant.product.status !== "ACTIVE") {
        throw new DomainError(`"${sv.variant.product.name}" non è più disponibile in questa sede. Rimuovilo dal carrello.`);
      }
    }
    const priceOf = (item: (typeof txCart.items)[number]) =>
      effectivePrice(item.storeVariant.priceCentsOverride, item.storeVariant.variant.basePriceCents);
    const subtotalCents = txCart.items.reduce((sum, item) => sum + priceOf(item) * item.qty, 0);
    if (subtotalCents <= 0) throw new DomainError("Importo dell'ordine non valido.");
    const products = txCart.items.map((item) => item.storeVariant.variant.product);

    // 2. Identità: un'email digitata non prova il possesso dell'account.
    const email = input.email.toLowerCase();
    const authenticatedCustomer = context.authenticatedCustomerId
      ? await tx.customer.findUnique({ where: { id: context.authenticatedCustomerId } })
      : null;
    if (context.authenticatedCustomerId && (!authenticatedCustomer || authenticatedCustomer.anonymizedAt)) {
      throw new DomainError("Sessione cliente non valida. Accedi di nuovo.", "LOGIN_REQUIRED");
    }
    if (authenticatedCustomer && authenticatedCustomer.email !== email) {
      throw new DomainError("L'email del checkout deve coincidere con quella dell'account autenticato.");
    }
    const consent = input.marketingOptIn
      ? { marketingOptIn: true, marketingConsentAt: now, marketingConsentSource: "checkout", marketingConsentVersion: policy.termsVersion }
      : {};
    let orderCustomer = authenticatedCustomer;
    if (authenticatedCustomer && input.marketingOptIn && !authenticatedCustomer.marketingOptIn) {
      await tx.customer.update({ where: { id: authenticatedCustomer.id }, data: consent });
    }
    if (!authenticatedCustomer) {
      const existingByEmail = await tx.customer.findUnique({ where: { email } });
      if (existingByEmail?.passwordHash && !existingByEmail.anonymizedAt) {
        // Ordini di un account registrato solo con sessione: restano nello
        // storico, annullabili e collegati a codici riservati e referral.
        throw new DomainError(
          "Questa email appartiene a un account Sessa: accedi per completare l'ordine (il carrello resta salvato).",
          "LOGIN_REQUIRED"
        );
      }
      if (existingByEmail && !existingByEmail.anonymizedAt) {
        // Profilo ospite storico: non si muta sulla base della sola email digitata.
        orderCustomer = existingByEmail;
      } else if (!existingByEmail) {
        orderCustomer = await tx.customer.create({
          data: {
            email,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            ...consent,
            referralCode: await allocateReferralCodeInTx(tx, input.firstName)
          }
        });
      }
    }

    const priorOrders = await tx.order.count({
      where: {
        status: { notIn: ["CANCELLED", "REFUNDED"] },
        ...(authenticatedCustomer ? { customerId: authenticatedCustomer.id } : { email })
      }
    });

    // 3. Sconto: valutazione con gating + consumo atomico + riscatto
    const discountLines = txCart.items.map((item) => ({
      productId: item.storeVariant.variant.product.id,
      categoryId: item.storeVariant.variant.product.categoryId,
      lineCents: priceOf(item) * item.qty
    }));
    let discountCents = 0;
    let discountCodeId: string | null = null;
    let discountCodeSnapshot: string | null = null;
    let eligibleLines = txCart.items.map(() => false);
    if (txCart.discountCode) {
      const customerRedemptions = authenticatedCustomer
        ? await tx.discountRedemption.count({
            where: { discountId: txCart.discountCode.id, customerId: authenticatedCustomer.id, reversedAt: null }
          })
        : 0;
      const evaluated = evaluateDiscount(txCart.discountCode, {
        locationId: txCart.locationId,
        subtotalCents,
        lines: discountLines,
        customerId: authenticatedCustomer?.id ?? null,
        isFirstOrder: priorOrders === 0,
        customerRedemptions
      });
      if (!evaluated.ok) {
        throw new DomainError(`Codice sconto non applicabile: ${evaluated.reason} Rimuovilo dal carrello per continuare.`);
      }
      const consumed = await tx.discountCode.updateMany({
        where: {
          id: txCart.discountCode.id,
          isActive: true,
          OR: [{ maxUses: null }, { usedCount: { lt: txCart.discountCode.maxUses ?? 0 } }]
        },
        data: { usedCount: { increment: 1 } }
      });
      if (consumed.count === 0) {
        throw new DomainError("Il codice sconto è appena terminato. Rimuovilo o riprova con un altro codice.");
      }
      discountCents = evaluated.amountCents;
      discountCodeId = txCart.discountCode.id;
      discountCodeSnapshot = txCart.discountCode.code;
      eligibleLines = evaluated.eligibleLines;
    }

    // 4. Evasione: fascia (ritiro o consegna locale) o spedizione nazionale
    const extraLeadMinutes = productLeadMinutes(products);
    let shippingCents = 0;
    let shippingMethodName = "Ritiro in sede";
    let fulfillmentAt: Date | null = null;
    let ship = {
      shipFullName: "",
      shipLine1: "",
      shipLine2: null as string | null,
      shipCity: "",
      shipProvince: "",
      shipPostalCode: "",
      shipCountry: "IT"
    };
    if (input.fulfillmentType === "DELIVERY") {
      if (!location.deliveryEnabled) throw new DomainError("Questa sede non effettua consegne a domicilio.");
      if (!input.line1 || !input.city || !input.province || !input.postalCode || !input.shippingRateId) {
        throw new DomainError("Dati di consegna incompleti.");
      }
      const country = (input.country ?? "IT").toUpperCase();
      const rate = await getQuotedRate(input.shippingRateId, country, subtotalCents - discountCents, tx);
      if (!rate) throw new DomainError("Metodo di consegna non valido.");
      const scopes = allowedShippingScopes({
        allItemsShippable: products.every((product) => product.shippingScope === "NATIONAL"),
        postalCode: input.postalCode,
        localDeliveryPostalCodes: location.localDeliveryPostalCodes
      });
      if (!scopes.has(rate.scope as "LOCAL" | "NATIONAL")) {
        throw new DomainError(
          rate.scope === "LOCAL"
            ? `La consegna del fresco di ${location.name} non raggiunge il CAP ${input.postalCode}. Scegli il ritiro in sede.`
            : "Nel carrello ci sono prodotti freschi che non viaggiano con il corriere: scegli il ritiro o la consegna locale.",
          "SHIPPING_NOT_ALLOWED"
        );
      }
      if (rate.scope === "LOCAL") {
        if (!input.slot) throw new DomainError("Scegli giorno e fascia di consegna.", "SLOT_UNAVAILABLE");
        fulfillmentAt = (await reserveSlotInTx(tx, location, input.slot, extraLeadMinutes, now)).start;
      }
      shippingCents = rate.effectiveCents;
      shippingMethodName = rate.name;
      ship = {
        shipFullName: `${input.firstName} ${input.lastName}`,
        shipLine1: input.line1,
        shipLine2: input.line2 ?? null,
        shipCity: input.city,
        shipProvince: input.province.toUpperCase(),
        shipPostalCode: input.postalCode,
        shipCountry: country
      };
    } else {
      if (!location.pickupEnabled) throw new DomainError("Questa sede non consente il ritiro.");
      if (!input.slot) throw new DomainError("Scegli giorno e fascia di ritiro.", "SLOT_UNAVAILABLE");
      fulfillmentAt = (await reserveSlotInTx(tx, location, input.slot, extraLeadMinutes, now)).start;
    }

    // 5. IVA inclusa: sconto sulle sole righe idonee, spedizione pro quota.
    const tax = computeIncludedTax(
      txCart.items.map((item, index) => ({
        grossCents: priceOf(item) * item.qty,
        taxRateBps: item.storeVariant.variant.product.taxRateBps,
        discountEligible: eligibleLines[index]
      })),
      discountCents,
      shippingCents
    );

    const totalCents = subtotalCents - discountCents + shippingCents;
    if (totalCents <= 0) throw new DomainError("Importo dell'ordine non valido.");

    let previewGiftCents = 0;
    if (txCart.giftCardCode) {
      const previewCard = await tx.giftCard.findUnique({ where: { code: txCart.giftCardCode } });
      const previewCheck = checkGiftCard(previewCard, authenticatedCustomer?.id ?? null);
      if (previewCheck.ok) previewGiftCents = giftCardApplicable(previewCheck.card, totalCents);
    }
    const previewDueCents = totalCents - previewGiftCents;

    // Il cliente conferma l'importo che ha visto: nessun addebito diverso in silenzio.
    if (input.expectedAmountDueCents !== undefined && input.expectedAmountDueCents !== previewDueCents) {
      throw new DomainError(
        `Il totale è cambiato da ${formatCents(input.expectedAmountDueCents)} a ${formatCents(previewDueCents)} (prezzi, disponibilità o codici aggiornati). Controlla il riepilogo e conferma di nuovo.`,
        "TOTAL_CHANGED"
      );
    }
    if (previewDueCents > 0) {
      const rule = checkPaymentMethod({
        method: input.paymentMethod,
        fulfillmentType: input.fulfillmentType,
        amountDueCents: previewDueCents,
        slotStart: fulfillmentAt,
        hasPhone: Boolean(input.phone),
        stripeEnabled,
        now,
        settings: policy
      });
      if (!rule.ok) throw new DomainError(rule.reason, "PAYMENT_METHOD_NOT_ALLOWED");
      if (input.paymentMethod === "card" && !stripePayableAmountCents(previewDueCents)) {
        throw new DomainError(
          "L'importo residuo dopo la gift card è inferiore al minimo carta (€0,50). Aggiungi un prodotto, riduci la gift card o scegli un altro metodo."
        );
      }
    }

    if (orderCustomer && !orderCustomer.referralCode) {
      await tx.customer.update({
        where: { id: orderCustomer.id },
        data: { referralCode: await allocateReferralCodeInTx(tx, orderCustomer.firstName || input.firstName) }
      });
    }

    // 6. Scarico stock per sede (anti-oversell) + ledger
    for (const item of txCart.items) {
      const updated = await tx.storeVariant.updateMany({
        where: { id: item.storeVariantId, stockQty: { gte: item.qty } },
        data: { stockQty: { decrement: item.qty } }
      });
      if (updated.count === 0) {
        throw new DomainError(
          `Disponibilità insufficiente per "${item.storeVariant.variant.product.name} — ${item.storeVariant.variant.name}". Aggiorna la quantità nel carrello.`
        );
      }
    }

    // 7. Codice ordine da sequenza (fuori dalla contesa serializable).
    const code = await nextOrderCodeInTx(tx, now);
    const publicToken = randomBytes(16).toString("hex");

    // 7b. Gift card: riscatto atomico sull'importo dovuto (decremento condizionale).
    let giftCardCents = 0;
    let giftCardCodeSnapshot: string | null = null;
    if (txCart.giftCardCode) {
      const card = await tx.giftCard.findUnique({ where: { code: txCart.giftCardCode } });
      const check = checkGiftCard(card, authenticatedCustomer?.id ?? null);
      if (!check.ok) {
        throw new DomainError("La gift card non è più valida o disponibile. Rimuovila e verifica il codice.");
      }
      const applicable = giftCardApplicable(check.card, totalCents);
      const redeemed = await redeemGiftCardInTx(tx, check.card.id, applicable, code);
      if (redeemed <= 0) {
        throw new DomainError("Il saldo della gift card è cambiato. Ricarica il carrello e riprova.");
      }
      giftCardCents = redeemed;
      giftCardCodeSnapshot = check.card.code;
    }
    const amountDueCents = totalCents - giftCardCents;
    const fullyPaidByGiftCard = amountDueCents <= 0;
    const initialOrderStatus = fullyPaidByGiftCard
      ? "PAID"
      : input.paymentMethod === "cash_on_pickup"
        ? "CONFIRMED"
        : "PENDING_PAYMENT";
    const stockReservationExpiresAt = fullyPaidByGiftCard
      ? null
      : input.paymentMethod === "bank_transfer"
        ? bankTransferReservationExpiry(now, fulfillmentAt, policy)
        : stockReservationExpiry(input.paymentMethod, now);
    const invoice = invoiceDataFrom(input);

    // 8. Ordine con snapshot completo (sede, evasione, prezzi, condizioni)
    const created = await tx.order.create({
      data: {
        code,
        publicToken,
        status: initialOrderStatus,
        locationId: txCart.locationId,
        locationName: location.name,
        fulfillmentType: input.fulfillmentType,
        fulfillmentAt,
        customerId: orderCustomer?.id ?? null,
        email,
        phone: input.phone,
        ...ship,
        subtotalCents,
        discountCents,
        giftCardCents,
        shippingCents,
        taxCents: tax.taxCents,
        totalCents,
        discountCodeId,
        discountCodeSnapshot,
        giftCardCodeSnapshot,
        shippingMethodName,
        paymentProvider: fullyPaidByGiftCard ? "manual" : providerForMethod(input.paymentMethod),
        paymentMethod: fullyPaidByGiftCard ? "gift_card" : input.paymentMethod,
        paymentStatus: fullyPaidByGiftCard ? "PAID" : "PENDING",
        paidAt: fullyPaidByGiftCard ? now : null,
        customerNote: input.customerNote,
        stockReservationExpiresAt,
        invoiceRequested: Boolean(invoice),
        invoiceData: invoice ? JSON.stringify(invoice) : null,
        termsAcceptedAt: now,
        termsVersion: policy.termsVersion,
        items: {
          create: txCart.items.map((item) => ({
            variantId: item.storeVariant.variantId,
            productName: item.storeVariant.variant.product.name,
            variantName: item.storeVariant.variant.name,
            sku: item.storeVariant.variant.sku,
            image: item.storeVariant.variant.product.image ?? null,
            unitCents: priceOf(item),
            qty: item.qty,
            totalCents: priceOf(item) * item.qty,
            taxRateBps: item.storeVariant.variant.product.taxRateBps
          }))
        },
        events: {
          create: {
            type: "CREATED",
            message: `Ordine ricevuto dallo storefront (condizioni ${policy.termsVersion} accettate).`,
            actor: "storefront"
          }
        }
      },
      include: { items: true }
    });

    // 8b. Riscatto sconto (tracciamento + gating per-utente)
    if (discountCodeId) {
      await tx.discountRedemption.create({
        data: {
          discountId: discountCodeId,
          customerId: authenticatedCustomer?.id ?? orderCustomer?.id ?? null,
          orderId: created.id,
          amountCents: discountCents
        }
      });
    }

    // 8c. Evento gift card
    if (giftCardCents > 0) {
      await tx.orderEvent.create({
        data: {
          orderId: created.id,
          type: "PAYMENT",
          message:
            `Gift card ${giftCardCodeSnapshot} applicata: −${formatCents(giftCardCents)}` +
            (fullyPaidByGiftCard ? " (ordine interamente pagato)." : "."),
          actor: "system"
        }
      });
    }

    // 9. Ledger magazzino per sede
    await tx.stockMovement.createMany({
      data: txCart.items.map((item) => ({
        storeVariantId: item.storeVariantId,
        delta: -item.qty,
        reason: "ORDER",
        reference: code,
        actor: "storefront"
      }))
    });

    // 10. Consumo il carrello (condizionale ACTIVE)
    const converted = await tx.cart.updateMany({
      where: { id: txCart.id, status: "ACTIVE" },
      data: { status: "CONVERTED", convertedOrderId: created.id, convertedAt: now }
    });
    if (converted.count === 0) {
      throw new DomainError("Ordine già in corso di elaborazione.", "CART_ALREADY_CONVERTED");
    }
    if (idempotencyKey) {
      await tx.checkoutNonce.updateMany({
        where: { key: idempotencyKey, orderId: null },
        data: { orderId: created.id }
      });
    }

    // 11. Email a cliente e sede accodate DENTRO la transazione (outbox):
    // committano atomicamente con l'ordine, un crash non può perderle.
    const messageOrder: MessageOrder = {
      ...created,
      location: {
        address: location.address,
        city: location.city,
        postalCode: location.postalCode,
        phone: location.phone,
        hours: location.hours
      }
    };
    const confirmation = orderConfirmationMessage(messageOrder);
    await enqueueEmailInTx(tx, {
      toEmail: created.email,
      subject: confirmation.subject,
      body: confirmation.body,
      cta: confirmation.cta,
      type: "ORDER_CONFIRMATION",
      reference: created.code
    });
    const storeRecipient = location.notificationEmail?.trim() || recipients.orders;
    if (storeRecipient) {
      const notice = storeNewOrderMessage({ ...messageOrder, id: created.id });
      await enqueueEmailInTx(tx, {
        toEmail: storeRecipient,
        subject: notice.subject,
        body: notice.body,
        cta: notice.cta,
        type: "STORE_NEW_ORDER",
        reference: created.code
      });
    }

    return { created };
  });

  if ("replay" in outcome && outcome.replay) return resumeCheckoutOrder(outcome.replay);
  const order = outcome.created;

  // Inizializzazione pagamento fuori dalla transazione: PaymentAttempt persiste
  // prima della rete e usa una chiave idempotente stabile.
  const amountDueCents = order.totalCents - order.giftCardCents;
  let paymentInstructions: string | null = null;
  let redirectUrl: string | null = null;
  let paymentInitError: string | null = null;
  if (amountDueCents > 0) {
    try {
      const launch = await initializeOrderPayment(order.id);
      paymentInstructions = launch.instructions;
      redirectUrl = launch.redirectUrl;
      paymentInitError = launch.error;
      // Le coordinate del bonifico viaggiano in un messaggio dedicato; per il
      // pagamento in sede basta la riga nella conferma (niente doppia email).
      if (launch.instructions && order.paymentMethod !== "cash_on_pickup") {
        await enqueueEmail({
          toEmail: order.email,
          subject: `Come completare l'ordine ${order.code} — Sessa 1930`,
          body: `${launch.instructions}${order.stockReservationExpiresAt ? `\n\nL'ordine resta prenotato fino a ${formatRomeAppointment(order.stockReservationExpiresAt)}.` : ""}`,
          cta: { url: trackingUrl(order), label: "Segui il tuo ordine" },
          type: "PAYMENT_INSTRUCTIONS",
          reference: order.code
        }).catch(() => undefined);
      }
    } catch (error) {
      await recordOperationalError({
        level: "ERROR",
        source: "checkout",
        code: "PAYMENT_INITIALIZATION_FAILED",
        message: "Inizializzazione pagamento post-ordine fallita.",
        orderId: order.id,
        entityType: "Order",
        entityId: order.id,
        error,
        metadata: safeErrorMetadata(error)
      });
      paymentInitError = "Pagamento non inizializzato. Puoi riprovare dalla pagina dell'ordine.";
    }
  }

  return {
    code: order.code,
    publicToken: order.publicToken,
    totalCents: order.totalCents,
    paymentInstructions,
    redirectUrl,
    paymentInitError,
    replayed: false
  };
}
