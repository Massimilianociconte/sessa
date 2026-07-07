"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/lib/domain";
import {
  addItemToCart,
  attachDiscount,
  attachGiftCard,
  buildCartView,
  CART_COOKIE,
  getCartByToken,
  getOrCreateCartForLocation,
  removeItem,
  setItemQty,
  toDiscountLines
} from "@/lib/services/cart";
import { checkDiscount } from "@/lib/services/discounts";
import { checkGiftCard, loadGiftCard } from "@/lib/services/giftcards";

async function ensureCartToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CART_COOKIE)?.value;
  if (existing) return existing;
  const token = randomBytes(24).toString("hex");
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return token;
}

export async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

const addSchema = z.object({
  locationId: z.string().min(1),
  storeVariantId: z.string().min(1),
  qty: z.coerce.number().int().min(1).max(99).default(1)
});

export async function addToCartAction(formData: FormData): Promise<void> {
  const parsed = addSchema.safeParse({
    locationId: formData.get("locationId"),
    storeVariantId: formData.get("storeVariantId"),
    qty: formData.get("qty") ?? 1
  });
  if (!parsed.success) redirect("/carrello?err=Selezione non valida");

  const token = await ensureCartToken();
  const cart = await getOrCreateCartForLocation(token, parsed.data.locationId);
  try {
    await addItemToCart(cart.id, parsed.data.storeVariantId, parsed.data.qty);
  } catch (error) {
    if (error instanceof DomainError) redirect(`/carrello?err=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath("/", "layout");
  redirect("/carrello");
}

const qtySchema = z.object({ itemId: z.string().min(1), qty: z.coerce.number().int().min(0).max(99) });

export async function updateCartItemAction(formData: FormData): Promise<void> {
  const token = await readCartToken();
  if (!token) redirect("/carrello");
  const cart = await getCartByToken(token);
  if (!cart) redirect("/carrello");
  const parsed = qtySchema.safeParse({ itemId: formData.get("itemId"), qty: formData.get("qty") });
  if (parsed.success) await setItemQty(cart.id, parsed.data.itemId, parsed.data.qty);
  revalidatePath("/", "layout");
  redirect("/carrello");
}

export async function removeCartItemAction(formData: FormData): Promise<void> {
  const token = await readCartToken();
  const itemId = formData.get("itemId");
  if (token && typeof itemId === "string") {
    const cart = await getCartByToken(token);
    if (cart) await removeItem(cart.id, itemId);
  }
  revalidatePath("/", "layout");
  redirect("/carrello");
}

export async function applyDiscountAction(formData: FormData): Promise<void> {
  const token = await readCartToken();
  const code = formData.get("code");
  if (!token || typeof code !== "string" || code.trim() === "") redirect("/carrello");
  const cart = await getCartByToken(token);
  if (!cart) redirect("/carrello");

  const view = buildCartView(cart);
  const evaluated = await checkDiscount(code, {
    locationId: cart.locationId,
    subtotalCents: view.subtotalCents,
    lines: toDiscountLines(view.lines)
  });
  if (!evaluated.ok) redirect(`/carrello?err=${encodeURIComponent(evaluated.reason)}`);
  await attachDiscount(cart.id, evaluated.discount.id);
  revalidatePath("/carrello");
  redirect("/carrello");
}

export async function removeDiscountAction(): Promise<void> {
  const token = await readCartToken();
  if (token) {
    const cart = await getCartByToken(token);
    if (cart) await attachDiscount(cart.id, null);
  }
  revalidatePath("/carrello");
  redirect("/carrello");
}

export async function applyGiftCardAction(formData: FormData): Promise<void> {
  const token = await readCartToken();
  const code = formData.get("giftCardCode");
  if (!token || typeof code !== "string" || code.trim() === "") redirect("/carrello");
  const cart = await getCartByToken(token);
  if (!cart) redirect("/carrello");

  const card = await loadGiftCard(code);
  const check = checkGiftCard(card);
  if (!check.ok) redirect(`/carrello?err=${encodeURIComponent(check.reason)}`);
  await attachGiftCard(cart.id, check.card.code);
  revalidatePath("/carrello");
  redirect("/carrello");
}

export async function removeGiftCardAction(): Promise<void> {
  const token = await readCartToken();
  if (token) {
    const cart = await getCartByToken(token);
    if (cart) await attachGiftCard(cart.id, null);
  }
  revalidatePath("/carrello");
  redirect("/carrello");
}
