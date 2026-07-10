import Stripe from "stripe";
import { SITE_URL } from "@/lib/site";
import type { PaymentInitInput, PaymentInitResult, PaymentProvider } from "./types";

/**
 * Provider Stripe. Attivo solo quando chiave API e segreto webhook sono entrambi
 * presenti: senza webhook firmato non possiamo confermare in sicurezza l'incasso.
 *
 * Attivazione:
 * 1. Impostare STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET in .env
 * 2. Configurare il webhook Stripe su /api/webhooks/stripe (evento
 *    checkout.session.completed) — la route verifica la firma.
 * 3. Nel checkout comparirà il metodo "Carta di credito".
 */

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

let cached: Stripe | null = null;
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe non configurato.");
  // Timeout nettamente inferiore al lease INITIALIZING (60s): nessuna seconda
  // lambda puo riacquisire il tentativo mentre questa chiamata e ancora viva.
  // I retry applicativi riusano poi la stessa idempotency key persistita.
  if (!cached) cached = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 15_000, maxNetworkRetries: 0 });
  return cached;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Stripe",

  async init(input: PaymentInitInput): Promise<PaymentInitResult> {
    if (!isStripeConfigured()) {
      return { ok: false, error: "Stripe non configurato.", retryable: false };
    }
    try {
      const stripe = getStripe();
      const metadata = {
        paymentAttemptId: input.attemptId,
        orderCode: input.orderCode,
        orderId: input.orderId ?? "",
        publicToken: input.publicToken
      };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        client_reference_id: input.orderCode,
        locale: "it",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              product_data: { name: `Ordine ${input.orderCode} — Sessa 1930` },
              unit_amount: input.totalCents
            }
          }
        ],
        allow_promotion_codes: false,
        billing_address_collection: "auto",
        customer_email: input.email,
        success_url: `${SITE_URL}/ordine/${input.orderCode}?t=${input.publicToken}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL}/ordine/${input.orderCode}?t=${input.publicToken}&payment=cancelled`,
        metadata,
        payment_intent_data: { metadata }
      }, { idempotencyKey: input.idempotencyKey });
      return {
        ok: true,
        reference: session.id,
        redirectUrl: session.url ?? undefined,
        expiresAt: new Date(session.expires_at * 1000)
      };
    } catch (error) {
      const type = typeof error === "object" && error !== null && "type" in error
        ? String((error as { type?: unknown }).type)
        : "";
      const retryable = ["StripeConnectionError", "StripeAPIError", "StripeRateLimitError", "StripeIdempotencyError"].includes(type);
      return { ok: false, error: error instanceof Error ? error.message : "Errore Stripe.", retryable };
    }
  },

  async refund(
    paymentReference: string,
    amountCents: number,
    idempotencyKey: string
  ): Promise<{ ok: boolean; reference?: string; error?: string }> {
    if (!isStripeConfigured()) return { ok: false, error: "Stripe non configurato." };
    try {
      const stripe = getStripe();
      const refund = await stripe.refunds.create(
        { payment_intent: paymentReference, amount: amountCents },
        { idempotencyKey }
      );
      return { ok: true, reference: refund.id };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Errore rimborso." };
    }
  },

  async cancel(reference: string): Promise<{ ok: boolean; error?: string }> {
    if (!isStripeConfigured()) return { ok: false, error: "Stripe non configurato." };
    try {
      const session = await getStripe().checkout.sessions.retrieve(reference);
      if (session.payment_status === "paid") return { ok: false, error: "Sessione gia pagata." };
      if (session.status === "open") await getStripe().checkout.sessions.expire(reference);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Chiusura sessione Stripe fallita." };
    }
  }
};
