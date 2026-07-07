"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { getOrderForTracking } from "@/lib/services/orders";

function prismaErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : null;
}

export async function retryOrderPaymentAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const publicToken = String(formData.get("publicToken") ?? "");
  const order = code && publicToken ? await getOrderForTracking(code, publicToken) : null;
  if (!order) redirect("/");

  const backUrl = `/ordine/${order.code}?t=${order.publicToken}`;
  const amountDueCents = Math.max(0, order.totalCents - order.giftCardCents);
  const canRetry =
    order.status === "PENDING_PAYMENT" &&
    order.paymentProvider === "stripe" &&
    order.paymentMethod === "card" &&
    order.paymentStatus !== "PAID" &&
    amountDueCents > 0;

  if (!canRetry) redirect(`${backUrl}&payment=retry-unavailable`);

  const provider = getPaymentProvider(order.paymentProvider);
  const init = await provider.init({
    orderId: order.id,
    orderCode: order.code,
    publicToken: order.publicToken,
    totalCents: amountDueCents,
    email: order.email,
    method: order.paymentMethod
  });

  if (!init.ok) {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "PAYMENT",
        message: `Nuovo tentativo di pagamento non riuscito: ${init.error}`,
        actor: "storefront"
      }
    });
    redirect(`${backUrl}&payment=failed`);
  }

  try {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PENDING",
        paymentRef: init.reference
      }
    });
  } catch (error) {
    if (prismaErrorCode(error) !== "P2002") throw error;
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        type: "PAYMENT",
        message: "Nuovo tentativo non collegato: riferimento pagamento gia associato a un altro ordine.",
        actor: "storefront"
      }
    });
    redirect(`${backUrl}&payment=failed`);
  }
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      type: "PAYMENT",
      message: "Cliente reindirizzato a Stripe per un nuovo tentativo di pagamento.",
      actor: "storefront"
    }
  });

  redirect(init.redirectUrl ?? `${backUrl}&payment=retry-unavailable`);
}
