"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPasswordOrDummy, passwordNeedsRehash, hashPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSessionUser, pruneExpiredSessions } from "@/lib/auth/session";
import {
  blockedForAny,
  clearAttemptKeys,
  registerFailedAttempts
} from "@/lib/auth/rate-limit";
import { loginSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { getClientIp, getRequestSecurityContext, rateLimitKey } from "@/lib/auth/request-context";
import { safeNextPath } from "@/lib/auth/redirects";
import { verifyAdminSecondFactor } from "@/lib/services/admin-2fa";

export type LoginState = { error: string | null; needsTwoFactor: boolean };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) {
    return { error: "Inserisci email e password.", needsTwoFactor: false };
  }

  // Anti-brute-force: chiave IP+email, così non si può chiudere fuori l'admin
  // legittimo da un altro IP.
  const ip = await getClientIp();
  const rateKeys = [
    rateLimitKey("admin-login-ip", ip),
    rateLimitKey("admin-login-account", parsed.data.email)
  ];
  const blockedMs = await blockedForAny(rateKeys);
  if (blockedMs !== null) {
    const minutes = Math.ceil(blockedMs / 60000);
    return { error: `Troppi tentativi falliti. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.`, needsTwoFactor: false };
  }

  const user = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  // Messaggio identico per utente inesistente e password errata: niente enumerazione account.
  const passwordValid = verifyPasswordOrDummy(parsed.data.password, user?.passwordHash);
  if (!user || !user.isActive || !passwordValid) {
    await registerFailedAttempts(rateKeys);
    return { error: "Credenziali non valide.", needsTwoFactor: false };
  }

  if (user.totpEnabledAt) {
    const code = String(formData.get("code") ?? "");
    const secondFactorKeys = [
      rateLimitKey("admin-2fa-ip", ip),
      rateLimitKey("admin-2fa-account", user.id)
    ];
    if (!code) {
      return { error: null, needsTwoFactor: true };
    }
    const secondFactorBlockedMs = await blockedForAny(secondFactorKeys);
    if (secondFactorBlockedMs !== null) {
      return {
        error: `Troppi codici non validi. Riprova tra ${Math.ceil(secondFactorBlockedMs / 60000)} minuti.`,
        needsTwoFactor: true
      };
    }
    if (!(await verifyAdminSecondFactor(user.id, code))) {
      await registerFailedAttempts(secondFactorKeys);
      return { error: "Codice authenticator o di recupero non valido.", needsTwoFactor: true };
    }
    await clearAttemptKeys(secondFactorKeys);
  }

  await clearAttemptKeys(rateKeys);
  await pruneExpiredSessions();
  // Upgrade trasparente del costo KDF per hash legacy (N=16384 → corrente).
  if (passwordNeedsRehash(user.passwordHash)) {
    await prisma.adminUser
      .update({
        where: { id: user.id },
        data: { passwordHash: hashPassword(parsed.data.password) }
      })
      .catch(() => undefined);
  }
  const context = await getRequestSecurityContext();
  await createSession(user.id, context.userAgent ?? undefined, Boolean(user.totpEnabledAt));
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.email, "auth.login", "AdminUser", user.id);
  redirect(safeNextPath(formData.get("next"), "/admin", "/admin"));
}

export async function logoutAction(): Promise<void> {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit(user.email, "auth.logout", "AdminUser", user.id);
  redirect("/admin/login");
}
