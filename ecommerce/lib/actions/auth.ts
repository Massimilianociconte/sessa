"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, pruneExpiredSessions } from "@/lib/auth/session";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { loginSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export type LoginState = { error: string | null };

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local"
  );
}

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
  const rateKey = `${await clientIp()}:${parsed.data.email}`;
  const blockedMs = isRateLimited(rateKey);
  if (blockedMs !== null) {
    const minutes = Math.ceil(blockedMs / 60000);
    return { error: `Troppi tentativi falliti. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` };
  }

  const user = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  // Messaggio identico per utente inesistente e password errata: niente enumerazione account.
  if (!user || !user.isActive || !verifyPassword(parsed.data.password, user.passwordHash)) {
    registerFailedAttempt(rateKey);
    return { error: "Credenziali non valide." };
  }

  clearAttempts(rateKey);
  await pruneExpiredSessions();
  await createSession(user.id);
  await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(user.email, "auth.login", "AdminUser", user.id);
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}
