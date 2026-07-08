"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { parseEuroToCents } from "@/lib/money";
import { formDataToObject, productSchema, variantSchema } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage, requireString } from "./helpers";
import { invalidateMemo } from "@/lib/ttl-cache";

function revalidateCatalog() {
  invalidateMemo("catalog:");
  revalidatePath("/", "layout");
  revalidatePath("/admin/prodotti");
}

/** Crea uno StoreVariant per ogni sede attiva (assortimento iniziale). */
async function createStoreVariantsForAllLocations(variantId: string, position: number) {
  const locations = await prisma.location.findMany({ where: { isActive: true }, select: { id: true } });
  for (const loc of locations) {
    const exists = await prisma.storeVariant.findUnique({
      where: { locationId_variantId: { locationId: loc.id, variantId } }
    });
    if (!exists) {
      await prisma.storeVariant.create({
        data: { locationId: loc.id, variantId, stockQty: 0, isAvailable: true, position }
      });
    }
  }
}

export async function createProductAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const parsed = productSchema.safeParse({
    ...formDataToObject(formData),
    featured: formData.get("featured") === "on"
  });
  if (!parsed.success) backWithError("/admin/prodotti/nuovo", firstZodMessage(parsed.error));
  const exists = await prisma.product.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) backWithError("/admin/prodotti/nuovo", "Slug già in uso da un altro prodotto.");
  const product = await prisma.product.create({
    data: { ...parsed.data, categoryId: parsed.data.categoryId || null }
  });
  await audit(user.email, "product.create", "Product", product.id, parsed.data);
  revalidateCatalog();
  backWithMessage(`/admin/prodotti/${product.id}`, "Prodotto creato. Ora aggiungi le varianti.");
}

export async function updateProductAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const parsed = productSchema.safeParse({
    ...formDataToObject(formData),
    featured: formData.get("featured") === "on"
  });
  if (!parsed.success) backWithError(`/admin/prodotti/${id}`, firstZodMessage(parsed.error));
  const clash = await prisma.product.findFirst({ where: { slug: parsed.data.slug, id: { not: id } } });
  if (clash) backWithError(`/admin/prodotti/${id}`, "Slug già in uso da un altro prodotto.");
  await prisma.product.update({
    where: { id },
    data: { ...parsed.data, categoryId: parsed.data.categoryId || null }
  });
  await audit(user.email, "product.update", "Product", id, parsed.data);
  revalidateCatalog();
  backWithMessage(`/admin/prodotti/${id}`, "Prodotto aggiornato.");
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  const referenced = await prisma.orderItem.count({ where: { variant: { productId: id } } });
  if (referenced > 0) {
    backWithError(`/admin/prodotti/${id}`, "Prodotto presente in ordini storici: archivialo invece di eliminarlo.");
  }
  await prisma.product.delete({ where: { id } });
  await audit(user.email, "product.delete", "Product", id);
  revalidateCatalog();
  backWithMessage("/admin/prodotti", "Prodotto eliminato.");
}

export async function createVariantAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const productId = requireString(formData, "productId");
  const path = `/admin/prodotti/${productId}`;
  const parsed = variantSchema.safeParse({
    ...formDataToObject(formData),
    isActive: formData.get("isActive") !== "off"
  });
  if (!parsed.success) backWithError(path, firstZodMessage(parsed.error));

  let basePriceCents: number;
  let compareAtCents: number | null = null;
  try {
    basePriceCents = parseEuroToCents(parsed.data.price);
    if (parsed.data.compareAt) compareAtCents = parseEuroToCents(parsed.data.compareAt);
  } catch {
    backWithError(path, "Prezzo non valido: usa il formato 35,00");
  }

  const skuClash = await prisma.productVariant.findUnique({ where: { sku: parsed.data.sku } });
  if (skuClash) backWithError(path, `SKU "${parsed.data.sku}" già esistente.`);

  const variant = await prisma.productVariant.create({
    data: {
      productId,
      name: parsed.data.name,
      sku: parsed.data.sku,
      basePriceCents,
      compareAtCents,
      weightGrams: parsed.data.weightGrams,
      isActive: parsed.data.isActive,
      position: parsed.data.position
    }
  });
  await createStoreVariantsForAllLocations(variant.id, parsed.data.position);
  await audit(user.email, "variant.create", "ProductVariant", variant.id, parsed.data);
  revalidateCatalog();
  backWithMessage(path, `Variante "${parsed.data.name}" creata e pubblicata su tutte le sedi (stock 0).`);
}

export async function updateVariantAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const variantId = requireString(formData, "variantId");
  const productId = requireString(formData, "productId");
  const path = `/admin/prodotti/${productId}`;
  const parsed = variantSchema.safeParse({
    ...formDataToObject(formData),
    isActive: formData.get("isActive") === "on"
  });
  if (!parsed.success) backWithError(path, firstZodMessage(parsed.error));

  let basePriceCents: number;
  let compareAtCents: number | null = null;
  try {
    basePriceCents = parseEuroToCents(parsed.data.price);
    if (parsed.data.compareAt) compareAtCents = parseEuroToCents(parsed.data.compareAt);
  } catch {
    backWithError(path, "Prezzo non valido: usa il formato 35,00");
  }

  const skuClash = await prisma.productVariant.findFirst({
    where: { sku: parsed.data.sku, id: { not: variantId } }
  });
  if (skuClash) backWithError(path, `SKU "${parsed.data.sku}" già in uso.`);

  await prisma.productVariant.update({
    where: { id: variantId },
    data: {
      name: parsed.data.name,
      sku: parsed.data.sku,
      basePriceCents,
      compareAtCents,
      weightGrams: parsed.data.weightGrams,
      isActive: parsed.data.isActive,
      position: parsed.data.position
    }
  });
  await audit(user.email, "variant.update", "ProductVariant", variantId, parsed.data);
  revalidateCatalog();
  backWithMessage(path, `Variante "${parsed.data.name}" aggiornata.`);
}

export async function deleteVariantAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const variantId = requireString(formData, "variantId");
  const productId = requireString(formData, "productId");
  const path = `/admin/prodotti/${productId}`;
  const referenced = await prisma.orderItem.count({ where: { variantId } });
  if (referenced > 0) {
    backWithError(path, "Variante presente in ordini storici: disattivala invece di eliminarla.");
  }
  await prisma.productVariant.delete({ where: { id: variantId } });
  await audit(user.email, "variant.delete", "ProductVariant", variantId);
  revalidateCatalog();
  backWithMessage(path, "Variante eliminata.");
}

/**
 * Assortimento per sede: aggiorna disponibilità / prezzo override / soglia
 * di uno StoreVariant. Lo stock si tocca solo dal magazzino (ledger).
 */
export async function updateStoreVariantAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const storeVariantId = requireString(formData, "storeVariantId");
  const productId = requireString(formData, "productId");
  const path = `/admin/prodotti/${productId}`;
  const isAvailable = formData.get("isAvailable") === "on";
  const priceRaw = String(formData.get("price") ?? "").trim();
  const lowStock = Number(formData.get("lowStockThreshold") ?? 5) | 0;

  let priceCentsOverride: number | null = null;
  if (priceRaw !== "") {
    try {
      priceCentsOverride = parseEuroToCents(priceRaw);
    } catch {
      backWithError(path, "Prezzo sede non valido: usa il formato 35,00 (vuoto = prezzo base).");
    }
  }

  await prisma.storeVariant.update({
    where: { id: storeVariantId },
    data: { isAvailable, priceCentsOverride, lowStockThreshold: Math.max(0, lowStock) }
  });
  await audit(user.email, "storeVariant.update", "StoreVariant", storeVariantId, {
    isAvailable,
    priceCentsOverride
  });
  revalidateCatalog();
  backWithMessage(path, "Assortimento sede aggiornato.");
}
