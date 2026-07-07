"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { DomainError } from "@/lib/domain";
import { adjustStock } from "@/lib/services/inventory";
import { backWithError, backWithMessage } from "./helpers";

const PATH = "/admin/magazzino";

const adjustFormSchema = z.object({
  storeVariantId: z.string().min(1),
  qty: z.coerce.number().int().min(1, "Quantità minima 1").max(100000),
  direction: z.enum(["add", "remove"]),
  reason: z.enum(["RESTOCK", "ADJUSTMENT"]),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? undefined : v))
    .optional()
});

export async function adjustStockAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const backPath = String(formData.get("back") ?? PATH);
  const parsed = adjustFormSchema.safeParse({
    storeVariantId: formData.get("storeVariantId"),
    qty: formData.get("qty"),
    direction: formData.get("direction"),
    reason: formData.get("reason"),
    note: formData.get("note") ?? ""
  });
  if (!parsed.success) backWithError(backPath, parsed.error.issues[0]?.message ?? "Dati non validi.");
  const delta = parsed.data.direction === "add" ? parsed.data.qty : -parsed.data.qty;
  try {
    await adjustStock(parsed.data.storeVariantId, delta, parsed.data.reason, user.email, parsed.data.note);
  } catch (error) {
    if (error instanceof DomainError) backWithError(backPath, error.message);
    throw error;
  }
  revalidatePath(PATH);
  revalidatePath("/", "layout");
  backWithMessage(backPath, "Stock aggiornato.");
}
