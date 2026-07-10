"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { verifyPassword } from "@/lib/auth/password";
import { destroyCustomerSession, requireCustomer } from "@/lib/auth/customer-session";
import { clearCustomerDisplayNameCookie } from "@/lib/auth/display-name";
import { deleteCustomerAccount } from "@/lib/services/customer-gdpr";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";

/**
 * Eliminazione definitiva dell'account (GDPR). Richiede password + conferma
 * esplicita digitata. Anonimizza i dati e chiude tutte le sessioni.
 */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const password = String(formData.get("password") ?? "");
  const confirmText = String(formData.get("confirm") ?? "").trim().toUpperCase();

  if (confirmText !== "ELIMINA") {
    redirect(`/account/sicurezza?err=${encodeURIComponent('Scrivi "ELIMINA" per confermare.')}`);
  }
  const rateKey = rateLimitKey("account-delete", await getClientIp(), customer.id);
  if ((await isRateLimited(rateKey)) !== null) {
    redirect(`/account/sicurezza?err=${encodeURIComponent("Troppi tentativi. Riprova più tardi.")}`);
  }
  const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!dbCustomer?.passwordHash || !verifyPassword(password, dbCustomer.passwordHash)) {
    await registerFailedAttempt(rateKey);
    redirect(`/account/sicurezza?err=${encodeURIComponent("Password errata.")}`);
  }
  await clearAttempts(rateKey);

  try {
    await deleteCustomerAccount(customer.id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/account/sicurezza?err=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  await destroyCustomerSession();
  await clearCustomerDisplayNameCookie();
  redirect("/?account=eliminato");
}
