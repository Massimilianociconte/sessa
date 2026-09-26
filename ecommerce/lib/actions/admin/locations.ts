"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { formDataToObject, locationSchema } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage, requireString } from "./helpers";
import { invalidateMemo } from "@/lib/ttl-cache";
import { parseRangesText, serializeWeeklyHours, type DayKey, type WeeklyHours } from "@/lib/commerce/scheduling";

const WEEK: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Orari settimanali dal form: tutti vuoti = non configurato (null). */
function parseOpeningHours(formData: FormData): { ok: true; value: string | null } | { ok: false; error: string } {
  const texts = WEEK.map((day) => String(formData.get(`hours_${day}`) ?? "").trim());
  if (texts.every((text) => text === "")) return { ok: true, value: null };
  const hours = {} as WeeklyHours;
  for (const [index, day] of WEEK.entries()) {
    const ranges = parseRangesText(texts[index]);
    if (ranges === null) {
      return { ok: false, error: `Orario non valido per ${day}: usa 09:00-13:00, 15:00-19:00 oppure "chiuso".` };
    }
    hours[day] = ranges;
  }
  hours.sun = hours.sun ?? [];
  return { ok: true, value: serializeWeeklyHours(hours) };
}

const PATH = "/admin/sedi";

function parseLocation(formData: FormData) {
  const fields = formDataToObject(formData);
  for (const day of WEEK) delete fields[`hours_${day}`];
  return locationSchema.safeParse({
    ...fields,
    pickupEnabled: formData.get("pickupEnabled") === "on",
    deliveryEnabled: formData.get("deliveryEnabled") === "on",
    isActive: formData.get("isActive") === "on",
    merchantEnabled: formData.get("merchantEnabled") === "on"
  });
}

export async function createLocationAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("catalog:manage");
  const parsed = parseLocation(formData);
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));
  const openingHours = parseOpeningHours(formData);
  if (!openingHours.ok) backWithError(PATH, openingHours.error);
  const exists = await prisma.location.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) backWithError(PATH, "Slug sede già in uso.");

  const location = await prisma.$transaction(async (tx) => {
    const created = await tx.location.create({ data: { ...parsed.data, openingHours: openingHours.value } });
    // Assortimento iniziale atomico: se il provisioning fallisce non resta una
    // sede visibile priva di catalogo.
    const variants = await tx.productVariant.findMany({
      where: { isActive: true },
      select: { id: true, position: true }
    });
    if (variants.length > 0) {
      await tx.storeVariant.createMany({
        data: variants.map((variant) => ({
          locationId: created.id,
          variantId: variant.id,
          stockQty: 0,
          isAvailable: false,
          position: variant.position
        })),
        skipDuplicates: true
      });
    }
    return created;
  });

  await audit(user.email, "location.create", "Location", location.id, parsed.data);
  invalidateMemo("loc:");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, `Sede "${location.name}" creata con l'intero catalogo (stock 0).`);
}

export async function updateLocationAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("catalog:manage");
  const id = requireString(formData, "id");
  const parsed = parseLocation(formData);
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));
  const openingHours = parseOpeningHours(formData);
  if (!openingHours.ok) backWithError(PATH, openingHours.error);
  const clash = await prisma.location.findFirst({ where: { slug: parsed.data.slug, id: { not: id } } });
  if (clash) backWithError(PATH, "Slug sede già in uso.");
  await prisma.$transaction(async (tx) => {
    await tx.location.update({ where: { id }, data: { ...parsed.data, openingHours: openingHours.value } });
    if (parsed.data.isActive) {
      const variants = await tx.productVariant.findMany({
        where: { isActive: true },
        select: { id: true, position: true }
      });
      if (variants.length > 0) {
        await tx.storeVariant.createMany({
          data: variants.map((variant) => ({
            locationId: id,
            variantId: variant.id,
            stockQty: 0,
            isAvailable: false,
            position: variant.position
          })),
          skipDuplicates: true
        });
      }
    }
  });
  await audit(user.email, "location.update", "Location", id, parsed.data);
  invalidateMemo("loc:");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, "Sede aggiornata.");
}

export async function deleteLocationAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("catalog:manage");
  const id = requireString(formData, "id");
  const orders = await prisma.order.count({ where: { locationId: id } });
  if (orders > 0) {
    backWithError(PATH, "Sede con ordini storici: disattivala invece di eliminarla.");
  }
  await prisma.location.delete({ where: { id } });
  await audit(user.email, "location.delete", "Location", id);
  invalidateMemo("loc:");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, "Sede eliminata.");
}
