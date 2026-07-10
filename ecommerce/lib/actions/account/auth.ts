"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { linkReferralOnSignup, REFERRAL_COOKIE } from "@/lib/services/referral";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import {
  createCustomerSession,
  destroyAllCustomerSessions,
  destroyCustomerSessionById,
  destroyOtherCustomerSessions,
  destroyCustomerSession,
  getSessionCustomer,
  pruneExpiredCustomerSessions
} from "@/lib/auth/customer-session";
import {
  blockedForAny,
  clearAttempts,
  clearAttemptKeys,
  isRateLimited,
  registerFailedAttempt,
  registerFailedAttempts
} from "@/lib/auth/rate-limit";
import { clearCustomerDisplayNameCookie, setCustomerDisplayNameCookie } from "@/lib/auth/display-name";
import {
  beginCustomerRegistrationRequest,
  consumeResetToken,
  createResetToken
} from "@/lib/services/customer-account";
import { verifySecondFactor } from "@/lib/services/customer-2fa";
import { enqueueEmail } from "@/lib/services/email";
import { SITE_URL } from "@/lib/site";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";
import { safeNextPath } from "@/lib/auth/redirects";
import {
  customerLoginSchema,
  customerRegistrationRequestSchema,
  resetRequestSchema,
  resetSchema
} from "@/lib/validation";

export type AuthState = {
  error: string | null;
  /** true quando l'account ha la 2FA attiva: la form deve chiedere il codice. */
  needsTotp?: boolean;
};

function describeSessionForEmail(session: { ipAddress: string | null; userAgent: string | null }): string {
  return [
    session.ipAddress ? `IP: ${session.ipAddress}` : null,
    session.userAgent ? `Dispositivo/browser: ${session.userAgent}` : null
  ].filter(Boolean).join("\n");
}

export async function registerCustomerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = customerRegistrationRequestSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") ?? ""
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const ip = await getClientIp();
  const throttleKeys = [
    rateLimitKey("registration-ip", ip),
    rateLimitKey("registration-email", parsed.data.email)
  ];
  if ((await blockedForAny(throttleKeys)) !== null) {
    return { error: "Troppe richieste. Riprova tra qualche minuto." };
  }
  await registerFailedAttempts(throttleKeys);

  try {
    // Nessuna password viene accettata prima della prova di possesso email.
    const request = await beginCustomerRegistrationRequest(parsed.data);
    const token = await createResetToken(request.email);
    if (!token) return { error: "Impossibile avviare la registrazione. Riprova." };
    const link = `${SITE_URL}/account/reset?token=${token}&activate=1`;
    const delivery = await enqueueEmail({
      toEmail: request.email,
      subject: request.alreadyRegistered
        ? "Accesso al tuo account Sessa 1930"
        : "Completa il tuo account Sessa 1930",
      body: request.alreadyRegistered
        ? `Ciao ${request.firstName},\n\nè stata richiesta una registrazione con questa email. Il tuo account esiste già: usa il link seguente per scegliere una nuova password in modo sicuro.\n${link}\n\nSe non sei stato tu, ignora questa email.`
        : `Ciao ${request.firstName},\n\ncompleta la registrazione scegliendo la password dal link seguente (valido 1 ora):\n${link}\n\nLa password viene scelta solo dopo la verifica dell'email, così nessuno può reclamare il tuo storico ordini.`,
      type: "PASSWORD_RESET"
    });
    if (delivery.status === "FAILED") {
      return { error: "Non siamo riusciti a inviare il link. Riprova più tardi." };
    }
    const dev = process.env.NODE_ENV !== "production" ? `&dev=${encodeURIComponent(link)}` : "";
    redirect(`/account/login?registration=1${dev}`);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function loginCustomerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = customerLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) return { error: "Inserisci email e password." };

  const ip = await getClientIp();
  const rateKeys = [
    rateLimitKey("customer-login-ip", ip),
    rateLimitKey("customer-login-account", parsed.data.email)
  ];
  const blockedMs = await blockedForAny(rateKeys);
  if (blockedMs !== null) {
    const minutes = Math.ceil(blockedMs / 60000);
    return { error: `Troppi tentativi. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` };
  }

  const customer = await prisma.customer.findUnique({ where: { email: parsed.data.email } });
  const passwordValid = verifyPasswordOrDummy(parsed.data.password, customer?.passwordHash);
  if (!customer || customer.anonymizedAt || !customer.passwordHash || !passwordValid) {
    await registerFailedAttempts(rateKeys);
    return { error: "Credenziali non valide." };
  }
  if (!customer.emailVerified) {
    return {
      error: "Conferma prima l'email. Se il link è scaduto, usa «Password dimenticata?» per riceverne uno nuovo."
    };
  }

  // Secondo fattore: se attivo, la password da sola non basta.
  if (customer.totpEnabledAt) {
    const totpCode = String(formData.get("totp") ?? "").trim();
    if (!totpCode) {
      // Password corretta → la form mostra il campo codice (nessuna sessione creata).
      return { error: null, needsTotp: true };
    }
    const totpKey = rateLimitKey("customer-totp", ip, customer.id);
    const totpBlocked = await isRateLimited(totpKey);
    if (totpBlocked !== null) {
      const minutes = Math.ceil(totpBlocked / 60000);
      return { error: `Troppi codici errati. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.`, needsTotp: true };
    }
    if (!(await verifySecondFactor(customer.id, totpCode))) {
      await registerFailedAttempt(totpKey);
      return { error: "Codice di verifica non valido.", needsTotp: true };
    }
    await clearAttempts(totpKey);
  }

  await clearAttemptKeys(rateKeys);
  await pruneExpiredCustomerSessions();
  const session = await createCustomerSession(customer.id);
  await setCustomerDisplayNameCookie(customer.firstName);
  await enqueueEmail({
    toEmail: customer.email,
    subject: "Nuovo accesso al tuo account Sessa 1930",
    type: "SECURITY_LOGIN",
    body: `Ciao ${customer.firstName},\n\nabbiamo registrato un nuovo accesso al tuo account Sessa 1930.\n${describeSessionForEmail(session)}\n\nSe sei stato tu, non devi fare nulla. Se non riconosci questo accesso, entra nella sezione Sicurezza e chiudi le sessioni attive.`
  }).catch(() => undefined);
  redirect(safeNextPath(formData.get("next"), "/account", "/account"));
}

export async function logoutCustomerAction(): Promise<void> {
  await destroyCustomerSession();
  await clearCustomerDisplayNameCookie();
  redirect("/");
}

export async function logoutAllCustomerSessionsAction(): Promise<void> {
  const customer = await getSessionCustomer();
  if (customer) await destroyAllCustomerSessions(customer.id);
  await clearCustomerDisplayNameCookie();
  redirect("/account/login?all=1");
}

export async function logoutOtherCustomerSessionsAction(): Promise<void> {
  const customer = await getSessionCustomer();
  if (!customer) redirect("/account/login");
  await destroyOtherCustomerSessions(customer.id);
  revalidatePath("/account/sicurezza");
  redirect("/account/sicurezza?msg=Sessioni%20degli%20altri%20dispositivi%20chiuse");
}

export async function logoutCustomerSessionAction(formData: FormData): Promise<void> {
  const customer = await getSessionCustomer();
  if (!customer) redirect("/account/login");
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) redirect("/account/sicurezza?err=Sessione%20non%20valida");
  const result = await destroyCustomerSessionById(customer.id, sessionId);
  if (result === "current") {
    await clearCustomerDisplayNameCookie();
    redirect("/account/login?all=1");
  }
  revalidatePath("/account/sicurezza");
  redirect(result === "missing" ? "/account/sicurezza?err=Sessione%20non%20trovata" : "/account/sicurezza?msg=Sessione%20chiusa");
}

/**
 * Richiesta reset password. Risposta sempre generica (niente enumerazione account).
 * In sviluppo il link viene incluso nel redirect per poter testare senza SMTP.
 */
export async function requestResetAction(formData: FormData): Promise<void> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/account/recupera?err=Email non valida");

  const email = parsed.data.email.toLowerCase();
  const ip = await getClientIp();
  const resetKeys = [
    rateLimitKey("customer-reset-ip", ip),
    rateLimitKey("customer-reset-account", email)
  ];
  if ((await blockedForAny(resetKeys)) !== null) redirect("/account/recupera?sent=1");
  await registerFailedAttempts(resetKeys);

  const token = await createResetToken(email);
  if (token) {
    const link = `${SITE_URL}/account/reset?token=${token}`;
    await enqueueEmail({
      toEmail: parsed.data.email,
      subject: "Reimposta la tua password — Sessa 1930",
      body: `Per reimpostare la password apri questo link (valido 1 ora):\n${link}`,
      type: "PASSWORD_RESET"
    }).catch(() => undefined);
    if (process.env.NODE_ENV !== "production") {
      redirect(`/account/recupera?sent=1&dev=${encodeURIComponent(link)}`);
    }
  }
  redirect("/account/recupera?sent=1");
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password")
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  try {
    const result = await consumeResetToken(parsed.data.token, parsed.data.password);
    const cookieStore = await cookies();
    const refCode = cookieStore.get(REFERRAL_COOKIE)?.value;
    if (refCode) {
      if (result.activated) {
        const customer = await prisma.customer.findUnique({
          where: { id: result.customerId },
          select: { email: true }
        });
        if (customer) await linkReferralOnSignup(result.customerId, customer.email, refCode);
      }
      cookieStore.delete(REFERRAL_COOKIE);
    }
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  redirect("/account/login?reset=1");
}
