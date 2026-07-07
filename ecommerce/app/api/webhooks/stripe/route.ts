import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";
import { transitionOrder } from "@/lib/services/orders";
import type { OrderStatus } from "@/lib/domain";

export const dynamic = "force-dynamic";

/**
 * Webhook Stripe. Verifica la FIRMA (anti-falsificazione), poi su
 * checkout.session.completed segna l'ordine come pagato. Idempotente:
 * transitionOrder rifiuta transizioni non valide, quindi un evento duplicato
 * non ha effetto.
 */
function paymentIntentRef(session: Stripe.Checkout.Session): string | undefined {
  if (typeof session.payment_intent === "string") return session.payment_intent;
  return session.payment_intent?.id ?? session.id;
}

async function findOrderForStripeSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId || undefined;
  const orderCode = session.metadata?.orderCode || session.client_reference_id || undefined;
  if (orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (order) return order;
  }
  if (!orderCode) return null;
  return prisma.order.findUnique({ where: { code: orderCode } });
}

async function markStripePaymentFailed(session: Stripe.Checkout.Session, reason: string) {
  const order = await findOrderForStripeSession(session);
  if (!order || order.paymentStatus === "PAID" || order.status === "CANCELLED") return;
  const ref = paymentIntentRef(session) ?? session.id;
  if ((order.status as OrderStatus) === "PENDING_PAYMENT") {
    try {
      await transitionOrder(order.id, "CANCELLED", "stripe", {
        paymentRef: order.paymentRef ?? ref,
        paymentStatus: "FAILED",
        note: reason
      });
    } catch (error) {
      if (error instanceof DomainError) return;
      throw error;
    }
    return;
  }
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "FAILED",
      paymentRef: order.paymentRef ?? ref
    }
  });
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      type: "PAYMENT",
      message: reason,
      actor: "stripe"
    }
  });
}

export async function POST(request: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe non configurato." }, { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Firma mancante." }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return NextResponse.json(
      { error: `Firma non valida: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const order = await findOrderForStripeSession(session);
    if (order && (order.status as OrderStatus) === "PENDING_PAYMENT") {
      try {
        await transitionOrder(order.id, "PAID", "stripe", {
          paymentRef: paymentIntentRef(session),
          note: "Pagamento Stripe confermato"
        });
      } catch {
        // transizione non valida (già pagato): evento duplicato, si ignora
      }
    }
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await markStripePaymentFailed(
      event.data.object as Stripe.Checkout.Session,
      "Pagamento Stripe non riuscito: il cliente puo riprovare o scegliere un metodo alternativo."
    );
  }

  if (event.type === "checkout.session.expired") {
    await markStripePaymentFailed(
      event.data.object as Stripe.Checkout.Session,
      "Sessione Stripe scaduta prima della conferma del pagamento."
    );
  }

  return NextResponse.json({ received: true });
}
