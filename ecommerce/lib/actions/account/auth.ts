"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { linkReferralOnSignup, REFERRAL_COOKIE } from "@/lib/services/referral";
import { verifyPasswordOrDummy, passwordNeedsRehash, hashPassword } from "@/lib/auth/password";
import {
  createCustomerSession,
  destroyAllCustomerSessions,
  destroyCustomerSessionById,
  destroyOtherCustomerSessions,
  destroyCustomerSession,
  getSessionCustomer,
  pruneExpiredCustomerSessions
} from "@/lib/auth/customer-session";
import { blockedForAny, clearAttemptKeys, registerFailedAttempts } from "@/lib/auth/rate-limit";
import { clearCustomerDisplayNameCookie, setCustomerDisplayNameCookie } from "@/lib/auth/display-name";
import { consumeResetToken, createResetToken } from "@/lib/services/customer-account";
import { beginRegistration, completeRegistration } from "@/lib/services/registration";
import { verifySecondFactor } from "@/lib/services/customer-2fa";
import { enqueueEmail } from "@/lib/services/email";
import { SITE_URL } from "@/lib/site";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";
import { safeNextPath } from "@/lib/auth/redirects";
import { recordOperationalError } from "@/lib/observability";
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
    phone: formData.get("phone") ?? "",
    acceptPrivacy: formData.get("acceptPrivacy")
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
    // Nessun account creato e nessuna password accettata prima della prova di possesso email.
    const started = await beginRegistration(parsed.data);
    // Risposta delivery-blind (anti-enumerazione): un fallito invio NON deve
    // distinguersi dalla risposta per email inesistente. Il guasto viene
    // registrato per gli operatori, che possono riprocessare la coda.
    if (started.delivery?.status === "FAILED") {
      await recordOperationalError({
        level: "WARNING",
        source: "account-registration",
        code: "REGISTRATION_EMAIL_DELIVERY_FAILED",
        message: "Invio email di registrazione fallito; risposta neutra già restituita all'utente.",
        error: started.delivery.error ? new Error(started.delivery.error) : undefined
      });
    }
    const dev = process.env.NODE_ENV !== "production" && started.devLink ? `&dev=${encodeURIComponent(started.devLink)}` : "";
    redirect(`/account/login?registration=1${dev}`);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
}

export async function activateAccountAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password")
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  try {
    const result = await completeRegistration(parsed.data.token, parsed.data.password);
    const cookieStore = await cookies();
    const refCode = cookieStore.get(REFERRAL_COOKIE)?.value;
    if (refCode) {
      await linkReferralOnSignup(result.customerId, result.email, refCode).catch(() => undefined);
      cookieStore.delete(REFERRAL_COOKIE);
    }
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  redirect("/account/login?activated=1");
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

  // Upgrade trasparente: hash creati con il costo precedente (N=16384) vengono
  // ri-hashati al costo corrente dopo una verifica riuscita.
  if (passwordNeedsRehash(customer.passwordHash)) {
    await prisma.customer
      .update({
        where: { id: customer.id },
        data: { passwordHash: hashPassword(parsed.data.password) }
      })
      .catch(() => undefined);
  }

  // Secondo fattore: se attivo, la password da sola non basta.
  if (customer.totpEnabledAt) {
    const totpCode = String(formData.get("totp") ?? "").trim();
    if (!totpCode) {
      // Password corretta → la form mostra il campo codice (nessuna sessione creata).
      return { error: null, needsTotp: true };
    }
    // Limite per IP e per account: un attaccante con molti IP non può
    // provare migliaia di codici sullo stesso account.
    const totpKeys = [rateLimitKey("customer-totp", ip, customer.id), rateLimitKey("customer-totp-account", customer.id)];
    const totpBlocked = await blockedForAny(totpKeys);
    if (totpBlocked !== null) {
      const minutes = Math.ceil(totpBlocked / 60000);
      return { error: `Troppi codici errati. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.`, needsTotp: true };
    }
    if (!(await verifySecondFactor(customer.id, totpCode))) {
      await registerFailedAttempts(totpKeys);
      return { error: "Codice di verifica non valido.", needsTotp: true };
    }
    await clearAttemptKeys(totpKeys);
  }

  await clearAttemptKeys(rateKeys);
  await pruneExpiredCustomerSessions();
  const session = await createCustomerSession(customer.id);
  await setCustomerDisplayNameCookie(customer.firstName);
  const { syncCartCookieAfterLogin } = await import("@/lib/services/cart");
  await syncCartCookieAfterLogin(customer.id).catch(() => undefined);
  await enqueueEmail({
    toEmail: customer.email,
    subject: "Nuovo accesso al tuo account Sessa 1930",
    type: "SECURITY_LOGIN",
    body: `Ciao ${customer.firstName},\n\nabbiamo registrato un nuovo accesso al tuo account Sessa 1930.\n${describeSessionForEmail(session)}\n\nSe sei stato tu, non devi fare nulla. Se non riconosci questo accesso, chiudi le sessioni attive e cambia la password.`,
    cta: { url: `${SITE_URL}/account/sicurezza`, label: "Controlla le sessioni" }
  }).catch(() => undefined);
  redirect(safeNextPath(formData.get("next"), "/account", "/account"));
}

export async function logoutCustomerAction(): Promise<void> {
  const { isolateCurrentCartCookie } = await import("@/lib/services/cart");
  await isolateCurrentCartCookie();
  await destroyCustomerSession();
  await clearCustomerDisplayNameCookie();
  redirect("/");
}

export async function logoutAllCustomerSessionsAction(): Promise<void> {
  const { isolateCurrentCartCookie } = await import("@/lib/services/cart");
  await isolateCurrentCartCookie();
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
    const { isolateCurrentCartCookie } = await import("@/lib/services/cart");
    await isolateCurrentCartCookie();
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
  if (!parsed.success) redirect(`/account/recupera?err=${encodeURIComponent("Email non valida")}`);

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
    const delivery = await enqueueEmail({
      toEmail: parsed.data.email,
      subject: "Reimposta la tua password — Sessa 1930",
      body: "Ciao,\n\nper reimpostare la password usa il pulsante qui sotto (link valido 1 ora). Se non hai richiesto tu il cambio, ignora questa email: la password resta invariata.",
      cta: { url: link, label: "Reimposta la password" },
      type: "PASSWORD_RESET"
    });
    // Delivery-blind anche qui: niente errore distintivo per l'utente.
    if (delivery.status === "FAILED") {
      recordOperationalError({
        level: "WARNING",
        source: "account-reset",
        code: "RESET_EMAIL_DELIVERY_FAILED",
        message: "Invio email di reset fallito; risposta neutra già restituita all'utente.",
        error: delivery.error ? new Error(delivery.error) : undefined
      });
    }
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
