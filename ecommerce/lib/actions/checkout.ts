"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { DomainError } from "@/lib/domain";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { CART_COOKIE, getCartByToken } from "@/lib/services/cart";
import { findOrderForCheckoutKey, placeOrder, resumeCheckoutOrder, type PlacedOrder } from "@/lib/services/checkout";
import { checkoutSchema, formDataToObject } from "@/lib/validation";
import { enforceCartRateLimit, recentCheckoutsFromIp, recordCheckoutFromIp } from "@/lib/services/cart-rate-limit";
import { processEmailQueue } from "@/lib/services/email";
import { recordOperationalError } from "@/lib/observability";
import { safeErrorMetadata } from "@/lib/safe-log";
import { orderTokenCookieName, orderTokenCookieOptions } from "@/lib/order-access";

export type CheckoutState = {
  error: string | null;
  fieldErrors: Record<string, string>;
  /** Codice errore di dominio: guida la UI (es. ricaricare il riepilogo, accedere). */
  code?: string;
};

/** Errori di dominio che riguardano un campo preciso del form. */
const FIELD_BY_CODE: Record<string, string> = {
  SLOT_UNAVAILABLE: "slot",
  SLOT_FULL: "slot",
  SHIPPING_NOT_ALLOWED: "shippingRateId",
  PAYMENT_METHOD_NOT_ALLOWED: "paymentMethod"
};

/**
 * Dopo un ordine (nuovo o ritentato): cookie di accesso alla pagina ordine
 * (niente token nell'URL) e redirect a Stripe o alla pagina ordine.
 */
async function finishCheckout(placed: PlacedOrder): Promise<never> {
  const store = await cookies();
  store.set(orderTokenCookieName(placed.code), placed.publicToken, orderTokenCookieOptions(placed.code));
  store.delete(CART_COOKIE);
  revalidatePath("/", "layout");
  // Conferma a cliente e sede subito dopo la risposta, senza attendere il cron.
  after(() => processEmailQueue({ limit: 10 }).then(() => undefined).catch(() => undefined));
  const params = new URLSearchParams();
  if (placed.paymentInitError) params.set("payment", "failed");
  if (placed.replayed) params.set("ripetuto", "1");
  const orderUrl = `/ordine/${encodeURIComponent(placed.code)}${params.size ? `?${params}` : ""}`;
  redirect(placed.redirectUrl ?? orderUrl);
}

export async function placeOrderAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { error: "Controlla i campi evidenziati.", fieldErrors };
  }

  // Ritentativo di un ordine già creato (risposta persa, doppio invio): si
  // torna all'ordine esistente prima di guardare il carrello, che e già convertito.
  let placed: PlacedOrder | null = null;
  const requestHeaders = await headers();
  try {
    const existing = await findOrderForCheckoutKey(parsed.data.checkoutIdempotencyKey);
    if (!existing) {
      const store = await cookies();
      const token = store.get(CART_COOKIE)?.value;
      const cart = token ? await getCartByToken(token) : null;
      if (!cart || cart.items.length === 0) {
        return { error: "Il carrello è vuoto o è già stato ordinato. Controlla le email o la sezione ordini.", fieldErrors: {} };
      }
      await enforceCartRateLimit(requestHeaders, token, "checkout");
      const [sessionCustomer, recentOrdersFromIp] = await Promise.all([
        getSessionCustomer(),
        recentCheckoutsFromIp(requestHeaders)
      ]);
      placed = await placeOrder(cart, parsed.data, {
        authenticatedCustomerId: sessionCustomer?.id ?? null,
        recentOrdersFromIp
      });
      if (!placed.replayed) await recordCheckoutFromIp(requestHeaders);
    } else {
      placed = await resumeCheckoutOrder(existing);
    }
  } catch (error) {
    if (error instanceof DomainError) {
      const field = FIELD_BY_CODE[error.code];
      return {
        error: error.message,
        fieldErrors: field ? { [field]: error.message } : {},
        code: error.code
      };
    }
    await recordOperationalError({
      level: "ERROR",
      source: "checkout-action",
      code: "CHECKOUT_UNEXPECTED_ERROR",
      message: "Errore inatteso durante il checkout.",
      error,
      metadata: safeErrorMetadata(error)
    });
    return {
      error: "Si è verificato un errore imprevisto. Prima di riprovare controlla la tua email: se hai ricevuto la conferma, l'ordine è stato registrato.",
      fieldErrors: {}
    };
  }
  return finishCheckout(placed);
}
