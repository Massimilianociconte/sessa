"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { verifyPassword } from "@/lib/auth/password";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import type { TwoFactorState } from "@/lib/actions/account/twofactor-state";
import {
  confirmTotpEnrollment,
  disableTotp,
  regenerateBackupCodes,
  startTotpEnrollment
} from "@/lib/services/customer-2fa";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

async function currentCustomerOrLogin() {
  const customer = await getSessionCustomer();
  if (!customer) redirect("/account/login");
  return customer;
}

async function verifyOwnPassword(customerId: string, password: string): Promise<boolean> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  return Boolean(customer?.passwordHash && verifyPassword(password, customer.passwordHash));
}

/** Step 1: password → secret + QR (i dati restano nello stato della form, mai in URL). */
export async function startTotpAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const customer = await currentCustomerOrLogin();
  const password = String(formData.get("password") ?? "");
  if (!(await verifyOwnPassword(customer.id, password))) {
    return { error: "Password errata.", step: "idle" };
  }
  try {
    const { secret, uri } = await startTotpEnrollment(customer.id);
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return { error: null, step: "pending", qrDataUrl, secret };
  } catch (error) {
    if (error instanceof DomainError) return { error: error.message, step: "idle" };
    throw error;
  }
}

/** Step 2: codice dall'app → 2FA attiva + codici di recupero mostrati una sola volta. */
export async function confirmTotpAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const customer = await currentCustomerOrLogin();
  const code = String(formData.get("code") ?? "");
  const rateKey = `totp-confirm:${await clientIp()}:${customer.id}`;
  if (isRateLimited(rateKey) !== null) {
    return { error: "Troppi tentativi: riprova tra qualche minuto.", step: "pending" };
  }
  try {
    const backupCodes = await confirmTotpEnrollment(customer.id, code);
    clearAttempts(rateKey);
    revalidatePath("/account/sicurezza");
    return { error: null, step: "enabled", backupCodes };
  } catch (error) {
    if (error instanceof DomainError) {
      registerFailedAttempt(rateKey);
      return { error: error.message, step: "pending" };
    }
    throw error;
  }
}

/** Rigenera i codici di recupero (serve un codice valido: TOTP o recupero). */
export async function regenerateBackupCodesAction(
  _prev: TwoFactorState,
  formData: FormData
): Promise<TwoFactorState> {
  const customer = await currentCustomerOrLogin();
  const code = String(formData.get("code") ?? "");
  const rateKey = `totp-regen:${await clientIp()}:${customer.id}`;
  if (isRateLimited(rateKey) !== null) {
    return { error: "Troppi tentativi: riprova tra qualche minuto.", step: "idle" };
  }
  try {
    const backupCodes = await regenerateBackupCodes(customer.id, code);
    clearAttempts(rateKey);
    revalidatePath("/account/sicurezza");
    return { error: null, step: "codes", backupCodes };
  } catch (error) {
    if (error instanceof DomainError) {
      registerFailedAttempt(rateKey);
      return { error: error.message, step: "idle" };
    }
    throw error;
  }
}

/** Disattivazione: password + codice valido. */
export async function disableTotpAction(formData: FormData): Promise<void> {
  const customer = await currentCustomerOrLogin();
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  const rateKey = `totp-disable:${await clientIp()}:${customer.id}`;
  if (isRateLimited(rateKey) !== null) {
    redirect(`/account/sicurezza?err=${encodeURIComponent("Troppi tentativi: riprova più tardi.")}`);
  }
  if (!(await verifyOwnPassword(customer.id, password))) {
    registerFailedAttempt(rateKey);
    redirect(`/account/sicurezza?err=${encodeURIComponent("Password errata.")}`);
  }
  try {
    await disableTotp(customer.id, code);
  } catch (error) {
    if (error instanceof DomainError) {
      registerFailedAttempt(rateKey);
      redirect(`/account/sicurezza?err=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  clearAttempts(rateKey);
  revalidatePath("/account/sicurezza");
  redirect(`/account/sicurezza?msg=${encodeURIComponent("Verifica in due passaggi disattivata.")}`);
}
