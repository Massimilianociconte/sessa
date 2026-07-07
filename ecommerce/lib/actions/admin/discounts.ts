"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseEuroToCents } from "@/lib/money";
import { discountSchema, formDataToObject } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage, requireString } from "./helpers";

const PATH = "/admin/sconti";

function parseDiscountValue(type: "PERCENT" | "FIXED", raw: string): number {
  if (type === "PERCENT") {
    const pct = Number(raw.replace(",", "."));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new Error("Percentuale non valida (1-100).");
    return Math.round(pct * 100);
  }
  const cents = parseEuroToCents(raw);
  if (cents <= 0) throw new Error("Importo non valido.");
  return cents;
}

function parseDates(startsAt?: string, endsAt?: string) {
  return {
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null
  };
}

export async function createDiscountAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = discountSchema.safeParse({
    ...formDataToObject(formData),
    firstOrderOnly: formData.get("firstOrderOnly") === "on",
    stackable: formData.get("stackable") === "on",
    isActive: formData.get("isActive") !== "off"
  });
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));

  let value: number;
  let minSubtotalCents: number | null = null;
  try {
    value = parseDiscountValue(parsed.data.type, parsed.data.value);
    if (parsed.data.minSubtotal) minSubtotalCents = parseEuroToCents(parsed.data.minSubtotal);
  } catch (error) {
    backWithError(PATH, error instanceof Error ? error.message : "Valore non valido.");
  }

  const exists = await prisma.discountCode.findUnique({ where: { code: parsed.data.code } });
  if (exists) backWithError(PATH, "Codice già esistente.");

  const locationIds = formData.getAll("locationIds").map(String).filter(Boolean);
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const productIds = formData.getAll("productIds").map(String).filter(Boolean);

  const discount = await prisma.discountCode.create({
    data: {
      code: parsed.data.code,
      description: parsed.data.description,
      type: parsed.data.type,
      value,
      scope: parsed.data.scope,
      minSubtotalCents,
      maxUses: parsed.data.maxUses ?? null,
      perUserLimit: parsed.data.perUserLimit ?? null,
      firstOrderOnly: parsed.data.firstOrderOnly,
      stackable: parsed.data.stackable,
      isActive: parsed.data.isActive,
      ...parseDates(parsed.data.startsAt, parsed.data.endsAt),
      locations: { create: locationIds.map((locationId) => ({ locationId })) },
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      products: { create: productIds.map((productId) => ({ productId })) }
    }
  });
  await audit(user.email, "discount.create", "DiscountCode", discount.id, {
    scope: parsed.data.scope,
    locationIds,
    categoryIds,
    productIds
  });
  revalidatePath(PATH);
  backWithMessage(PATH, `Codice ${discount.code} creato.`);
}

export async function toggleDiscountAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const discount = await prisma.discountCode.findUnique({ where: { id } });
  if (!discount) backWithError(PATH, "Codice non trovato.");
  await prisma.discountCode.update({ where: { id }, data: { isActive: !discount.isActive } });
  await audit(user.email, "discount.toggle", "DiscountCode", id, { isActive: !discount.isActive });
  revalidatePath(PATH);
  backWithMessage(PATH, `Codice ${discount.code} ${discount.isActive ? "disattivato" : "attivato"}.`);
}

export async function deleteDiscountAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const used = await prisma.order.count({ where: { discountCodeId: id } });
  if (used > 0) {
    backWithError(PATH, "Codice usato in ordini storici: disattivalo invece di eliminarlo.");
  }
  await prisma.discountCode.delete({ where: { id } });
  await audit(user.email, "discount.delete", "DiscountCode", id);
  revalidatePath(PATH);
  backWithMessage(PATH, "Codice eliminato.");
}
