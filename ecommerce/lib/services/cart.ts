import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { effectivePrice } from "@/lib/services/catalog";
import { evaluateDiscount, type DiscountContext, type DiscountLine } from "@/lib/services/discounts";
import { checkGiftCard, loadGiftCard } from "@/lib/services/giftcards";
import {
  describeCartIntegrityWarnings,
  describePriceChange,
  describeStockClamp,
  planCartQuantity,
  planSetCartQuantity,
  sanitizeCartLines
} from "@/lib/commerce/cart-integrity";
import {
  buildIsolatedCartToken,
  CONVERTED_CART_TOKEN_PREFIX,
  isBrowserReusableCartToken,
  MERGED_CART_TOKEN_PREFIX
} from "@/lib/commerce/cart-session-isolation";
import { readCommittedTransaction } from "@/lib/services/transaction";

export const CART_COOKIE = "sessa_cart";

export const CART_COOKIE_ATTRS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30
};

export function cartCookieSetOptions() {
  return { ...CART_COOKIE_ATTRS, secure: process.env.NODE_ENV === "production" };
}

export type CartQtyMutation = {
  qty: number;
  requested: number;
  clamped: boolean;
  productName: string;
};

export function cartClampWarning(result: CartQtyMutation): string | null {
  if (!result.clamped) return null;
  return describeStockClamp({
    productName: result.productName,
    requested: result.requested,
    kept: result.qty
  });
}

const cartInclude = {
  location: true,
  discountCode: { include: { locations: true, categories: true, products: true } },
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      storeVariant: {
        include: {
          variant: { include: { product: { include: { images: true, category: true } } } }
        }
      }
    }
  }
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

let lastCartPruneAt = 0;
const CART_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

async function maybePruneStaleCarts(): Promise<void> {
  const now = Date.now();
  if (now - lastCartPruneAt < CART_PRUNE_INTERVAL_MS) return;
  lastCartPruneAt = now;
  await prisma.cart.deleteMany({
    where: {
      OR: [
        { status: "ACTIVE", updatedAt: { lt: new Date(now - 45 * 24 * 60 * 60 * 1000) } },
        { status: "CONVERTED", convertedAt: { lt: new Date(now - 7 * 24 * 60 * 60 * 1000) } }
      ]
    }
  }).catch(() => undefined);
}

export async function getCartByToken(token: string): Promise<CartWithItems | null> {
  return prisma.cart.findFirst({ where: { token, status: "ACTIVE" }, include: cartInclude });
}

/**
 * Carrello per token legato a una sede. Se il token ha già un carrello di
 * un'altra sede, lo si ripulisce e si riassegna: un carrello = una sede.
 */
export async function getOrCreateCartForLocation(
  token: string,
  locationId: string
): Promise<CartWithItems> {
  await maybePruneStaleCarts();
  return readCommittedTransaction(async (tx) => {
    const location = await tx.location.findUnique({ where: { id: locationId }, select: { isActive: true } });
    if (!location?.isActive) throw new DomainError("Sede non disponibile.");

    const existing = await tx.cart.upsert({
      where: { token },
      create: { token, locationId },
      update: {},
      include: cartInclude
    });
    if (existing.status !== "ACTIVE") {
      await tx.cart.update({
        where: { id: existing.id },
        data: { token: `${CONVERTED_CART_TOKEN_PREFIX}${existing.id}` }
      });
      return tx.cart.create({
        data: { token, locationId },
        include: cartInclude
      });
    }
    if (existing.locationId === locationId) return existing;

    // Cambio sede indivisibile: non può lasciare righe della vecchia sede su un
    // cart già riassegnato, ne conservare coupon/gift card fuori contesto.
    await tx.cartItem.deleteMany({ where: { cartId: existing.id } });
    await tx.cart.updateMany({
      where: { id: existing.id, status: "ACTIVE" },
      data: { locationId, discountCodeId: null, giftCardCode: null }
    });
    const switched = await tx.cart.findUnique({ where: { id: existing.id }, include: cartInclude });
    if (!switched) throw new DomainError("Carrello non trovato.");
    return switched;
  });
}

export async function addItemToCart(cartId: string, storeVariantId: string, qty: number): Promise<CartQtyMutation> {
  if (!Number.isInteger(qty) || qty <= 0 || qty > 99) throw new DomainError("Quantità non valida.");
  return readCommittedTransaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { id: cartId } });
    if (!cart || cart.status !== "ACTIVE") throw new DomainError("Carrello non disponibile.");

    const sv = await tx.storeVariant.findUnique({
      where: { id: storeVariantId },
      include: { variant: { include: { product: true } } }
    });
    if (
      !sv ||
      sv.locationId !== cart.locationId ||
      !sv.isAvailable ||
      !sv.variant.isActive ||
      sv.variant.product.status !== "ACTIVE"
    ) {
      throw new DomainError("Prodotto non disponibile in questa sede.");
    }

    const existing = await tx.cartItem.findUnique({
      where: { cartId_storeVariantId: { cartId, storeVariantId } }
    });
    const planned = planCartQuantity({
      alreadyInCart: existing?.qty ?? 0,
      addQty: qty,
      stockQty: sv.stockQty
    });
    if (planned.qty <= 0) throw new DomainError("Prodotto esaurito.");

    // Il prezzo visto al momento dell'aggiunta permette di segnalare variazioni.
    const unitCentsSnapshot = effectivePrice(sv.priceCentsOverride, sv.variant.basePriceCents);
    await tx.cartItem.upsert({
      where: { cartId_storeVariantId: { cartId, storeVariantId } },
      update: { qty: planned.qty, unitCentsSnapshot },
      create: { cartId, storeVariantId, qty: planned.qty, unitCentsSnapshot }
    });
    await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    return {
      qty: planned.qty,
      requested: planned.requested,
      clamped: planned.clamped,
      productName: sv.variant.product.name
    };
  });
}

export async function setItemQty(cartId: string, itemId: string, qty: number): Promise<CartQtyMutation | null> {
  if (!Number.isInteger(qty) || qty < 0 || qty > 99) throw new DomainError("Quantità non valida.");
  return readCommittedTransaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { id: cartId }, select: { status: true } });
    if (!cart || cart.status !== "ACTIVE") throw new DomainError("Carrello non disponibile.");
    const item = await tx.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: { storeVariant: { include: { variant: { include: { product: true } } } } }
    });
    if (!item) return null;
    const planned = planSetCartQuantity({ requestedQty: qty, stockQty: item.storeVariant.stockQty });
    if (planned.qty <= 0) {
      await tx.cartItem.delete({ where: { id: item.id } });
    } else {
      await tx.cartItem.update({ where: { id: item.id }, data: { qty: planned.qty } });
    }
    await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
    return {
      qty: planned.qty,
      requested: planned.requested,
      clamped: planned.clamped,
      productName: item.storeVariant.variant.product.name
    };
  });
}

export async function removeItem(cartId: string, itemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { id: cartId }, select: { status: true } });
    if (!cart || cart.status !== "ACTIVE") return;
    await tx.cartItem.deleteMany({ where: { id: itemId, cartId } });
    await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  });
}

export async function attachDiscount(cartId: string, discountCodeId: string | null): Promise<void> {
  const updated = await prisma.cart.updateMany({
    where: { id: cartId, status: "ACTIVE" },
    data: { discountCodeId }
  });
  if (updated.count === 0) throw new DomainError("Carrello non disponibile.");
}

export async function attachGiftCard(cartId: string, giftCardCode: string | null): Promise<void> {
  const updated = await prisma.cart.updateMany({
    where: { id: cartId, status: "ACTIVE" },
    data: { giftCardCode }
  });
  if (updated.count === 0) throw new DomainError("Carrello non disponibile.");
}

export type CartGiftCard =
  | { code: string; balanceCents: number; valid: true }
  | { code: string; balanceCents: 0; valid: false; reason: string };

/** Stato della gift card applicata al carrello (saldo disponibile o motivo). */
export async function getCartGiftCard(
  cart: CartWithItems,
  customerId?: string | null
): Promise<CartGiftCard | null> {
  if (!cart.giftCardCode) return null;
  const card = await loadGiftCard(cart.giftCardCode);
  const check = checkGiftCard(card, customerId);
  if (!check.ok) return { code: cart.giftCardCode, balanceCents: 0, valid: false, reason: check.reason };
  return { code: check.card.code, balanceCents: check.card.balanceCents, valid: true };
}

export type CartLine = {
  itemId: string;
  storeVariantId: string;
  variantId: string;
  productId: string;
  categoryId: string | null;
  productName: string;
  productSlug: string;
  variantName: string;
  image: string | null;
  unitCents: number;
  qty: number;
  totalCents: number;
  maxQty: number;
  taxRateBps: number;
};

export type UnavailableCartLine = {
  itemId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  image: string | null;
  qty: number;
  reason: "unavailable" | "sold_out";
};

export type CartView = {
  cart: CartWithItems;
  locationId: string;
  locationName: string;
  locationSlug: string;
  lines: CartLine[];
  /** Righe non acquistabili ora: restano visibili (niente cancellazioni silenziose) ma bloccano il checkout. */
  unavailableLines: UnavailableCartLine[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  discountWarning: string | null;
  integrityWarnings: string[];
};

/** Righe di sconto per il motore granulare. */
export function toDiscountLines(lines: CartLine[]): DiscountLine[] {
  return lines.map((l) => ({ productId: l.productId, categoryId: l.categoryId, lineCents: l.totalCents }));
}

export function buildCartView(
  cart: CartWithItems,
  customerContext?: Pick<DiscountContext, "customerId" | "isFirstOrder" | "customerRedemptions">
): CartView {
  const integrity = sanitizeCartLines(
    cart.items.map((item) => ({
      itemId: item.id,
      storeVariantId: item.storeVariantId,
      qty: item.qty,
      productName: item.storeVariant.variant.product.name,
      live: {
        available: item.storeVariant.isAvailable,
        productActive: item.storeVariant.variant.product.status === "ACTIVE",
        variantActive: item.storeVariant.variant.isActive,
        stockQty: item.storeVariant.stockQty,
        unitCents: effectivePrice(item.storeVariant.priceCentsOverride, item.storeVariant.variant.basePriceCents)
      }
    }))
  );
  const keptIds = new Set(integrity.kept.map((line) => line.itemId));
  const qtyById = new Map(integrity.kept.map((line) => [line.itemId, line.qty]));
  const lines: CartLine[] = cart.items
    .filter((item) => keptIds.has(item.id))
    .map((item) => {
    const sv = item.storeVariant;
    const variant = sv.variant;
    const product = variant.product;
    const unitCents = effectivePrice(sv.priceCentsOverride, variant.basePriceCents);
    const qty = qtyById.get(item.id) ?? item.qty;
    return {
      itemId: item.id,
      storeVariantId: sv.id,
      variantId: variant.id,
      productId: product.id,
      categoryId: product.categoryId,
      productName: product.name,
      productSlug: product.slug,
      variantName: variant.name,
      image: product.image ?? product.images[0]?.url ?? null,
      unitCents,
      qty,
      totalCents: unitCents * qty,
      maxQty: sv.stockQty,
      taxRateBps: product.taxRateBps
    };
  });
  const integrityWarnings = describeCartIntegrityWarnings(integrity);
  const removedReason = new Map(integrity.removed.map((item) => [item.itemId, item.reason]));
  const unavailableLines: UnavailableCartLine[] = cart.items
    .filter((item) => removedReason.has(item.id))
    .map((item) => ({
      itemId: item.id,
      productName: item.storeVariant.variant.product.name,
      productSlug: item.storeVariant.variant.product.slug,
      variantName: item.storeVariant.variant.name,
      image: item.storeVariant.variant.product.image ?? item.storeVariant.variant.product.images[0]?.url ?? null,
      qty: item.qty,
      reason: removedReason.get(item.id) ?? "unavailable"
    }));
  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);

  let discountCents = 0;
  let discountWarning: string | null = null;
  let discountCode: string | null = null;
  if (cart.discountCode) {
    discountCode = cart.discountCode.code;
    const evaluated = evaluateDiscount(cart.discountCode, {
      locationId: cart.locationId,
      subtotalCents,
      lines: toDiscountLines(lines),
      ...customerContext
    });
    if (evaluated.ok) discountCents = evaluated.amountCents;
    else discountWarning = evaluated.reason;
  }

  return {
    cart,
    locationId: cart.locationId,
    locationName: cart.location.name,
    locationSlug: cart.location.slug,
    lines,
    unavailableLines,
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    subtotalCents,
    discountCents,
    discountCode,
    discountWarning,
    integrityWarnings
  };
}

/**
 * Allinea il carrello salvato allo stato reale senza cancellare nulla:
 * - quantita oltre lo stock vengono ridotte (se lo stock e > 0);
 * - le righe esaurite o non più vendibili RESTANO, segnalate dalla vista
 *   (lo stock a zero può dipendere da prenotazioni temporanee di altri clienti);
 * - il prezzo visto viene aggiornato dopo aver segnalato la variazione.
 */
export async function persistSanitizedCart(cart: CartWithItems): Promise<string[]> {
  const integrity = sanitizeCartLines(
    cart.items.map((item) => ({
      itemId: item.id,
      storeVariantId: item.storeVariantId,
      qty: item.qty,
      productName: item.storeVariant.variant.product.name,
      live: {
        available: item.storeVariant.isAvailable,
        productActive: item.storeVariant.variant.product.status === "ACTIVE",
        variantActive: item.storeVariant.variant.isActive,
        stockQty: item.storeVariant.stockQty,
        unitCents: effectivePrice(item.storeVariant.priceCentsOverride, item.storeVariant.variant.basePriceCents),
        previousUnitCents: item.unitCentsSnapshot ?? undefined
      }
    }))
  );
  const names = new Map(cart.items.map((item) => [item.id, item.storeVariant.variant.product.name]));
  if (integrity.clamped.length === 0 && integrity.priceChanges.length === 0) return [];
  await prisma.$transaction(async (tx) => {
    for (const change of integrity.clamped) {
      await tx.cartItem.updateMany({ where: { id: change.itemId, cartId: cart.id }, data: { qty: change.to } });
    }
    for (const change of integrity.priceChanges) {
      await tx.cartItem.updateMany({ where: { id: change.itemId, cartId: cart.id }, data: { unitCentsSnapshot: change.to } });
    }
  });
  return [
    ...describeCartIntegrityWarnings({ removed: [], clamped: integrity.clamped }),
    ...integrity.priceChanges.map((change) =>
      describePriceChange({ productName: names.get(change.itemId), from: change.from, to: change.to })
    )
  ];
}

/** Rimuove in un colpo le righe non acquistabili (esaurite o non più vendute). */
export async function removeUnavailableItems(cartId: string): Promise<number> {
  const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: cartInclude });
  if (!cart || cart.status !== "ACTIVE") return 0;
  const view = buildCartView(cart);
  const ids = view.unavailableLines.map((line) => line.itemId);
  if (ids.length === 0) return 0;
  const removed = await prisma.cartItem.deleteMany({ where: { cartId, id: { in: ids } } });
  return removed.count;
}

export async function isolateCartTokenInDb(token: string): Promise<void> {
  if (!isBrowserReusableCartToken(token)) return;
  const cart = await prisma.cart.findFirst({
    where: { token, status: "ACTIVE" },
    select: { id: true }
  });
  if (!cart) return;
  const entropy = randomBytes(12).toString("hex");
  await prisma.cart.updateMany({
    where: { id: cart.id, token, status: "ACTIVE" },
    data: { token: buildIsolatedCartToken(cart.id, entropy) }
  });
}

export async function isolateCurrentCartCookie(): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value ?? null;
  if (token) await isolateCartTokenInDb(token);
  store.delete(CART_COOKIE);
}

export async function bindCustomerCartAfterLogin(
  customerId: string,
  existingToken: string | null
): Promise<string> {
  const bound = await attachCartToCustomer(existingToken, customerId);
  if (bound) return bound;
  // Nessun carrello da legare: il cookie conserva il token del browser se
  // riutilizzabile, altrimenti ne nasce uno nuovo (carrello vuoto creato al
  // primo add). In ogni caso il valore in DB non e' mai scelto dal client
  // per un carrello esistente.
  return existingToken && isBrowserReusableCartToken(existingToken)
    ? existingToken
    : randomBytes(24).toString("hex");
}

export async function syncCartCookieAfterLogin(customerId: string): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const nextToken = await bindCustomerCartAfterLogin(customerId, store.get(CART_COOKIE)?.value ?? null);
  store.set(CART_COOKIE, nextToken, cartCookieSetOptions());
}

/**
 * Lega al cliente il carrello attivo del browser e fonde i carrelli precedenti
 * della stessa sede. Ritorna il token effettivo da persistere nel cookie, o
 * null se non esiste alcun carrello da legare.
 *
 * Anti-fixation: quando il token del browser non corrisponde a nessun carrello
 * ma il cliente ne ha uno precedente, il carrello viene ri-etichettato con un
 * token GENERATO DAL SERVER — mai con il valore arrivato dal client. Un
 * attaccante che conosce/imposta il cookie della vittima non può quindi
 * ereditarne il carrello al login.
 */
export async function attachCartToCustomer(
  browserToken: string | null,
  customerId: string
): Promise<string | null> {
  return readCommittedTransaction(async (tx) => {
    const current = browserToken
      ? await tx.cart.findFirst({
          where: { token: browserToken, status: "ACTIVE" },
          include: { items: true }
        })
      : null;
    if (current) {
      await tx.cart.update({ where: { id: current.id }, data: { customerId } });
      const others = await tx.cart.findMany({
        where: { customerId, status: "ACTIVE", id: { not: current.id } },
        include: { items: true }
      });
      for (const other of others) {
        if (other.locationId === current.locationId) {
          for (const item of other.items) {
            const existing = current.items.find((row) => row.storeVariantId === item.storeVariantId);
            if (existing) {
              await tx.cartItem.update({
                where: { id: existing.id },
                data: { qty: Math.min(99, existing.qty + item.qty) }
              });
            } else {
              await tx.cartItem.create({
                data: {
                  cartId: current.id,
                  storeVariantId: item.storeVariantId,
                  qty: item.qty,
                  unitCentsSnapshot: item.unitCentsSnapshot
                }
              });
            }
          }
        }
        await tx.cart.update({
          where: { id: other.id },
          data: { status: "CONVERTED", convertedAt: new Date(), token: `${MERGED_CART_TOKEN_PREFIX}${other.id}` }
        });
      }
      return current.token;
    }

    const previous = await tx.cart.findFirst({
      where: { customerId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" }
    });
    if (!previous) return null;
    const freshToken = randomBytes(24).toString("hex");
    await tx.cart.update({ where: { id: previous.id }, data: { token: freshToken } });
    return freshToken;
  });
}

export async function buildCartViewForCustomer(
  cart: CartWithItems,
  customerId: string | null | undefined
): Promise<CartView> {
  if (!customerId) return buildCartView(cart, { customerId: null });
  if (!cart.discountCodeId) return buildCartView(cart, { customerId });
  const priorOrders = await prisma.order.count({
    where: { customerId, status: { notIn: ["CANCELLED", "REFUNDED"] } }
  });
  const customerRedemptions = await prisma.discountRedemption.count({
    where: { discountId: cart.discountCodeId, customerId, reversedAt: null }
  });
  return buildCartView(cart, {
    customerId,
    isFirstOrder: priorOrders === 0,
    customerRedemptions
  });
}
