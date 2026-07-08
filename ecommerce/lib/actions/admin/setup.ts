"use server";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";

export type SetupState = { error: string | null };
export const initialSetupState: SetupState = { error: null };

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Bootstrap del PRIMO account gestionale (OWNER). Difese:
 * - attivo SOLO quando non esiste alcun AdminUser (dopo, la pagina sparisce);
 * - in produzione richiede il token segreto ADMIN_SETUP_TOKEN impostato via env;
 * - rate limit per IP, password minima 12 caratteri, creazione atomica
 *   (unique su email + doppio count dentro la transazione contro le race).
 */
export async function setupFirstAdminAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const rateKey = `admin-setup:${ip}`;
  if (isRateLimited(rateKey) !== null) {
    return { error: "Troppi tentativi. Riprova tra qualche minuto." };
  }

  const existing = await prisma.adminUser.count();
  if (existing > 0) {
    return { error: "Il gestionale è già configurato: accedi dalla pagina di login." };
  }

  const envToken = process.env.ADMIN_SETUP_TOKEN ?? "";
  if (process.env.NODE_ENV === "production" && !envToken) {
    return { error: "Configurazione bloccata: imposta ADMIN_SETUP_TOKEN nelle variabili d'ambiente." };
  }
  if (envToken) {
    const provided = String(formData.get("setupToken") ?? "");
    if (!provided || !safeEqual(provided, envToken)) {
      registerFailedAttempt(rateKey);
      return { error: "Token di configurazione errato." };
    }
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (name.length < 2) return { error: "Inserisci il nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email non valida." };
  if (password.length < 12) return { error: "La password deve avere almeno 12 caratteri." };
  if (password !== confirm) return { error: "Le password non coincidono." };

  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      // Ricontrolla DENTRO la transazione: due submit simultanei non creano due owner.
      const count = await tx.adminUser.count();
      if (count > 0) throw new Error("ALREADY_CONFIGURED");
      const created = await tx.adminUser.create({
        data: { name, email, passwordHash: hashPassword(password), role: "OWNER" }
      });
      return created.id;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_CONFIGURED") {
      return { error: "Il gestionale è già configurato: accedi dalla pagina di login." };
    }
    // Vincolo unique email o altro errore imprevisto.
    registerFailedAttempt(rateKey);
    return { error: "Creazione non riuscita. Riprova." };
  }

  await audit(email, "auth.setup_owner", "AdminUser", userId, { ip });
  await createSession(userId, h.get("user-agent") ?? undefined);
  redirect("/admin");
}
