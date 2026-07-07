import Stripe from "stripe";
import { SITE_URL } from "@/lib/site";
import type { PaymentInitInput, PaymentInitResult, PaymentProvider } from "./types";

/**
 * Provider Stripe. Attivo solo quando STRIPE_SECRET_KEY è impostata; altrimenti
 * init() ritorna ok:false e il checkout resta sul provider manuale.
 *
 * Attivazione:
 * 1. Impostare STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET in .env
 * 2. Configurare il webhook Stripe su /api/webhooks/stripe (evento
 *    checkout.session.completed) — la route verifica la firma.
 * 3. Nel checkout comparirà il metodo "Carta di credito".
 */

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cached: Stripe | null = null;
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe non configurato.");
  if (!cached) cached = new Stripe(process.env.STRIPE_SECRET_KEY);
  return cached;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Stripe",

  async init(input: PaymentInitInput): Promise<PaymentInitResult> {
    if (!isStripeConfigured()) {
      return { ok: false, error: "Stripe non configurato." };
    }
    try {
      const stripe = getStripe();
      const metadata = {
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
      });
      return {
        ok: true,
        reference: session.id,
        redirectUrl: session.url ?? undefined
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Errore Stripe." };
    }
  },

  async refund(reference: string, amountCents: number): Promise<{ ok: boolean; error?: string }> {
    if (!isStripeConfigured()) return { ok: false, error: "Stripe non configurato." };
    try {
      const stripe = getStripe();
      // reference è l'id della Checkout Session: recupero il PaymentIntent.
      const session = await stripe.checkout.sessions.retrieve(reference);
      const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
      if (!paymentIntent) return { ok: false, error: "PaymentIntent non trovato." };
      await stripe.refunds.create({ payment_intent: paymentIntent, amount: amountCents });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Errore rimborso." };
    }
  }
};
