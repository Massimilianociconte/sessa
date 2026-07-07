"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { formDataToObject, locationSchema } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage, requireString } from "./helpers";

const PATH = "/admin/sedi";

function parseLocation(formData: FormData) {
  return locationSchema.safeParse({
    ...formDataToObject(formData),
    pickupEnabled: formData.get("pickupEnabled") === "on",
    deliveryEnabled: formData.get("deliveryEnabled") === "on",
    isActive: formData.get("isActive") === "on"
  });
}

export async function createLocationAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = parseLocation(formData);
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));
  const exists = await prisma.location.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) backWithError(PATH, "Slug sede già in uso.");

  const location = await prisma.location.create({ data: parsed.data });

  // Assortimento iniziale: pubblica tutte le varianti attive nella nuova sede (stock 0).
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true },
    select: { id: true, position: true }
  });
  if (variants.length > 0) {
    await prisma.storeVariant.createMany({
      data: variants.map((v) => ({
        locationId: location.id,
        variantId: v.id,
        stockQty: 0,
        isAvailable: true,
        position: v.position
      }))
    });
  }

  await audit(user.email, "location.create", "Location", location.id, parsed.data);
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, `Sede "${location.name}" creata con l'intero catalogo (stock 0).`);
}

export async function updateLocationAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const parsed = parseLocation(formData);
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));
  const clash = await prisma.location.findFirst({ where: { slug: parsed.data.slug, id: { not: id } } });
  if (clash) backWithError(PATH, "Slug sede già in uso.");
  await prisma.location.update({ where: { id }, data: parsed.data });
  await audit(user.email, "location.update", "Location", id, parsed.data);
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, "Sede aggiornata.");
}

export async function deleteLocationAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const orders = await prisma.order.count({ where: { locationId: id } });
  if (orders > 0) {
    backWithError(PATH, "Sede con ordini storici: disattivala invece di eliminarla.");
  }
  await prisma.location.delete({ where: { id } });
  await audit(user.email, "location.delete", "Location", id);
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, "Sede eliminata.");
}
