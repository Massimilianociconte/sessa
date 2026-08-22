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
import {
  createCustomerSession,
  getSessionCustomer,
  pruneExpiredCustomerSessions,
  requireCustomer
} from "@/lib/auth/customer-session";
import { setCustomerDisplayNameCookie } from "@/lib/auth/display-name";
import { isRateLimited, registerFailedAttempt, clearAttempts } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/db";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";
import { safeNextPath } from "@/lib/auth/redirects";
import { safeErrorMetadata } from "@/lib/safe-log";
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  deletePasskey,
  finishPasskeyLogin,
  finishPasskeyRegistration
} from "@/lib/services/customer-passkeys";
import { verifySecondFactor } from "@/lib/services/customer-2fa";
import { enqueueEmail } from "@/lib/services/email";
import { createHash, randomBytes } from "node:crypto";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail<T>(error: unknown, fallback: string): ActionResult<T> {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error("[passkey] operazione fallita", safeErrorMetadata(error));
  return { ok: false, error: fallback };
}

/** Passo 1 registrazione: opzioni WebAuthn per il cliente loggato. */
export async function startPasskeyRegistrationAction(
  password: string,
  totpCode?: string
): Promise<
  ActionResult<PublicKeyCredentialCreationOptionsJSON>
> {
  try {
    const customer = await requireCustomer();
    const rateKey = rateLimitKey("passkey-registration", await getClientIp(), customer.id);
    if ((await isRateLimited(rateKey)) !== null) {
      return { ok: false, error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    const row = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: { passwordHash: true, totpEnabledAt: true }
    });
    if (!verifyPasswordOrDummy(password.slice(0, 129), row?.passwordHash)) {
      await registerFailedAttempt(rateKey);
      return { ok: false, error: "Password attuale non valida." };
    }
    if (row?.totpEnabledAt) {
      if (!totpCode || !(await verifySecondFactor(customer.id, totpCode))) {
        await registerFailedAttempt(rateKey);
        return { ok: false, error: "Inserisci anche il codice dell'app authenticator." };
      }
    }
    await clearAttempts(rateKey);
    const issueKey = rateLimitKey("passkey-registration-issue", await getClientIp(), customer.id);
    if ((await isRateLimited(issueKey)) !== null) {
      return { ok: false, error: "Hai avviato troppe registrazioni. Riprova più tardi." };
    }
    await registerFailedAttempt(issueKey);
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
  const password = String(formData.get("password") ?? "");
  const rateKey = rateLimitKey("passkey-delete", await getClientIp(), customer.id);
  if ((await isRateLimited(rateKey)) !== null) {
    redirect("/account/sicurezza?err=" + encodeURIComponent("Troppi tentativi. Riprova più tardi."));
  }
  const row = await prisma.customer.findUnique({
    where: { id: customer.id },
    select: { passwordHash: true }
  });
  if (!verifyPasswordOrDummy(password.slice(0, 129), row?.passwordHash)) {
    await registerFailedAttempt(rateKey);
    redirect("/account/sicurezza?err=" + encodeURIComponent("Password attuale non valida."));
  }
  await clearAttempts(rateKey);
  const removed = passkeyId ? await deletePasskey(customer.id, passkeyId) : false;
  if (removed) {
    await enqueueEmail({
      toEmail: customer.email,
      subject: "Passkey rimossa dal tuo account Sessa 1930",
      type: "SECURITY_2FA",
      body: `Ciao ${customer.firstName},\n\nuna passkey è stata rimossa dal tuo account. Se non sei stato tu, cambia subito la password e controlla le sessioni attive.`
    }).catch(() => undefined);
  }
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
    const rateKey = rateLimitKey("passkey-login", await getClientIp());
    if ((await isRateLimited(rateKey)) !== null) {
      return { ok: false, error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    const options = await beginPasskeyLogin();
    // Limita anche la sola emissione di challenge, altrimenti una sorgente può
    // riempire lo store one-shot senza mai inviare un'assertion.
    await registerFailedAttempt(rateKey);
    return { ok: true, data: options };
  } catch (error) {
    return fail(error, "Impossibile avviare l'accesso con passkey.");
  }
}

/** Passo 2 login: verifica assertion, apre la sessione e reindirizza. */
export async function finishPasskeyLoginAction(
  response: AuthenticationResponseJSON,
  nextPath?: string
): Promise<ActionResult<{ redirectTo: string; needsTotp?: boolean; pendingToken?: string }>> {
  const rateKey = rateLimitKey("passkey-login", await getClientIp());
  try {
    if ((await isRateLimited(rateKey)) !== null) {
      return { ok: false, error: "Troppi tentativi. Riprova tra qualche minuto." };
    }
    const { customerId } = await finishPasskeyLogin(response);
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { firstName: true, email: true, emailVerified: true, totpEnabledAt: true }
    });
    if (!customer?.emailVerified) {
      return { ok: false, error: "Conferma prima l'email. Usa «Password dimenticata?» se il link e scaduto." };
    }
    await clearAttempts(rateKey);
    if (customer.totpEnabledAt) {
      const pending = randomBytes(32).toString("hex");
      await prisma.customerToken.create({
        data: {
          tokenHash: createHash("sha256").update(pending).digest("hex"),
          customerId,
          type: "PASSKEY_2FA",
          payload: nextPath ?? null,
          expiresAt: new Date(Date.now() + 5 * 60_000)
        }
      });
      return { ok: true, data: { needsTotp: true, pendingToken: pending, redirectTo: "" } };
    }
    await pruneExpiredCustomerSessions();
    const session = await createCustomerSession(customerId);
    await setCustomerDisplayNameCookie(customer.firstName);
    const { syncCartCookieAfterLogin } = await import("@/lib/services/cart");
    await syncCartCookieAfterLogin(customerId).catch(() => undefined);
    await enqueueEmail({
      toEmail: customer.email,
      subject: "Nuovo accesso con passkey — Sessa 1930",
      type: "SECURITY_LOGIN",
      body: `Ciao ${customer.firstName},\n\nabbiamo registrato un accesso con passkey al tuo account.${session.ipAddress ? `\nIP: ${session.ipAddress}` : ""}${session.userAgent ? `\nDispositivo/browser: ${session.userAgent}` : ""}\n\nSe non sei stato tu, revoca la sessione dalla sezione Sicurezza.`
    }).catch(() => undefined);
    return { ok: true, data: { redirectTo: safeNextPath(nextPath, "/account", "/account") } };
  } catch (error) {
    await registerFailedAttempt(rateKey);
    return fail(error, "Accesso con passkey non riuscito.");
  }
}

export async function completePasskeySecondFactorAction(
  pendingToken: string,
  totpCode: string
): Promise<ActionResult<{ redirectTo: string }>> {
  const rateKey = rateLimitKey("passkey-login", await getClientIp());
  try {
    const tokenHash = createHash("sha256").update(pendingToken).digest("hex");
    const row = await prisma.customerToken.findUnique({ where: { tokenHash } });
    if (!row || row.type !== "PASSKEY_2FA" || row.usedAt || row.expiresAt < new Date()) {
      return { ok: false, error: "Sessione passkey scaduta. Ripeti l'accesso." };
    }
    if (!(await verifySecondFactor(row.customerId, totpCode))) {
      await registerFailedAttempt(rateKey);
      return { ok: false, error: "Codice di verifica non valido." };
    }
    // Claim atomico: un solo tentativo puo consumare il token, anche con due
    // submit concorrenti (prima era find-then-update, quindi doppio consumo
    // teorico con due TOTP validi consecutivi).
    const claimed = await prisma.customerToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() }
    });
    if (claimed.count === 0) {
      return { ok: false, error: "Sessione passkey scaduta. Ripeti l'accesso." };
    }
    const customer = await prisma.customer.findUnique({
      where: { id: row.customerId },
      select: { firstName: true, email: true }
    });
    await pruneExpiredCustomerSessions();
    const session = await createCustomerSession(row.customerId);
    await setCustomerDisplayNameCookie(customer?.firstName ?? null);
    const { syncCartCookieAfterLogin } = await import("@/lib/services/cart");
    await syncCartCookieAfterLogin(row.customerId).catch(() => undefined);
    if (customer) {
      await enqueueEmail({
        toEmail: customer.email,
        subject: "Nuovo accesso con passkey — Sessa 1930",
        type: "SECURITY_LOGIN",
        body: `Ciao ${customer.firstName},\n\nabbiamo registrato un accesso con passkey al tuo account.${session.ipAddress ? `\nIP: ${session.ipAddress}` : ""}${session.userAgent ? `\nDispositivo/browser: ${session.userAgent}` : ""}\n\nSe non sei stato tu, revoca la sessione dalla sezione Sicurezza.`
      }).catch(() => undefined);
    }
    return { ok: true, data: { redirectTo: safeNextPath(row.payload, "/account", "/account") } };
  } catch (error) {
    return fail(error, "Verifica in due passaggi non riuscita.");
  }
}

/** Sessione presente? Usato dal client per capire se proporre il login passkey. */
export async function hasCustomerSessionAction(): Promise<boolean> {
  return (await getSessionCustomer()) !== null;
}
