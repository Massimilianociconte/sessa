"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/auth/customer-session";

function back(key: "msg" | "err", value: string): never {
  redirect(`/account/preferenze?${key}=${encodeURIComponent(value)}`);
}

/** Salva le preferenze effettive: sede, modalità e compleanno. */
export async function updatePreferencesAction(formData: FormData): Promise<void> {
  const customer = await requireCustomer();

  const locationId = String(formData.get("preferredLocationId") ?? "");
  const fulfillment = String(formData.get("preferredFulfillment") ?? "");
  const birthdayRaw = String(formData.get("birthday") ?? "");

  if (fulfillment && fulfillment !== "PICKUP" && fulfillment !== "DELIVERY") {
    back("err", "Modalità non valida.");
  }

  let preferredLocationId: string | null = null;
  if (locationId) {
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location || !location.isActive) back("err", "Sede non valida.");
    preferredLocationId = location.id;
  }

  let birthday: Date | null = null;
  if (birthdayRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)) back("err", "Data di nascita non valida.");
    const parsed = new Date(`${birthdayRaw}T00:00:00`);
    const now = new Date();
    const age = now.getFullYear() - parsed.getFullYear();
    if (Number.isNaN(parsed.getTime()) || parsed > now || age > 120) {
      back("err", "Data di nascita non valida.");
    }
    birthday = parsed;
  }

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      preferredLocationId,
      preferredFulfillment: fulfillment || null,
      birthday
    }
  });
  revalidatePath("/account", "layout");
  back("msg", "Preferenze salvate.");
}
