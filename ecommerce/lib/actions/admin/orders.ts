"use server";

import { revalidatePath } from "next/cache";
import { assertAdminLocationAccess, requireAdminCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { setAdminNote, setTracking, transitionOrder } from "@/lib/services/orders";
import { recordManualPayment, refundOrder } from "@/lib/services/payment-attempts";
import { orderTransitionSchema } from "@/lib/validation";
import { parseEuroToCents } from "@/lib/money";
import { backWithError, backWithMessage, requireString } from "./helpers";

export async function transitionOrderAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("orders:manage");
  const parsed = orderTransitionSchema.safeParse({
    orderId: formData.get("orderId"),
    to: formData.get("to"),
    note: formData.get("note") ?? undefined,
    paymentRef: formData.get("paymentRef") ?? undefined
  });
  if (!parsed.success) {
    backWithError("/admin/ordini", "Transizione non valida.");
  }
  const path = `/admin/ordini/${parsed.data.orderId}`;
  try {
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
      select: { locationId: true }
    });
    if (!order) throw new DomainError("Ordine non trovato.");
    assertAdminLocationAccess(user, order.locationId);
    if (parsed.data.to === "REFUNDED") {
      await requireAdminCapability("orders:refund");
      const refundRaw = String(formData.get("refundAmount") ?? "").trim();
      const amountCents = refundRaw ? parseEuroToCents(refundRaw) : undefined;
      await refundOrder(parsed.data.orderId, user.email, parsed.data.note, { amountCents });
    } else if (parsed.data.to === "PAID") {
      await recordManualPayment(parsed.data.orderId, user.email, parsed.data.paymentRef);
    } else {
      await transitionOrder(parsed.data.orderId, parsed.data.to, user.email, {
        note: parsed.data.note,
        paymentRef: parsed.data.paymentRef
      });
    }
  } catch (error) {
    if (error instanceof DomainError) backWithError(path, error.message);
    throw error;
  }
  revalidatePath("/admin/ordini");
  revalidatePath(path);
  backWithMessage(path, "Stato aggiornato.");
}

export async function setTrackingAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("orders:manage");
  const orderId = requireString(formData, "orderId", 64);
  const carrier = requireString(formData, "carrier", 80);
  const code = requireString(formData, "code", 120);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { locationId: true } });
  if (!order) backWithError("/admin/ordini", "Ordine non trovato.");
  assertAdminLocationAccess(user, order.locationId);
  await setTracking(orderId, carrier, code, user.email);
  const path = `/admin/ordini/${orderId}`;
  revalidatePath(path);
  backWithMessage(path, "Tracking salvato.");
}

export async function saveAdminNoteAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("orders:manage");
  const orderId = requireString(formData, "orderId", 64);
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 2_000) backWithError(`/admin/ordini/${orderId}`, "La nota non può superare 2000 caratteri.");
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { locationId: true } });
  if (!order) backWithError("/admin/ordini", "Ordine non trovato.");
  assertAdminLocationAccess(user, order.locationId);
  await setAdminNote(orderId, note, user.email);
  const path = `/admin/ordini/${orderId}`;
  revalidatePath(path);
  backWithMessage(path, "Nota salvata.");
}
