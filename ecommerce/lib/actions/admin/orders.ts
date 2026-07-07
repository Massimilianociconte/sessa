"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain";
import { setAdminNote, setTracking, transitionOrder } from "@/lib/services/orders";
import { orderTransitionSchema } from "@/lib/validation";
import { backWithError, backWithMessage, requireString } from "./helpers";

export async function transitionOrderAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
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
    await transitionOrder(parsed.data.orderId, parsed.data.to, user.email, {
      note: parsed.data.note,
      paymentRef: parsed.data.paymentRef
    });
  } catch (error) {
    if (error instanceof DomainError) backWithError(path, error.message);
    throw error;
  }
  revalidatePath("/admin/ordini");
  revalidatePath(path);
  backWithMessage(path, "Stato aggiornato.");
}

export async function setTrackingAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const orderId = requireString(formData, "orderId");
  const carrier = requireString(formData, "carrier");
  const code = requireString(formData, "code");
  await setTracking(orderId, carrier, code, user.email);
  const path = `/admin/ordini/${orderId}`;
  revalidatePath(path);
  backWithMessage(path, "Tracking salvato.");
}

export async function saveAdminNoteAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const orderId = requireString(formData, "orderId");
  const note = String(formData.get("note") ?? "");
  await setAdminNote(orderId, note, user.email);
  const path = `/admin/ordini/${orderId}`;
  revalidatePath(path);
  backWithMessage(path, "Nota salvata.");
}
