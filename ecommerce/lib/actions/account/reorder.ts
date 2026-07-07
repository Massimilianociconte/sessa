"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/auth/customer-session";
import { addItemToCart, CART_COOKIE, getOrCreateCartForLocation } from "@/lib/services/cart";

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

/**
 * Riordina: ricrea un carrello (per la sede dell'ordine originale) con le
 * stesse righe ancora disponibili in quella sede. Salta ciò che non è più
 * acquistabile; l'utente vede il carrello e completa.
 */
export async function reorderAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const orderId = String(formData.get("orderId") ?? "");
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || order.customerId !== customer.id || !order.locationId) {
    redirect("/account/ordini?err=Ordine non riordinabile");
  }

  const token = await ensureCartToken();
  const cart = await getOrCreateCartForLocation(token, order.locationId);

  let added = 0;
  for (const item of order.items) {
    if (!item.variantId) continue;
    const sv = await prisma.storeVariant.findUnique({
      where: { locationId_variantId: { locationId: order.locationId, variantId: item.variantId } }
    });
    if (!sv || !sv.isAvailable || sv.stockQty <= 0) continue;
    try {
      await addItemToCart(cart.id, sv.id, Math.min(item.qty, sv.stockQty));
      added++;
    } catch {
      // riga non aggiungibile: si prosegue
    }
  }

  revalidatePath("/", "layout");
  if (added === 0) redirect("/account/ordini?err=Nessun prodotto dell'ordine è più disponibile");
  redirect("/carrello");
}
