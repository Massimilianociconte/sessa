import { cookies } from "next/headers";
import { buildCartViewForCustomer, CART_COOKIE, getCartByToken, persistSanitizedCart, type CartView } from "@/lib/services/cart";
import { getSessionCustomer } from "@/lib/auth/customer-session";

/** Carrello della richiesta corrente (solo lettura, per RSC). */
export async function getCurrentCartView(): Promise<CartView | null> {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  if (!token) return null;
  const cart = await getCartByToken(token);
  if (!cart) return null;
  const persistWarnings = await persistSanitizedCart(cart);
  const fresh = (await getCartByToken(token)) ?? cart;
  const customer = await getSessionCustomer();
  const view = await buildCartViewForCustomer(fresh, customer?.id);
  if (persistWarnings.length === 0) return view;
  return { ...view, integrityWarnings: [...persistWarnings, ...view.integrityWarnings] };
}
