"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireCustomer, rotateCustomerSessions } from "@/lib/auth/customer-session";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { setCustomerDisplayNameCookie } from "@/lib/auth/display-name";
import { enqueueEmail } from "@/lib/services/email";
import { requestEmailChange, sendVerificationEmail } from "@/lib/services/customer-verification";
import { formDataToObject, profileSchema } from "@/lib/validation";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";

function back(path: string, key: "msg" | "err", value: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(value)}`);
}

export async function updateProfileAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const parsed = profileSchema.safeParse({
    ...formDataToObject(formData),
    marketingOptIn: formData.get("marketingOptIn") === "on"
  });
  if (!parsed.success) back("/account/profilo", "err", parsed.error.issues[0]?.message ?? "Dati non validi.");
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone ?? null,
      marketingOptIn: parsed.data.marketingOptIn
    }
  });
  await setCustomerDisplayNameCookie(parsed.data.firstName);
  revalidatePath("/account", "layout");
  back("/account/profilo", "msg", "Profilo aggiornato.");
}

export async function changeCustomerPasswordAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 12 || next.length > 128) {
    back("/account/profilo", "err", "La nuova password deve avere tra 12 e 128 caratteri.");
  }
  if (next !== confirm) back("/account/profilo", "err", "Le password non coincidono.");

  const rateKey = rateLimitKey("customer-password-change", await getClientIp(), customer.id);
  if ((await isRateLimited(rateKey)) !== null) {
    back("/account/profilo", "err", "Troppi tentativi. Riprova più tardi.");
  }
  const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!dbCustomer?.passwordHash || !verifyPassword(current, dbCustomer.passwordHash)) {
    await registerFailedAttempt(rateKey);
    back("/account/profilo", "err", "Password attuale errata.");
  }
  await clearAttempts(rateKey);
  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordHash: hashPassword(next) }
  });
  await rotateCustomerSessions(customer.id);
  await enqueueEmail({
    toEmail: customer.email,
    subject: "Password account Sessa 1930 aggiornata",
    type: "SECURITY_PASSWORD_CHANGED",
    body: `Ciao ${customer.firstName},\n\nla password del tuo account Sessa 1930 è stata aggiornata. Per sicurezza abbiamo disconnesso gli altri dispositivi.\n\nSe non sei stato tu, contatta subito Sessa e usa il recupero password.`
  }).catch(() => undefined);
  back("/account/profilo", "msg", "Password aggiornata. Le altre sessioni sono state disconnesse.");
}

/** Reinvia l'email di verifica (rate-limited per evitare abusi sulla coda). */
export async function resendVerificationAction(): Promise<void> {
  const customer = await requireCustomer();
  const rateKey = rateLimitKey("verify-resend", await getClientIp(), customer.id);
  if ((await isRateLimited(rateKey)) !== null) {
    back("/account/profilo", "err", "Hai già richiesto una verifica da poco. Riprova più tardi.");
  }
  await registerFailedAttempt(rateKey);
  const result = await sendVerificationEmail(customer.id);
  if (!result) back("/account/profilo", "msg", "Email già verificata.");
  if (result.delivery.status === "FAILED") {
    back("/account/profilo", "err", "Non siamo riusciti a inviare l'email di verifica. Riprova più tardi o controlla la configurazione SMTP.");
  }
  if (process.env.NODE_ENV !== "production") {
    back("/account/profilo", "msg", `Email di verifica inviata. Link dev: ${result.link}`);
  }
  back("/account/profilo", "msg", "Email di verifica inviata: controlla la casella.");
}

/** Richiede il cambio email: conferma password + doppio avviso (nuova e vecchia email). */
export async function requestEmailChangeAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    back("/account/profilo", "err", "Inserisci una email valida.");
  }

  const rateKey = rateLimitKey("email-change", await getClientIp(), customer.id);
  const blockedMs = await isRateLimited(rateKey);
  if (blockedMs !== null) {
    back("/account/profilo", "err", "Troppi tentativi. Riprova più tardi.");
  }

  const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!dbCustomer?.passwordHash || !verifyPassword(password, dbCustomer.passwordHash)) {
    await registerFailedAttempt(rateKey);
    back("/account/profilo", "err", "Password errata.");
  }
  await clearAttempts(rateKey);

  try {
    const result = await requestEmailChange(customer.id, newEmail);
    if (result.delivery.status === "FAILED") {
      back("/account/profilo", "err", "Non siamo riusciti a inviare la conferma al nuovo indirizzo. Riprova più tardi o controlla la configurazione SMTP.");
    }
    if (process.env.NODE_ENV !== "production") {
      back("/account/profilo", "msg", `Conferma inviata a ${newEmail}. Link dev: ${result.link}`);
    }
    back("/account/profilo", "msg", `Ti abbiamo inviato un link di conferma a ${newEmail}.`);
  } catch (error) {
    if (error instanceof DomainError) back("/account/profilo", "err", error.message);
    throw error;
  }
}
