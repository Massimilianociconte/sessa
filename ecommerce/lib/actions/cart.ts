"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import {
  attachDiscount,
  attachGiftCard,
  buildCartView,
  CART_COOKIE,
  cartClampWarning,
  getCartByToken,
  removeItem,
  removeUnavailableItems,
  setItemQty,
  toDiscountLines
} from "@/lib/services/cart";
import { evaluateDiscount, loadDiscount } from "@/lib/services/discounts";
import { prisma } from "@/lib/db";
import { checkGiftCard, loadGiftCard } from "@/lib/services/giftcards";
import { enforceCartRateLimit } from "@/lib/services/cart-rate-limit";

export async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

const qtySchema = z.object({ itemId: z.string().min(1), qty: z.coerce.number().int().min(0).max(99) });

export async function updateCartItemAction(formData: FormData): Promise<void> {
  const token = await readCartToken();
  if (!token) redirect("/carrello");
  await enforceCartRateLimit(await headers(), token, "mutation");
  const cart = await getCartByToken(token);
  if (!cart) redirect("/carrello");
  const parsed = qtySchema.safeParse({ itemId: formData.get("itemId"), qty: formData.get("qty") });
  const mutation = parsed.success ? await setItemQty(cart.id, parsed.data.itemId, parsed.data.qty) : null;
  revalidatePath("/", "layout");
  const warning = mutation ? cartClampWarning(mutation) : null;
  redirect(warning ? `/carrello?warn=${encodeURIComponent(warning)}` : "/carrello");
}

export async function removeCartItemAction(formData: FormData): Promise<void> {
  const token = await readCartToken();
  const itemId = formData.get("itemId");
  if (token && typeof itemId === "string") {
    await enforceCartRateLimit(await headers(), token, "mutation");
    const cart = await getCartByToken(token);
    if (cart) await removeItem(cart.id, itemId);
  }
  revalidatePath("/", "layout");
  redirect("/carrello");
}

export async function removeUnavailableAction(): Promise<void> {
  const token = await readCartToken();
  if (token) {
    await enforceCartRateLimit(await headers(), token, "mutation");
    const cart = await getCartByToken(token);
    if (cart) await removeUnavailableItems(cart.id);
  }
  revalidatePath("/", "layout");
  redirect("/carrello");
}

export async function applyDiscountAction(formData: FormData): Promise<void> {
  const token = await readCartToken();
  const code = formData.get("code");
  if (!token || typeof code !== "string" || code.trim() === "") redirect("/carrello");
  await enforceCartRateLimit(await headers(), token, "discount");
  const cart = await getCartByToken(token);
  if (!cart) redirect("/carrello");

  const view = buildCartView(cart);
  const customer = await getSessionCustomer();
  const discount = await loadDiscount(code);
  if (!discount) redirect(`/carrello?err=${encodeURIComponent("Codice sconto non valido.")}`);
  const priorOrders = customer
    ? await prisma.order.count({ where: { customerId: customer.id, status: { notIn: ["CANCELLED", "REFUNDED"] } } })
    : 0;
  const customerRedemptions = customer
    ? await prisma.discountRedemption.count({
        where: { discountId: discount.id, customerId: customer.id, reversedAt: null }
      })
    : 0;
  const evaluated = evaluateDiscount(discount, {
    locationId: cart.locationId,
    subtotalCents: view.subtotalCents,
    lines: toDiscountLines(view.lines),
    customerId: customer?.id ?? null,
    isFirstOrder: customer ? priorOrders === 0 : undefined,
    customerRedemptions: customer ? customerRedemptions : undefined
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
  const back = giftCardReturnPath(formData);
  if (typeof code !== "string" || code.trim() === "") {
    redirect(`${back}?err=${encodeURIComponent("Inserisci il codice della gift card.")}`);
  }
  if (!token) {
    redirect(`/carrello?err=${encodeURIComponent("Aggiungi prima i prodotti al carrello, poi applica la gift card.")}`);
  }
  await enforceCartRateLimit(await headers(), token, "giftcard");
  const cart = await getCartByToken(token);
  if (!cart) {
    redirect(`/carrello?err=${encodeURIComponent("Aggiungi prima i prodotti al carrello, poi applica la gift card.")}`);
  }

  const [card, customer] = await Promise.all([loadGiftCard(code), getSessionCustomer()]);
  const check = checkGiftCard(card, customer?.id ?? null);
  if (!check.ok) redirect(`${giftCardReturnPath(formData)}?err=${encodeURIComponent("Gift card non valida o non disponibile.")}`);
  await attachGiftCard(cart.id, check.card.code);
  revalidatePath("/carrello");
  revalidatePath("/checkout");
  redirect(giftCardReturnPath(formData));
}

export async function removeGiftCardAction(formData?: FormData): Promise<void> {
  const token = await readCartToken();
  if (token) {
    const cart = await getCartByToken(token);
    if (cart) await attachGiftCard(cart.id, null);
  }
  revalidatePath("/carrello");
  revalidatePath("/checkout");
  redirect(giftCardReturnPath(formData));
}

function giftCardReturnPath(formData?: FormData): "/carrello" | "/checkout" {
  return formData?.get("next") === "checkout" ? "/checkout" : "/carrello";
}
