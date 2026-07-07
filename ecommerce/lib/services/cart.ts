import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { effectivePrice } from "@/lib/services/catalog";
import { evaluateDiscount, type DiscountLine } from "@/lib/services/discounts";
import { checkGiftCard, loadGiftCard } from "@/lib/services/giftcards";

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
  const existing = await getCartByToken(token);
  if (existing) {
    if (existing.locationId === locationId) return existing;
    await prisma.cartItem.deleteMany({ where: { cartId: existing.id } });
    await prisma.cart.update({
      where: { id: existing.id },
      data: { locationId, discountCodeId: null }
    });
    return (await getCartByToken(token))!;
  }
  await prisma.cart.create({ data: { token, locationId } });
  return (await getCartByToken(token))!;
}

export async function addItemToCart(cartId: string, storeVariantId: string, qty: number): Promise<void> {
  const cart = await prisma.cart.findUnique({ where: { id: cartId } });
  if (!cart) throw new DomainError("Carrello non trovato.");

  const sv = await prisma.storeVariant.findUnique({
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

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_storeVariantId: { cartId, storeVariantId } }
  });
  const requested = (existing?.qty ?? 0) + qty;
  const clamped = Math.min(requested, sv.stockQty);
  if (clamped <= 0) throw new DomainError("Prodotto esaurito.");

  await prisma.cartItem.upsert({
    where: { cartId_storeVariantId: { cartId, storeVariantId } },
    update: { qty: clamped },
    create: { cartId, storeVariantId, qty: clamped }
  });
}

export async function setItemQty(cartId: string, itemId: string, qty: number): Promise<void> {
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId },
    include: { storeVariant: true }
  });
  if (!item) return;
  if (qty <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return;
  }
  await prisma.cartItem.update({
    where: { id: item.id },
    data: { qty: Math.min(qty, item.storeVariant.stockQty) }
  });
}

export async function removeItem(cartId: string, itemId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId } });
}

export async function attachDiscount(cartId: string, discountCodeId: string | null): Promise<void> {
  await prisma.cart.update({ where: { id: cartId }, data: { discountCodeId } });
}

export async function attachGiftCard(cartId: string, giftCardCode: string | null): Promise<void> {
  await prisma.cart.update({ where: { id: cartId }, data: { giftCardCode } });
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

export function buildCartView(cart: CartWithItems): CartView {
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
      lines: toDiscountLines(lines)
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
