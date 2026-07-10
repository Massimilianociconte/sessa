"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { backWithError, backWithMessage, requireString } from "./helpers";

export async function saveCustomerNotesAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("customers:manage");
  const id = requireString(formData, "id", 64);
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 2_000) backWithError(`/admin/clienti/${id}`, "Le note non possono superare 2000 caratteri.");
  await prisma.customer.update({ where: { id }, data: { notes } });
  await audit(user.email, "customer.notes", "Customer", id);
  const path = `/admin/clienti/${id}`;
  revalidatePath(path);
  backWithMessage(path, "Note salvate.");
}
