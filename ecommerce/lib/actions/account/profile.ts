"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireCustomer, rotateCustomerSessions } from "@/lib/auth/customer-session";
import { formDataToObject, profileSchema } from "@/lib/validation";

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
  revalidatePath("/account", "layout");
  back("/account/profilo", "msg", "Profilo aggiornato.");
}

export async function changeCustomerPasswordAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 10) back("/account/profilo", "err", "La nuova password deve avere almeno 10 caratteri.");
  if (next !== confirm) back("/account/profilo", "err", "Le password non coincidono.");

  const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  if (!dbCustomer?.passwordHash || !verifyPassword(current, dbCustomer.passwordHash)) {
    back("/account/profilo", "err", "Password attuale errata.");
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: { passwordHash: hashPassword(next) }
  });
  await rotateCustomerSessions(customer.id);
  back("/account/profilo", "msg", "Password aggiornata. Le altre sessioni sono state disconnesse.");
}
