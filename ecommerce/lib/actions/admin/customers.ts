"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { backWithMessage, requireString } from "./helpers";

export async function saveCustomerNotesAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const notes = String(formData.get("notes") ?? "");
  await prisma.customer.update({ where: { id }, data: { notes } });
  await audit(user.email, "customer.notes", "Customer", id);
  const path = `/admin/clienti/${id}`;
  revalidatePath(path);
  backWithMessage(path, "Note salvate.");
}
