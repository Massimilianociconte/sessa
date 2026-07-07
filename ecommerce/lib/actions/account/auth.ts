"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { linkReferralOnSignup, REFERRAL_COOKIE } from "@/lib/services/referral";
import { verifyPassword } from "@/lib/auth/password";
import {
  createCustomerSession,
  destroyAllCustomerSessions,
  destroyCustomerSessionById,
  destroyOtherCustomerSessions,
  destroyCustomerSession,
  getSessionCustomer,
  pruneExpiredCustomerSessions
} from "@/lib/auth/customer-session";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import {
  consumeResetToken,
  createResetToken,
  registerCustomer
} from "@/lib/services/customer-account";
import { enqueueEmail } from "@/lib/services/email";
import { SITE_URL } from "@/lib/site";
import {
  customerLoginSchema,
  customerRegisterSchema,
  resetRequestSchema,
  resetSchema
} from "@/lib/validation";

export type AuthState = { error: string | null };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function describeSessionForEmail(session: { ipAddress: string | null; userAgent: string | null }): string {
  return [
    session.ipAddress ? `IP: ${session.ipAddress}` : null,
    session.userAgent ? `Dispositivo/browser: ${session.userAgent}` : null
  ].filter(Boolean).join("\n");
}

export async function registerCustomerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = customerRegisterSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone") ?? "",
    marketingOptIn: formData.get("marketingOptIn") === "on"
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  let customerId: string;
  try {
    customerId = await registerCustomer(parsed.data);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }

  // Collega un eventuale referral (cookie impostato da /r/[code]) e lo consuma.
  const cookieStore = await cookies();
  const refCode = cookieStore.get(REFERRAL_COOKIE)?.value;
  if (refCode) {
    await linkReferralOnSignup(customerId, parsed.data.email, refCode);
    cookieStore.delete(REFERRAL_COOKIE);
  }

  await createCustomerSession(customerId);
  redirect("/account");
}

export async function loginCustomerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = customerLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) return { error: "Inserisci email e password." };

  const rateKey = `cust:${await clientIp()}:${parsed.data.email}`;
  const blockedMs = isRateLimited(rateKey);
  if (blockedMs !== null) {
    const minutes = Math.ceil(blockedMs / 60000);
    return { error: `Troppi tentativi. Riprova tra ${minutes} minut${minutes === 1 ? "o" : "i"}.` };
  }

  const customer = await prisma.customer.findUnique({ where: { email: parsed.data.email } });
  if (!customer || !customer.passwordHash || !verifyPassword(parsed.data.password, customer.passwordHash)) {
    registerFailedAttempt(rateKey);
    return { error: "Credenziali non valide." };
  }
  clearAttempts(rateKey);
  await pruneExpiredCustomerSessions();
  const session = await createCustomerSession(customer.id);
  await enqueueEmail({
    toEmail: customer.email,
    subject: "Nuovo accesso al tuo account Sessa 1930",
    type: "SECURITY_LOGIN",
    body: `Ciao ${customer.firstName},\n\nabbiamo registrato un nuovo accesso al tuo account Sessa 1930.\n${describeSessionForEmail(session)}\n\nSe sei stato tu, non devi fare nulla. Se non riconosci questo accesso, entra nella sezione Sicurezza e chiudi le sessioni attive.`
  });
  redirect("/account");
}

export async function logoutCustomerAction(): Promise<void> {
  await destroyCustomerSession();
  redirect("/");
}

export async function logoutAllCustomerSessionsAction(): Promise<void> {
  const customer = await getSessionCustomer();
  if (customer) await destroyAllCustomerSessions(customer.id);
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
  if (result === "current") redirect("/account/login?all=1");
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
  const resetKey = `cust-reset:${await clientIp()}:${email}`;
  if (isRateLimited(resetKey) !== null) redirect("/account/recupera?sent=1");
  registerFailedAttempt(resetKey);

  const token = await createResetToken(email);
  if (token) {
    const link = `${SITE_URL}/account/reset?token=${token}`;
    await enqueueEmail({
      toEmail: parsed.data.email,
      subject: "Reimposta la tua password — Sessa 1930",
      body: `Per reimpostare la password apri questo link (valido 1 ora):\n${link}`,
      type: "PASSWORD_RESET"
    });
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
    await consumeResetToken(parsed.data.token, parsed.data.password);
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message };
    throw error;
  }
  redirect("/account/login?reset=1");
}
