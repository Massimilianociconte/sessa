"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from "@simplewebauthn/server";
import { DomainError } from "@/lib/domain";
import { createCustomerSession, requireCustomer, getSessionCustomer } from "@/lib/auth/customer-session";
import { setCustomerDisplayNameCookie } from "@/lib/auth/display-name";
import { isRateLimited, registerFailedAttempt, clearAttempts } from "@/lib/auth/rate-limit";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyLogin,
  finishPasskeyRegistration
} from "@/lib/services/customer-passkeys";
import { enqueueEmail } from "@/lib/services/email";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function fail<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error("[passkey]", error);
  return { ok: false, error: fallback };
}

/** Passo 1 registrazione: opzioni WebAuthn per il cliente loggato. */
export async function startPasskeyRegistrationAction(): Promise<
  ActionResult<PublicKeyCredentialCreationOptionsJSON>
> {
  try {
    const customer = await requireCustomer();
    const options = await beginPasskeyRegistration(customer);
    return { ok: true, data: options };
  } catch (error) {
    return fail(error, "Impossibile avviare la registrazione della passkey.");
  }
}

/** Passo 2 registrazione: verifica la risposta dell'authenticator e salva. */
export async function finishPasskeyRegistrationAction(
  response: RegistrationResponseJSON,
  name: string
): Promise<ActionResult<{ id: string; name: string }>> {
  try {
    const customer = await requireCustomer();
    const saved = await finishPasskeyRegistration(customer.id, response, name);
    await enqueueEmail({
      toEmail: customer.email,
      subject: "Nuova passkey aggiunta al tuo account Sessa 1930",
      type: "SECURITY_2FA",
      body: `Ciao ${customer.firstName},\n\nè stata aggiunta una nuova passkey ("${saved.name}") al tuo account. D'ora in poi potrai accedere anche senza password da quel dispositivo.\n\nSe non sei stato tu, elimina subito la passkey dalla sezione Sicurezza e cambia la password.`
    }).catch(() => undefined);
    revalidatePath("/account/sicurezza");
    return { ok: true, data: { id: saved.id, name: saved.name } };
  } catch (error) {
    return fail(error, "Registrazione passkey non riuscita.");
  }
}

/** Elimina una passkey del cliente loggato (form della sezione Sicurezza). */
export async function deletePasskeyAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const passkeyId = String(formData.get("passkeyId") ?? "");
  const removed = passkeyId ? await deletePasskey(customer.id, passkeyId) : false;
  revalidatePath("/account/sicurezza");
  redirect(
    removed
      ? "/account/sicurezza?msg=" + encodeURIComponent("Passkey eliminata.")
      : "/account/sicurezza?err=" + encodeURIComponent("Passkey non trovata.")
  );
}

/** Passo 1 login: opzioni assertion (usernameless, nessuna sessione richiesta). */
export async function startPasskeyLoginAction(): Promise<
  ActionResult<PublicKeyCredentialRequestOptionsJSON>
> {
  try {
    const rateKey = `passkey-login:${await clientIp()}`;
    if ((await isRateLimited(rateKey)) !== null) {
      return { ok: false, error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    const options = await beginPasskeyLogin();
    return { ok: true, data: options };
  } catch (error) {
    return fail(error, "Impossibile avviare l'accesso con passkey.");
  }
}

/** Passo 2 login: verifica assertion, apre la sessione e reindirizza. */
export async function finishPasskeyLoginAction(
  response: AuthenticationResponseJSON
): Promise<ActionResult<{ redirectTo: string }>> {
  const rateKey = `passkey-login:${await clientIp()}`;
  try {
    const { customerId } = await finishPasskeyLogin(response);
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { firstName: true, email: true }
    });
    await clearAttempts(rateKey);
    await createCustomerSession(customerId);
    await setCustomerDisplayNameCookie(customer?.firstName ?? null);
    // Il redirect lo fa il client dopo l'esito: le Response WebAuthn non
    // sopravvivono a un redirect() dentro l'action senza perdere l'errore.
    return { ok: true, data: { redirectTo: "/account" } };
  } catch (error) {
    await registerFailedAttempt(rateKey);
    return fail(error, "Accesso con passkey non riuscito.");
  }
}

/** Sessione presente? Usato dal client per capire se proporre il login passkey. */
export async function hasCustomerSessionAction(): Promise<boolean> {
  return (await getSessionCustomer()) !== null;
}
