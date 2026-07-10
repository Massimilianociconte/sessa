"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin, requireAdminCapability, rotateSessionsForUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { setSettings } from "@/lib/services/settings";
import { formDataToObject, storeSettingsSchema } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage } from "./helpers";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";

const PATH = "/admin/impostazioni";

export async function saveStoreSettingsAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("settings:manage");
  const parsed = storeSettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));

  await setSettings({
    "store.name": parsed.data.storeName,
    "store.email": parsed.data.storeEmail,
    "store.phone": parsed.data.storePhone ?? "",
    "store.address": parsed.data.storeAddress ?? "",
    "store.vat": parsed.data.storeVat ?? "",
    "payments.bankTransferInstructions": parsed.data.bankTransferInstructions ?? ""
  });
  await audit(user.email, "settings.update", "Setting", "store");
  revalidatePath("/", "layout");
  backWithMessage(PATH, "Impostazioni salvate.");
}

/** Solo il proprietario può gestire gli utenti del gestionale (controllo server-side). */
async function requireOwner(formData: FormData) {
  const user = await requireAdminCapability("admins:manage");
  if (user.role !== "OWNER") backWithError(PATH, "Solo il proprietario può gestire gli utenti.");
  const rateKey = rateLimitKey("owner-reauth", await getClientIp(), user.id);
  if ((await isRateLimited(rateKey)) !== null) {
    backWithError(PATH, "Troppi tentativi di conferma. Riprova più tardi.");
  }
  const ownerPassword = String(formData.get("ownerPassword") ?? "");
  const row = await prisma.adminUser.findUnique({
    where: { id: user.id },
    select: { passwordHash: true }
  });
  if (!row || !verifyPassword(ownerPassword, row.passwordHash)) {
    await registerFailedAttempt(rateKey);
    backWithError(PATH, "Password del proprietario non valida.");
  }
  await clearAttempts(rateKey);
  return user;
}

const ADMIN_ROLES = ["ADMIN", "STAFF"] as const;

export async function createAdminUserAction(formData: FormData): Promise<void> {
  const owner = await requireOwner(formData);
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "STAFF");

  if (name.length < 2 || name.length > 120) backWithError(PATH, "Inserisci un nome valido.");
  if (email.length > 254) backWithError(PATH, "Email non valida.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) backWithError(PATH, "Email non valida.");
  if (password.length < 12 || password.length > 128) {
    backWithError(PATH, "La password deve avere tra 12 e 128 caratteri.");
  }
  if (!ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) backWithError(PATH, "Ruolo non valido.");
  const clash = await prisma.adminUser.findUnique({ where: { email } });
  if (clash) backWithError(PATH, "Esiste già un utente con questa email.");

  let created: { id: string };
  try {
    created = await prisma.adminUser.create({
      data: { name, email, passwordHash: hashPassword(password), role },
      select: { id: true }
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      backWithError(PATH, "Esiste già un utente con questa email.");
    }
    throw error;
  }
  await audit(owner.email, "admin_user.create", "AdminUser", created.id, { email, role });
  backWithMessage(PATH, `Utente ${email} creato (${role}). Comunica la password in modo sicuro e falla cambiare al primo accesso.`);
}

export async function toggleAdminUserAction(formData: FormData): Promise<void> {
  const owner = await requireOwner(formData);
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId.length > 64) backWithError(PATH, "Utente non valido.");
  if (userId === owner.id) backWithError(PATH, "Non puoi disattivare il tuo stesso account.");
  const target = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!target) backWithError(PATH, "Utente non trovato.");
  if (target.role === "OWNER") backWithError(PATH, "Il proprietario non può essere disattivato.");

  const nextActive = !target.isActive;
  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: userId }, data: { isActive: nextActive } }),
    // Disattivazione = revoca immediata: nessuna sessione sopravvive.
    ...(nextActive ? [] : [prisma.adminSession.deleteMany({ where: { userId } })])
  ]);
  await audit(owner.email, nextActive ? "admin_user.enable" : "admin_user.disable", "AdminUser", userId);
  backWithMessage(PATH, nextActive ? "Utente riattivato." : "Utente disattivato e sessioni revocate.");
}

export async function resetAdminUserPasswordAction(formData: FormData): Promise<void> {
  const owner = await requireOwner(formData);
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId.length > 64) backWithError(PATH, "Utente non valido.");
  const password = String(formData.get("password") ?? "");
  if (password.length < 12 || password.length > 128) {
    backWithError(PATH, "La nuova password deve avere tra 12 e 128 caratteri.");
  }
  const target = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!target) backWithError(PATH, "Utente non trovato.");
  if (target.role === "OWNER" && target.id !== owner.id) {
    backWithError(PATH, "La password del proprietario si cambia solo dal suo profilo.");
  }

  await prisma.$transaction([
    prisma.adminUser.update({ where: { id: userId }, data: { passwordHash: hashPassword(password) } }),
    prisma.adminSession.deleteMany({ where: { userId } })
  ]);
  await audit(owner.email, "admin_user.password_reset", "AdminUser", userId);
  backWithMessage(PATH, "Password reimpostata e sessioni dell'utente revocate.");
}

export async function changeOwnPasswordAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 12 || next.length > 128) {
    backWithError(PATH, "La nuova password deve avere tra 12 e 128 caratteri.");
  }
  if (next !== confirm) backWithError(PATH, "Le password non coincidono.");

  const rateKey = rateLimitKey("admin-password-change", await getClientIp(), user.id);
  if ((await isRateLimited(rateKey)) !== null) {
    backWithError(PATH, "Troppi tentativi. Riprova più tardi.");
  }
  const dbUser = await prisma.adminUser.findUnique({ where: { id: user.id } });
  if (!dbUser || !verifyPassword(current, dbUser.passwordHash)) {
    await registerFailedAttempt(rateKey);
    backWithError(PATH, "Password attuale errata.");
  }
  await clearAttempts(rateKey);
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next) }
  });
  // Invalida TUTTE le sessioni e riapre solo quella corrente.
  await rotateSessionsForUser(user.id);
  await audit(user.email, "auth.password_change", "AdminUser", user.id);
  backWithMessage(PATH, "Password aggiornata. Le altre sessioni sono state disconnesse.");
}
