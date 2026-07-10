"use server";

import { redirect } from "next/navigation";
import { getOrderForTracking } from "@/lib/services/orders";
import { initializeOrderPayment } from "@/lib/services/payment-attempts";

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

  const launch = await initializeOrderPayment(order.id);
  if (launch.error) {
    redirect(`${backUrl}&payment=failed`);
  }
  redirect(launch.redirectUrl ?? `${backUrl}&payment=retry-unavailable`);
}
