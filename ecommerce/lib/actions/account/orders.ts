"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { requireCustomer } from "@/lib/auth/customer-session";
import { enqueueEmail } from "@/lib/services/email";
import { transitionOrder } from "@/lib/services/orders";

/** Stati da cui il CLIENTE può ancora annullare: prima che il laboratorio inizi la preparazione. */
const CUSTOMER_CANCELLABLE = ["PENDING_PAYMENT", "PAID"];

/**
 * Annullamento self-service dell'ordine. Riusa transitionOrder: macchina a stati,
 * ricarico stock della sede ed evento in cronologia inclusi.
 */
export async function cancelCustomerOrderAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const code = String(formData.get("code") ?? "");
  const back = `/account/ordini/${encodeURIComponent(code)}`;

  const order = await prisma.order.findUnique({ where: { code } });
  if (!order || order.customerId !== customer.id) {
    redirect(`/account/ordini?err=${encodeURIComponent("Ordine non trovato.")}`);
  }
  if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
    redirect(`${back}?err=${encodeURIComponent("L'ordine è già in preparazione: contatta la sede per assistenza.")}`);
  }

  try {
    await transitionOrder(order.id, "CANCELLED", customer.email, {
      note: "Annullato dal cliente dall'area personale."
    });
  } catch (error) {
    if (error instanceof DomainError) redirect(`${back}?err=${encodeURIComponent(error.message)}`);
    throw error;
  }

  await enqueueEmail({
    toEmail: customer.email,
    subject: `Ordine ${order.code} annullato — Sessa 1930`,
    type: "ORDER_CONFIRMATION",
    body: `Ciao ${customer.firstName},\n\nil tuo ordine ${order.code} è stato annullato come richiesto.${order.paymentStatus === "PAID" ? "\nSe il pagamento era già stato effettuato, verrà rimborsato dalla sede." : ""}\n\nGrazie,\nSessa 1930`
  });

  revalidatePath("/account/ordini");
  revalidatePath(back);
  redirect(`${back}?msg=${encodeURIComponent("Ordine annullato. Lo stock della sede è stato ripristinato.")}`);
}
