import { cookies } from "next/headers";
import { buildCartView, CART_COOKIE, getCartByToken, type CartView } from "@/lib/services/cart";

/** Carrello della richiesta corrente (solo lettura, per RSC). */
export async function getCurrentCartView(): Promise<CartView | null> {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) return null;
  const cart = await getCartByToken(token);
  if (!cart) return null;
  return buildCartView(cart);
}
