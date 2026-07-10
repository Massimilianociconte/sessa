import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";
import { reconcileStripeFailure, reconcileStripeSuccess } from "@/lib/services/payment-attempts";

export const dynamic = "force-dynamic";

function paymentIntentRef(session: Stripe.Checkout.Session): string | null {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? null;
}

/** Firma Stripe + riconciliazione per sessione esatta, importo e valuta. */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe non configurato." }, { status: 501 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Firma mancante." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Firma non valida." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      // checkout.session.completed puo precedere l'incasso per metodi asincroni.
      if (session.payment_status === "paid") {
        await reconcileStripeSuccess({
          providerRef: session.id,
          providerPaymentRef: paymentIntentRef(session),
          amountCents: session.amount_total,
          currency: session.currency,
          metadataOrderId: session.metadata?.orderId || undefined,
          metadataAttemptId: session.metadata?.paymentAttemptId || undefined
        });
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await reconcileStripeFailure(
        session.id,
        "FAILED",
        "Pagamento Stripe non riuscito: il cliente puo riprovare."
      );
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await reconcileStripeFailure(
        session.id,
        "EXPIRED",
        "Sessione Stripe scaduta prima della conferma del pagamento."
      );
    }
  } catch (error) {
    // Un errore DB/transitorio deve produrre 5xx: Stripe ritentera il webhook.
    console.error("Riconciliazione webhook Stripe fallita:", {
      eventId: event.id,
      eventType: event.type,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ error: "Riconciliazione temporaneamente non disponibile." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
