"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { verifyPassword } from "@/lib/auth/password";
import { destroyCustomerSession, requireCustomer } from "@/lib/auth/customer-session";
import { deleteCustomerAccount } from "@/lib/services/customer-gdpr";

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
  const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!dbCustomer?.passwordHash || !verifyPassword(password, dbCustomer.passwordHash)) {
    redirect(`/account/sicurezza?err=${encodeURIComponent("Password errata.")}`);
  }

  try {
    await deleteCustomerAccount(customer.id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/account/sicurezza?err=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  await destroyCustomerSession();
  redirect("/?account=eliminato");
}
