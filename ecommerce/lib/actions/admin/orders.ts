"use server";

import { revalidatePath } from "next/cache";
import { assertAdminLocationAccess, requireAdminCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { CUSTOMER_NOTIFIED_STATUSES, setAdminNote, setTracking, transitionOrder } from "@/lib/services/orders";
import { recordManualPayment, refundOrder } from "@/lib/services/payment-attempts";
import { resolveReturnRequest } from "@/lib/services/returns";
import { orderTransitionSchema } from "@/lib/validation";
import { parseEuroToCents } from "@/lib/money";
import { backWithError, backWithMessage, requireString } from "./helpers";

function parseOptionalEuro(raw: FormDataEntryValue | null): number | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  try {
    return parseEuroToCents(value);
  } catch {
    throw new DomainError("Importo non valido: usa il formato 10,00.");
  }
}

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
      select: { locationId: true, paymentMethod: true, paymentProvider: true, paymentStatus: true }
    });
    if (!order) throw new DomainError("Ordine non trovato.");
    assertAdminLocationAccess(user, order.locationId);
    if (parsed.data.to === "REFUNDED") {
      await requireAdminCapability("orders:refund");
      await refundOrder(parsed.data.orderId, user.email, parsed.data.note, {
        amountCents: parseOptionalEuro(formData.get("refundAmount"))
      });
    } else if (parsed.data.to === "PAID") {
      await recordManualPayment(parsed.data.orderId, user.email, parsed.data.paymentRef);
    } else {
      // Ritiro con pagamento in sede: consegna = incasso. Si registra il
      // pagamento prima, cosi KPI, referral e rimborsi vedono l'ordine pagato.
      if (
        parsed.data.to === "DELIVERED" &&
        order.paymentProvider === "manual" &&
        order.paymentMethod === "cash_on_pickup" &&
        order.paymentStatus !== "PAID"
      ) {
        await recordManualPayment(parsed.data.orderId, user.email, parsed.data.paymentRef ?? "incasso-al-ritiro");
      }
      await transitionOrder(parsed.data.orderId, parsed.data.to, user.email, {
        note: parsed.data.note,
        paymentRef: parsed.data.paymentRef,
        cancelReason: "STORE"
      });
    }
  } catch (error) {
    if (error instanceof DomainError) backWithError(path, error.message);
    throw error;
  }
  revalidatePath("/admin/ordini");
  revalidatePath(path);
  backWithMessage(
    path,
    CUSTOMER_NOTIFIED_STATUSES.includes(parsed.data.to) || parsed.data.to === "REFUNDED"
      ? "Stato aggiornato. Il cliente è stato avvisato via email."
      : "Stato aggiornato."
  );
}

export async function resolveReturnAction(formData: FormData): Promise<void> {
  const decision = formData.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const user = await requireAdminCapability(decision === "APPROVED" ? "orders:refund" : "orders:manage");
  const requestId = requireString(formData, "requestId", 64);
  const request = await prisma.returnRequest.findUnique({
    where: { id: requestId },
    select: { orderId: true, order: { select: { locationId: true } } }
  });
  if (!request) backWithError("/admin/ordini", "Segnalazione non trovata.");
  const path = `/admin/ordini/${request.orderId}`;
  try {
    assertAdminLocationAccess(user, request.order.locationId);
    await resolveReturnRequest(
      requestId,
      user.email,
      decision,
      parseOptionalEuro(formData.get("refundAmount")),
      String(formData.get("note") ?? "")
    );
  } catch (error) {
    if (error instanceof DomainError) backWithError(path, error.message);
    throw error;
  }
  revalidatePath(path);
  backWithMessage(path, decision === "APPROVED" ? "Segnalazione accolta e rimborso registrato." : "Segnalazione respinta, cliente avvisato.");
}

export async function setTrackingAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("orders:manage");
  const orderId = requireString(formData, "orderId", 64);
  const carrier = requireString(formData, "carrier", 80);
  const code = requireString(formData, "code", 120);
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { locationId: true } });
  if (!order) backWithError("/admin/ordini", "Ordine non trovato.");
  const path = `/admin/ordini/${orderId}`;
  try {
    assertAdminLocationAccess(user, order.locationId);
  } catch (error) {
    if (error instanceof DomainError) backWithError(path, error.message);
    throw error;
  }
  await setTracking(orderId, carrier, code, user.email);
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
  const path = `/admin/ordini/${orderId}`;
  try {
    assertAdminLocationAccess(user, order.locationId);
  } catch (error) {
    if (error instanceof DomainError) backWithError(path, error.message);
    throw error;
  }
  await setAdminNote(orderId, note, user.email);
  revalidatePath(path);
  backWithMessage(path, "Nota salvata.");
}
