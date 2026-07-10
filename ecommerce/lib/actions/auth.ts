"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
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

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) {
    return { error: "Inserisci email e password." };
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
    return { error: `Troppi tentativi falliti. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` };
  }

  const user = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  // Messaggio identico per utente inesistente e password errata: niente enumerazione account.
  const passwordValid = verifyPasswordOrDummy(parsed.data.password, user?.passwordHash);
  if (!user || !user.isActive || !passwordValid) {
    await registerFailedAttempts(rateKeys);
    return { error: "Credenziali non valide." };
  }

  await clearAttemptKeys(rateKeys);
  await pruneExpiredSessions();
  const context = await getRequestSecurityContext();
  await createSession(user.id, context.userAgent ?? undefined);
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
