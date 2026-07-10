import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { effectivePrice } from "@/lib/services/catalog";
import { evaluateDiscount, type DiscountContext, type DiscountLine } from "@/lib/services/discounts";
import { checkGiftCard, loadGiftCard } from "@/lib/services/giftcards";
import { serializableTransaction } from "@/lib/services/transaction";

export const CART_COOKIE = "sessa_cart";

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
  return serializableTransaction(async (tx) => {
    const location = await tx.location.findUnique({ where: { id: locationId }, select: { isActive: true } });
    if (!location?.isActive) throw new DomainError("Sede non disponibile.");

    const existing = await tx.cart.upsert({
      where: { token },
      create: { token, locationId },
      update: {},
      include: cartInclude
    });
    if (existing.status !== "ACTIVE") {
      throw new DomainError("Il carrello precedente e gia stato convertito.", "CART_ALREADY_CONVERTED");
    }
    if (existing.locationId === locationId) return existing;

    // Cambio sede indivisibile: non puo lasciare righe della vecchia sede su un
    // cart gia riassegnato, ne conservare coupon/gift card fuori contesto.
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

export async function addItemToCart(cartId: string, storeVariantId: string, qty: number): Promise<void> {
  if (!Number.isInteger(qty) || qty <= 0 || qty > 99) throw new DomainError("Quantita non valida.");
  await serializableTransaction(async (tx) => {
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
    const requested = (existing?.qty ?? 0) + qty;
    const clamped = Math.min(requested, sv.stockQty, 99);
    if (clamped <= 0) throw new DomainError("Prodotto esaurito.");

    await tx.cartItem.upsert({
      where: { cartId_storeVariantId: { cartId, storeVariantId } },
      update: { qty: clamped },
      create: { cartId, storeVariantId, qty: clamped }
    });
    await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  });
}

export async function setItemQty(cartId: string, itemId: string, qty: number): Promise<void> {
  if (!Number.isInteger(qty) || qty < 0 || qty > 99) throw new DomainError("Quantita non valida.");
  await serializableTransaction(async (tx) => {
    const cart = await tx.cart.findUnique({ where: { id: cartId }, select: { status: true } });
    if (!cart || cart.status !== "ACTIVE") throw new DomainError("Carrello non disponibile.");
    const item = await tx.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: { storeVariant: true }
    });
    if (!item) return;
    const clamped = Math.min(qty, item.storeVariant.stockQty, 99);
    if (clamped <= 0) {
      await tx.cartItem.delete({ where: { id: item.id } });
    } else {
      await tx.cartItem.update({ where: { id: item.id }, data: { qty: clamped } });
    }
    await tx.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
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

export type CartView = {
  cart: CartWithItems;
  locationId: string;
  locationName: string;
  locationSlug: string;
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  discountWarning: string | null;
};

/** Righe di sconto per il motore granulare. */
export function toDiscountLines(lines: CartLine[]): DiscountLine[] {
  return lines.map((l) => ({ productId: l.productId, categoryId: l.categoryId, lineCents: l.totalCents }));
}

export function buildCartView(
  cart: CartWithItems,
  customerContext?: Pick<DiscountContext, "customerId" | "isFirstOrder" | "customerRedemptions">
): CartView {
  const lines: CartLine[] = cart.items.map((item) => {
    const sv = item.storeVariant;
    const variant = sv.variant;
    const product = variant.product;
    const unitCents = effectivePrice(sv.priceCentsOverride, variant.basePriceCents);
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
      qty: item.qty,
      totalCents: unitCents * item.qty,
      maxQty: sv.stockQty,
      taxRateBps: product.taxRateBps
    };
  });
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
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    subtotalCents,
    discountCents,
    discountCode,
    discountWarning
  };
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
