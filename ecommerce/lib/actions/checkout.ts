"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DomainError } from "@/lib/domain";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { CART_COOKIE, getCartByToken } from "@/lib/services/cart";
import { placeOrder } from "@/lib/services/checkout";
import { checkoutSchema, formDataToObject } from "@/lib/validation";
import { enforceCartRateLimit } from "@/lib/services/cart-rate-limit";

export type CheckoutState = {
  error: string | null;
  fieldErrors: Record<string, string>;
};

export async function placeOrderAction(
  _prev: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const raw = formDataToObject(formData);
  const parsed = checkoutSchema.safeParse({
    ...raw,
    marketingOptIn: formData.get("marketingOptIn") === "on"
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Controlla i campi evidenziati.", fieldErrors };
  }

  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  const cart = token ? await getCartByToken(token) : null;
  if (!cart || cart.items.length === 0) {
    return { error: "Il carrello è vuoto.", fieldErrors: {} };
  }

  let placedCode: string;
  let placedToken: string;
  let redirectUrl: string | null = null;
  let paymentInitError: string | null = null;
  try {
    await enforceCartRateLimit(await headers(), token, "checkout");
    const sessionCustomer = await getSessionCustomer();
    const placed = await placeOrder(cart, parsed.data, {
      authenticatedCustomerId: sessionCustomer?.id ?? null
    });
    placedCode = placed.code;
    placedToken = placed.publicToken;
    redirectUrl = placed.redirectUrl;
    paymentInitError = placed.paymentInitError;
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, fieldErrors: {} };
    console.error("Errore checkout:", error);
    return { error: "Si è verificato un errore imprevisto. Riprova tra qualche istante.", fieldErrors: {} };
  }

  store.delete(CART_COOKIE);
  revalidatePath("/", "layout");
  // Con Stripe si redirige al checkout esterno; altrimenti alla pagina ordine.
  redirect(redirectUrl ?? `/ordine/${placedCode}?t=${placedToken}${paymentInitError ? "&payment=failed" : ""}`);
}
