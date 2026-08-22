import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";
import { reconcileStripeExternalReversal, reconcileStripeFailure, reconcileStripeSuccess } from "@/lib/services/payment-attempts";
import { recordOperationalError, recordOperationalEvent } from "@/lib/observability";

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
        const result = await reconcileStripeSuccess({
          eventId: event.id,
          eventType: event.type,
          providerRef: session.id,
          providerPaymentRef: paymentIntentRef(session),
          amountCents: session.amount_total,
          currency: session.currency,
          metadataOrderId: session.metadata?.orderId || undefined,
          metadataAttemptId: session.metadata?.paymentAttemptId || undefined
        });
        if (result === "REVIEW") {
          await recordOperationalEvent({
            level: "CRITICAL",
            source: "stripe-webhook",
            code: "PAYMENT_REVIEW_REQUIRED",
            message: "Pagamento Stripe acquisito ma non riconciliato automaticamente.",
            correlationId: event.id,
            entityType: "StripeCheckoutSession",
            entityId: session.id,
            orderId: session.metadata?.orderId
          });
        }
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await reconcileStripeFailure(
        session.id,
        "FAILED",
        "Pagamento Stripe non riuscito: il cliente puo riprovare.",
        { eventId: event.id, eventType: event.type }
      );
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await reconcileStripeFailure(
        session.id,
        "EXPIRED",
        "Sessione Stripe scaduta prima della conferma del pagamento.",
        { eventId: event.id, eventType: event.type }
      );
    } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntent = typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
      await reconcileStripeExternalReversal({
        eventId: event.id,
        eventType: event.type,
        providerPaymentRef: paymentIntent,
        amountRefundedCents: charge.amount_refunded ?? null,
        amountCents: charge.amount ?? null
      });
    }
  } catch (error) {
    // Un errore DB/transitorio deve produrre 5xx: Stripe ritentera il webhook.
    console.error("Riconciliazione webhook Stripe fallita:", {
      eventId: event.id,
      eventType: event.type,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    await recordOperationalError({
      level: "CRITICAL",
      source: "stripe-webhook",
      code: "WEBHOOK_RECONCILIATION_FAILED",
      message: "Riconciliazione webhook Stripe fallita; il provider ritenterà l'evento.",
      correlationId: event.id,
      entityType: "StripeEvent",
      entityId: event.id,
      error,
      metadata: { eventType: event.type }
    });
    return NextResponse.json({ error: "Riconciliazione temporaneamente non disponibile." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
