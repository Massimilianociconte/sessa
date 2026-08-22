"use server";

import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/domain";
import { verifyPassword } from "@/lib/auth/password";
import {
  destroyAdminSessionById,
  destroyOtherAdminSessions,
  requireAdmin,
  secureCurrentAdminSession
} from "@/lib/auth/session";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";
import type { AdminTwoFactorState } from "@/lib/actions/admin/twofactor-state";
import {
  confirmAdminTotpEnrollment,
  disableAdminTotp,
  regenerateAdminBackupCodes,
  startAdminTotpEnrollment
} from "@/lib/services/admin-2fa";

const PATH = "/admin/sicurezza";

async function verifyOwnPassword(adminId: string, password: string): Promise<boolean> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { passwordHash: true } });
  return Boolean(admin?.passwordHash && verifyPassword(password, admin.passwordHash));
}

export async function startAdminTotpAction(
  _previous: AdminTwoFactorState,
  formData: FormData
): Promise<AdminTwoFactorState> {
  const admin = await requireAdmin();
  const password = String(formData.get("password") ?? "");
  const rateKey = rateLimitKey("admin-totp-start", await getClientIp(), admin.id);
  if ((await isRateLimited(rateKey)) !== null) {
    return { error: "Troppi tentativi: riprova tra qualche minuto.", step: "idle" };
  }
  if (!(await verifyOwnPassword(admin.id, password))) {
    await registerFailedAttempt(rateKey);
    return { error: "Password errata.", step: "idle" };
  }
  await clearAttempts(rateKey);
  try {
    const { secret, uri } = await startAdminTotpEnrollment(admin.id);
    return {
      error: null,
      step: "pending",
      secret,
      qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 })
    };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, step: "idle" };
    throw error;
  }
}

export async function confirmAdminTotpAction(
  _previous: AdminTwoFactorState,
  formData: FormData
): Promise<AdminTwoFactorState> {
  const admin = await requireAdmin();
  const code = String(formData.get("code") ?? "");
  const rateKey = rateLimitKey("admin-totp-confirm", await getClientIp(), admin.id);
  if ((await isRateLimited(rateKey)) !== null) {
    return { error: "Troppi tentativi: riprova tra qualche minuto.", step: "pending" };
  }
  try {
    const backupCodes = await confirmAdminTotpEnrollment(admin.id, code);
    await secureCurrentAdminSession(admin.id);
    await clearAttempts(rateKey);
    await audit(admin.email, "auth.admin_2fa_enable", "AdminUser", admin.id);
    return { error: null, step: "enabled", backupCodes };
  } catch (error) {
    if (error instanceof DomainError) {
      await registerFailedAttempt(rateKey);
      return { error: error.message, step: "pending" };
    }
    throw error;
  }
}

export async function regenerateAdminBackupCodesAction(
  _previous: AdminTwoFactorState,
  formData: FormData
): Promise<AdminTwoFactorState> {
  const admin = await requireAdmin();
  const code = String(formData.get("code") ?? "");
  const rateKey = rateLimitKey("admin-totp-regen", await getClientIp(), admin.id);
  if ((await isRateLimited(rateKey)) !== null) {
    return { error: "Troppi tentativi: riprova tra qualche minuto.", step: "idle" };
  }
  try {
    const backupCodes = await regenerateAdminBackupCodes(admin.id, code);
    await clearAttempts(rateKey);
    await audit(admin.email, "auth.admin_2fa_backup_regenerate", "AdminUser", admin.id);
    return { error: null, step: "codes", backupCodes };
  } catch (error) {
    if (error instanceof DomainError) {
      await registerFailedAttempt(rateKey);
      return { error: error.message, step: "idle" };
    }
    throw error;
  }
}

export async function disableAdminTotpAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  const rateKey = rateLimitKey("admin-totp-disable", await getClientIp(), admin.id);
  if ((await isRateLimited(rateKey)) !== null) {
    redirect(`${PATH}?err=${encodeURIComponent("Troppi tentativi: riprova più tardi.")}`);
  }
  if (!(await verifyOwnPassword(admin.id, password))) {
    await registerFailedAttempt(rateKey);
    redirect(`${PATH}?err=${encodeURIComponent("Password errata.")}`);
  }
  try {
    await disableAdminTotp(admin.id, code);
    await destroyOtherAdminSessions(admin.id);
  } catch (error) {
    if (error instanceof DomainError) {
      await registerFailedAttempt(rateKey);
      redirect(`${PATH}?err=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  await clearAttempts(rateKey);
  await audit(admin.email, "auth.admin_2fa_disable", "AdminUser", admin.id);
  redirect(`${PATH}?msg=${encodeURIComponent("Verifica in due passaggi disattivata.")}`);
}

export async function logoutOtherAdminSessionsAction(): Promise<void> {
  const admin = await requireAdmin();
  await destroyOtherAdminSessions(admin.id);
  await audit(admin.email, "auth.admin_sessions_revoke_others", "AdminUser", admin.id);
  redirect(`${PATH}?msg=${encodeURIComponent("Le altre sessioni sono state disconnesse.")}`);
}

export async function logoutAdminSessionAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId || sessionId.length > 64) {
    redirect(`${PATH}?err=${encodeURIComponent("Sessione non valida.")}`);
  }
  const result = await destroyAdminSessionById(admin.id, sessionId);
  await audit(admin.email, "auth.admin_session_revoke", "AdminSession", sessionId);
  if (result === "current") redirect("/admin/login");
  redirect(`${PATH}?msg=${encodeURIComponent(result === "missing" ? "Sessione già chiusa." : "Sessione disconnessa.")}`);
}
