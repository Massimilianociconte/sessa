"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdminCapability } from "@/lib/auth/session";
import { processEmailQueue, retryEmailMessage } from "@/lib/services/email";
import { expireStockReservations } from "@/lib/services/stock-reservations";
import { notifyAbandonedCarts } from "@/lib/services/abandoned-carts";
import { backWithError, backWithMessage } from "@/lib/actions/admin/helpers";

const PATH = "/admin/osservabilita";

export async function resolveOperationalEventAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("operations:view");
  const eventId = String(formData.get("eventId") ?? "");
  if (!eventId || eventId.length > 64) backWithError(PATH, "Evento non valido.");
  const updated = await prisma.operationalEvent.updateMany({
    where: { id: eventId, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedBy: user.email }
  });
  if (updated.count === 0) backWithError(PATH, "Evento già risolto o non trovato.");
  await audit(user.email, "operations.resolve", "OperationalEvent", eventId);
  revalidatePath(PATH);
  backWithMessage(PATH, "Evento segnato come risolto.");
}

export async function runEmailWorkerAction(): Promise<void> {
  const user = await requireAdminCapability("operations:view");
  const result = await processEmailQueue({ limit: 10 });
  await audit(user.email, "operations.email_worker", "EmailMessage", "batch", result);
  revalidatePath(PATH);
  backWithMessage(PATH, `Email: ${result.sent} inviate, ${result.failed} da ritentare, ${result.dead} bloccate.`);
}

export async function runStockReservationWorkerAction(): Promise<void> {
  const user = await requireAdminCapability("operations:view");
  const result = await expireStockReservations(10);
  await audit(user.email, "operations.stock_worker", "Order", "batch", result);
  revalidatePath(PATH);
  backWithMessage(PATH, `Prenotazioni: ${result.released} rilasciate, ${result.recoveredPaid} pagamenti recuperati, ${result.deferred} sospese.`);
}

export async function runAbandonedCartWorkerAction(): Promise<void> {
  const user = await requireAdminCapability("operations:view");
  const result = await notifyAbandonedCarts();
  await audit(user.email, "operations.abandoned_carts", "Cart", "batch", result);
  revalidatePath(PATH);
  backWithMessage(PATH, `Carrelli abbandonati: ${result.sent} avvisi su ${result.scanned} scansionati.`);
}

export async function retryEmailAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("operations:view");
  const emailId = String(formData.get("emailId") ?? "");
  if (!emailId || emailId.length > 64) backWithError(PATH, "Messaggio non valido.");
  if (!(await retryEmailMessage(emailId))) backWithError(PATH, "Messaggio non ritentabile o già elaborato.");
  await audit(user.email, "operations.email_retry", "EmailMessage", emailId);
  revalidatePath(PATH);
  backWithMessage(PATH, "Messaggio rimesso in coda.");
}
