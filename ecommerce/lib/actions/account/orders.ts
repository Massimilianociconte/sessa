"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { requireCustomer } from "@/lib/auth/customer-session";
import { transitionOrder } from "@/lib/services/orders";
import { refundOrder } from "@/lib/services/payment-attempts";
import { requestReturn } from "@/lib/services/returns";
import { customerCancellation } from "@/lib/commerce/customer-cancellation";
import { getCustomerCancelHours } from "@/lib/services/commerce-settings";

/**
 * Annullamento self-service dell'ordine. Riusa transitionOrder/refundOrder:
 * macchina a stati, ricarico stock, rimborso Stripe ed email al cliente
 * (motivo "annullato su richiesta") sono gestiti li, in transazione.
 */
export async function cancelCustomerOrderAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const code = String(formData.get("code") ?? "");
  const back = `/account/ordini/${encodeURIComponent(code)}`;

  const order = await prisma.order.findUnique({ where: { code } });
  if (!order || order.customerId !== customer.id) {
    redirect(`/account/ordini?err=${encodeURIComponent("Ordine non trovato.")}`);
  }
  const check = customerCancellation(order, new Date(), await getCustomerCancelHours());
  if (!check.allowed) redirect(`${back}?err=${encodeURIComponent(check.reason)}`);

  try {
    const paymentCaptured = order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED";
    if (paymentCaptured) {
      await refundOrder(order.id, customer.email, "Annullato e rimborsato su richiesta del cliente dall'area personale.");
    } else {
      await transitionOrder(order.id, "CANCELLED", customer.email, {
        note: "Annullato dal cliente dall'area personale.",
        cancelReason: "CUSTOMER"
      });
    }
  } catch (error) {
    if (error instanceof DomainError) redirect(`${back}?err=${encodeURIComponent(error.message)}`);
    throw error;
  }

  revalidatePath("/account/ordini");
  revalidatePath(back);
  redirect(`${back}?msg=${encodeURIComponent("Ordine annullato. Ti abbiamo inviato la conferma via email.")}`);
}

export async function requestReturnAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const code = String(formData.get("code") ?? "");
  const back = `/account/ordini/${encodeURIComponent(code)}`;
  if (!reason) redirect(`${back}?err=${encodeURIComponent("Indica il motivo del reso.")}`);
  try {
    await requestReturn(orderId, customer.id, reason);
  } catch (error) {
    if (error instanceof DomainError) redirect(`${back}?err=${encodeURIComponent(error.message)}`);
    throw error;
  }
  revalidatePath(back);
  redirect(`${back}?msg=${encodeURIComponent("Segnalazione inviata alla sede: ti risponderemo via email.")}`);
}
