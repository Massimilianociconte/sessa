"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseEuroToCents } from "@/lib/money";
import { formDataToObject, shippingRateSchema } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage, requireString } from "./helpers";

const PATH = "/admin/impostazioni";

export async function createShippingRateAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = shippingRateSchema.safeParse({
    ...formDataToObject(formData),
    isActive: formData.get("isActive") !== "off"
  });
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));

  let amountCents: number;
  let freeAboveCents: number | null = null;
  try {
    amountCents = parseEuroToCents(parsed.data.amount);
    if (parsed.data.freeAbove) freeAboveCents = parseEuroToCents(parsed.data.freeAbove);
  } catch {
    backWithError(PATH, "Importo non valido: usa il formato 9,90");
  }

  const rate = await prisma.shippingRate.create({
    data: {
      zoneId: parsed.data.zoneId,
      name: parsed.data.name,
      amountCents,
      freeAboveCents,
      position: parsed.data.position,
      isActive: parsed.data.isActive
    }
  });
  await audit(user.email, "shipping.rate.create", "ShippingRate", rate.id, parsed.data);
  revalidatePath(PATH);
  backWithMessage(PATH, "Tariffa creata.");
}

export async function updateShippingRateAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const parsed = shippingRateSchema.safeParse({
    ...formDataToObject(formData),
    isActive: formData.get("isActive") === "on"
  });
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));

  let amountCents: number;
  let freeAboveCents: number | null = null;
  try {
    amountCents = parseEuroToCents(parsed.data.amount);
    if (parsed.data.freeAbove) freeAboveCents = parseEuroToCents(parsed.data.freeAbove);
  } catch {
    backWithError(PATH, "Importo non valido: usa il formato 9,90");
  }

  await prisma.shippingRate.update({
    where: { id },
    data: {
      name: parsed.data.name,
      amountCents,
      freeAboveCents,
      position: parsed.data.position,
      isActive: parsed.data.isActive
    }
  });
  await audit(user.email, "shipping.rate.update", "ShippingRate", id, parsed.data);
  revalidatePath(PATH);
  backWithMessage(PATH, "Tariffa aggiornata.");
}

export async function deleteShippingRateAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  await prisma.shippingRate.delete({ where: { id } });
  await audit(user.email, "shipping.rate.delete", "ShippingRate", id);
  revalidatePath(PATH);
  backWithMessage(PATH, "Tariffa eliminata.");
}
