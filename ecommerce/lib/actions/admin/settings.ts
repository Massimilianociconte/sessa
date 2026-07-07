"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, rotateSessionsForUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { setSetting } from "@/lib/services/settings";
import { formDataToObject, storeSettingsSchema } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage } from "./helpers";

const PATH = "/admin/impostazioni";

export async function saveStoreSettingsAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = storeSettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));

  await setSetting("store.name", parsed.data.storeName);
  await setSetting("store.email", parsed.data.storeEmail);
  await setSetting("store.phone", parsed.data.storePhone ?? "");
  await setSetting("store.address", parsed.data.storeAddress ?? "");
  await setSetting("store.vat", parsed.data.storeVat ?? "");
  await setSetting(
    "payments.bankTransferInstructions",
    parsed.data.bankTransferInstructions ?? ""
  );
  await audit(user.email, "settings.update", "Setting", "store");
  revalidatePath("/", "layout");
  backWithMessage(PATH, "Impostazioni salvate.");
}

export async function changeOwnPasswordAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 10) backWithError(PATH, "La nuova password deve avere almeno 10 caratteri.");
  if (next !== confirm) backWithError(PATH, "Le password non coincidono.");

  const dbUser = await prisma.adminUser.findUnique({ where: { id: user.id } });
  if (!dbUser || !verifyPassword(current, dbUser.passwordHash)) {
    backWithError(PATH, "Password attuale errata.");
  }
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next) }
  });
  // Invalida TUTTE le sessioni e riapre solo quella corrente.
  await rotateSessionsForUser(user.id);
  await audit(user.email, "auth.password_change", "AdminUser", user.id);
  backWithMessage(PATH, "Password aggiornata. Le altre sessioni sono state disconnesse.");
}
