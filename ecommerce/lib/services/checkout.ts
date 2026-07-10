import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { DomainError, type FulfillmentType, type PaymentMethod } from "@/lib/domain";
import { includedTax } from "@/lib/money";
import { effectivePrice } from "@/lib/services/catalog";
import type { CartWithItems } from "@/lib/services/cart";
import { evaluateDiscount } from "@/lib/services/discounts";
import { checkGiftCard, giftCardApplicable, redeemGiftCardInTx } from "@/lib/services/giftcards";
import { getQuotedRate } from "@/lib/services/shipping";
import { isStripeConfigured, providerForMethod } from "@/lib/payments";
import { enqueueEmail } from "@/lib/services/email";
import { maybeConvertReferral } from "@/lib/services/referral";
import { initializeOrderPayment } from "@/lib/services/payment-attempts";
import { serializableTransaction } from "@/lib/services/transaction";
import { formatCents } from "@/lib/money";
import { parseRomeDateTimeLocal } from "@/lib/datetime";

export type CheckoutInput = {
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  fulfillmentType: FulfillmentType;
  fulfillmentAt: string; // datetime-local
  // Solo per la consegna:
  line1?: string;
  line2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  shippingRateId?: string;
  paymentMethod: PaymentMethod;
  customerNote?: string;
  marketingOptIn: boolean;
};

export type PlacedOrder = {
  code: string;
  publicToken: string;
  totalCents: number;
  paymentInstructions: string | null;
  redirectUrl: string | null;
  paymentInitError: string | null;
};

export type CheckoutContext = {
  /** Deriva esclusivamente dalla sessione server, mai dal FormData. */
  authenticatedCustomerId?: string | null;
};

const txCartInclude = {
  location: true,
  discountCode: { include: { locations: true, categories: true, products: true } },
  items: {
    include: {
      storeVariant: { include: { variant: { include: { product: true } } } }
    }
  }
} satisfies Prisma.CartInclude;

function parseSequenceFromCode(code?: string | null): number {
  const match = code?.match(/^SES-\d{4}-(\d{6,})$/);
  return match ? Number(match[1]) || 0 : 0;
}

async function nextOrderSequenceInTx(tx: Prisma.TransactionClient, year: number): Promise<number> {
  const latestOrder = await tx.order.findFirst({
    where: { code: { startsWith: `SES-${year}-` } },
    orderBy: { code: "desc" },
    select: { code: true }
  });
  const latestExistingSequence = parseSequenceFromCode(latestOrder?.code);

  // Upsert nativo (INSERT ... ON CONFLICT): niente try/catch sul conflitto,
  // che su Postgres abortirebbe l'intera transazione (SQLite invece perdonava).
  await tx.orderCounter.upsert({
    where: { year },
    create: { year, value: latestExistingSequence },
    update: {}
  });

  if (latestExistingSequence > 0) {
    await tx.orderCounter.updateMany({
      where: { year, value: { lt: latestExistingSequence } },
      data: { value: latestExistingSequence }
    });
  }

  const counter = await tx.orderCounter.update({
    where: { year },
    data: { value: { increment: 1 } }
  });
  return counter.value;
}

/**
 * Cuore del checkout. Unica transazione con tutte le guardie:
 * idempotenza anti-doppio ordine, ricalcolo da DB, sconto granulare con gating
 * (primo ordine / limite per utente) e consumo atomico, scarico stock per sede
 * anti-oversell, snapshot completo (sede, evasione, prezzi), ledger, riscatto sconto.
 */
export async function placeOrder(
  cart: CartWithItems,
  input: CheckoutInput,
  context: CheckoutContext = {}
): Promise<PlacedOrder> {
  if (input.paymentMethod === "card" && !isStripeConfigured()) {
    throw new DomainError("Pagamento con carta temporaneamente non disponibile.");
  }
  const order = await serializableTransaction(async (tx) => {
    // 0. IDEMPOTENZA + ricarico dal DB
    const txCart = await tx.cart.findUnique({ where: { id: cart.id }, include: txCartInclude });
    if (!txCart) throw new DomainError("Carrello non trovato.");
    if (txCart.status !== "ACTIVE") {
      throw new DomainError("Questo carrello è già stato trasformato in ordine.", "CART_ALREADY_CONVERTED");
    }
    if (txCart.items.length === 0) throw new DomainError("Il carrello è vuoto.");
    if (!txCart.location.isActive) throw new DomainError("La sede selezionata non è disponibile.");

    // 1. Righe e subtotale dai prezzi effettivi correnti
    for (const item of txCart.items) {
      const sv = item.storeVariant;
      if (!sv.isAvailable || !sv.variant.isActive || sv.variant.product.status !== "ACTIVE") {
        throw new DomainError(`"${sv.variant.product.name}" non è più disponibile in questa sede.`);
      }
    }
    const priceOf = (item: (typeof txCart.items)[number]) =>
      effectivePrice(item.storeVariant.priceCentsOverride, item.storeVariant.variant.basePriceCents);
    const subtotalCents = txCart.items.reduce((sum, item) => sum + priceOf(item) * item.qty, 0);
    if (subtotalCents <= 0) throw new DomainError("Importo dell'ordine non valido.");

    // 2. Identita cliente. Un'email digitata non prova il possesso dell'account:
    // profilo, consenso, indirizzi e codici riservati usano solo la sessione server.
    const email = input.email.toLowerCase();
    const authenticatedCustomer = context.authenticatedCustomerId
      ? await tx.customer.findUnique({ where: { id: context.authenticatedCustomerId } })
      : null;
    if (context.authenticatedCustomerId && (!authenticatedCustomer || authenticatedCustomer.anonymizedAt)) {
      throw new DomainError("Sessione cliente non valida. Accedi di nuovo.");
    }
    if (authenticatedCustomer && authenticatedCustomer.email !== email) {
      throw new DomainError("L'email del checkout deve coincidere con quella dell'account autenticato.");
    }
    if (authenticatedCustomer && input.marketingOptIn && !authenticatedCustomer.marketingOptIn) {
      await tx.customer.update({
        where: { id: authenticatedCustomer.id },
        data: { marketingOptIn: true }
      });
    }

    const existingByEmail = authenticatedCustomer
      ? authenticatedCustomer
      : await tx.customer.findUnique({ where: { email } });
    let orderCustomer = authenticatedCustomer;
    if (!authenticatedCustomer && !existingByEmail) {
      orderCustomer = await tx.customer.create({
        data: {
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          marketingOptIn: input.marketingOptIn
        }
      });
    } else if (!authenticatedCustomer && existingByEmail && !existingByEmail.passwordHash) {
      // Anche un profilo guest storico non si muta basandosi sul solo possesso
      // apparente dell'email; l'ordine conserva i propri snapshot.
      orderCustomer = existingByEmail;
    }

    const priorOrders = await tx.order.count({
      where: {
        status: { notIn: ["CANCELLED", "REFUNDED"] },
        ...(authenticatedCustomer ? { customerId: authenticatedCustomer.id } : { email })
      }
    });
    const isFirstOrder = priorOrders === 0;

    // 3. Sconto: valutazione con gating + consumo atomico + riscatto
    let discountCents = 0;
    let discountCodeId: string | null = null;
    let discountCodeSnapshot: string | null = null;
    if (txCart.discountCode) {
      const customerRedemptions = authenticatedCustomer
        ? await tx.discountRedemption.count({
            where: {
              discountId: txCart.discountCode.id,
              customerId: authenticatedCustomer.id,
              reversedAt: null
            }
          })
        : 0;
      const evaluated = evaluateDiscount(txCart.discountCode, {
        locationId: txCart.locationId,
        subtotalCents,
        lines: txCart.items.map((item) => ({
          productId: item.storeVariant.variant.product.id,
          categoryId: item.storeVariant.variant.product.categoryId,
          lineCents: priceOf(item) * item.qty
        })),
        customerId: authenticatedCustomer?.id ?? null,
        isFirstOrder,
        customerRedemptions
      });
      if (!evaluated.ok) {
        throw new DomainError(`Codice sconto non applicabile: ${evaluated.reason}`);
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
        throw new DomainError("Il codice sconto e appena terminato. Rimuovilo o riprova con un altro codice.");
      }
      discountCents = evaluated.amountCents;
      discountCodeId = txCart.discountCode.id;
      discountCodeSnapshot = txCart.discountCode.code;
    }

    // 4. Evasione: ritiro o consegna
    let shippingCents = 0;
    let shippingMethodName = "Ritiro in sede";
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
      if (!txCart.location.deliveryEnabled) {
        throw new DomainError("Questa sede non effettua consegne a domicilio.");
      }
      if (!input.line1 || !input.city || !input.province || !input.postalCode || !input.shippingRateId) {
        throw new DomainError("Dati di consegna incompleti.");
      }
      const country = (input.country ?? "IT").toUpperCase();
      const rate = await getQuotedRate(input.shippingRateId, country, subtotalCents - discountCents, tx);
      if (!rate) throw new DomainError("Metodo di spedizione non valido.");
      shippingCents = rate.effectiveCents;
      shippingMethodName = rate.name;
      ship = {
        shipFullName: `${input.firstName} ${input.lastName}`,
        shipLine1: input.line1,
        shipLine2: input.line2 ?? null,
        shipCity: input.city,
        shipProvince: input.province,
        shipPostalCode: input.postalCode,
        shipCountry: country
      };
      // L'indirizzo resta snapshot dell'ordine. Il salvataggio nel profilo e
      // un'azione esplicita dell'area account, non un side effect del checkout.
    } else {
      if (!txCart.location.pickupEnabled) {
        throw new DomainError("Questa sede non consente il ritiro.");
      }
    }

    // 5. IVA inclusa, scorporata dall'importo scontato
    const discountRatio = subtotalCents > 0 ? discountCents / subtotalCents : 0;
    const taxCents = txCart.items.reduce((sum, item) => {
      const lineGross = priceOf(item) * item.qty;
      const discountedGross = Math.round(lineGross * (1 - discountRatio));
      return sum + includedTax(discountedGross, item.storeVariant.variant.product.taxRateBps);
    }, 0);

    const totalCents = subtotalCents - discountCents + shippingCents;

    // 6. Scarico stock per sede (anti-oversell) + ledger
    for (const item of txCart.items) {
      const updated = await tx.storeVariant.updateMany({
        where: { id: item.storeVariantId, stockQty: { gte: item.qty } },
        data: { stockQty: { decrement: item.qty } }
      });
      if (updated.count === 0) {
        throw new DomainError(
          `Disponibilità insufficiente per "${item.storeVariant.variant.product.name} — ${item.storeVariant.variant.name}".`
        );
      }
    }

    // 7. Codice ordine sequenziale e concorrenza-safe.
    const now = new Date();
    const seq = await nextOrderSequenceInTx(tx, now.getFullYear());
    const code = `SES-${now.getFullYear()}-${String(seq).padStart(6, "0")}`;
    const publicToken = randomBytes(16).toString("hex");

    // 7b. Gift card: riscatto atomico sull'importo dovuto (decremento condizionale).
    let giftCardCents = 0;
    let giftCardCodeSnapshot: string | null = null;
    if (txCart.giftCardCode) {
      const card = await tx.giftCard.findUnique({ where: { code: txCart.giftCardCode } });
      const check = checkGiftCard(card, authenticatedCustomer?.id ?? null);
      if (!check.ok) {
        throw new DomainError("La gift card non e piu valida o disponibile. Rimuovila e verifica il codice.");
      }
      const applicable = giftCardApplicable(check.card, totalCents);
      const redeemed = await redeemGiftCardInTx(tx, check.card.id, applicable, code);
      if (redeemed <= 0) {
        throw new DomainError("Il saldo della gift card e cambiato. Ricarica il carrello e riprova.");
      }
      giftCardCents = redeemed;
      giftCardCodeSnapshot = check.card.code;
    }
    const amountDueCents = totalCents - giftCardCents;
    const fullyPaidByGiftCard = amountDueCents <= 0;

    // 8. Ordine con snapshot completo (sede, evasione, prezzi)
    const created = await tx.order.create({
      data: {
        code,
        publicToken,
        status: fullyPaidByGiftCard ? "PAID" : "PENDING_PAYMENT",
        locationId: txCart.locationId,
        locationName: txCart.location.name,
        fulfillmentType: input.fulfillmentType,
        fulfillmentAt: parseRomeDateTimeLocal(input.fulfillmentAt),
        customerId: orderCustomer?.id ?? null,
        email,
        phone: input.phone,
        ...ship,
        subtotalCents,
        discountCents,
        giftCardCents,
        shippingCents,
        taxCents,
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
          create: { type: "CREATED", message: "Ordine ricevuto dallo storefront.", actor: "storefront" }
        }
      }
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

    return created;
  });

  // Importo effettivamente da pagare (al netto della gift card).
  const amountDueCents = order.totalCents - order.giftCardCents;

  // Inizializzazione pagamento fuori dalla transazione: PaymentAttempt persiste
  // prima della rete e usa una chiave idempotente stabile.
  let paymentInstructions: string | null = null;
  let redirectUrl: string | null = null;
  let paymentInitError: string | null = null;
  if (amountDueCents > 0) {
    try {
      const launch = await initializeOrderPayment(order.id);
      paymentInstructions = launch.instructions;
      redirectUrl = launch.redirectUrl;
      paymentInitError = launch.error;
    } catch (error) {
      console.error("Inizializzazione pagamento post-ordine fallita:", error);
      paymentInitError = "Pagamento non inizializzato. Puoi riprovare dalla pagina dell'ordine.";
    }
  }

  // Email di conferma (coda; invio reale via provider in Fase 5).
  await enqueueEmail({
    toEmail: order.email,
    subject: `Conferma ordine ${order.code} — Sessa 1930`,
    body:
      `Grazie per il tuo ordine ${order.code}.\n` +
      `Sede: ${order.locationName}\n` +
      `Totale: ${formatCents(order.totalCents)}\n` +
      (order.giftCardCents > 0 ? `Gift card: −${formatCents(order.giftCardCents)}\n` : "") +
      (amountDueCents > 0 ? `Da pagare: ${formatCents(amountDueCents)}\n` : `Ordine già pagato.\n`) +
      (paymentInstructions ? `\n${paymentInstructions}\n` : "") +
      `\nSegui lo stato: ${order.publicToken}`,
    type: "ORDER_CONFIRMATION",
    reference: order.code
  }).catch((error) => console.error("Conferma ordine non accodata:", error));

  // Referral: alla prima conversione dell'invitato, premia chi ha invitato.
  if (order.status === "PAID" && order.customerId) {
    await maybeConvertReferral(order.customerId, order.id).catch((error) => {
      console.error("Conversione referral post-pagamento fallita:", error);
    });
  }

  return {
    code: order.code,
    publicToken: order.publicToken,
    totalCents: order.totalCents,
    paymentInstructions,
    redirectUrl,
    paymentInitError
  };
}
