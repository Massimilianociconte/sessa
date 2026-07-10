"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { categorySchema, formDataToObject } from "@/lib/validation";
import { backWithError, backWithMessage, firstZodMessage, requireString } from "./helpers";
import { invalidateMemo } from "@/lib/ttl-cache";

const PATH = "/admin/categorie";

export async function createCategoryAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("catalog:manage");
  const parsed = categorySchema.safeParse({
    ...formDataToObject(formData),
    isActive: formData.get("isActive") !== "off"
  });
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));
  const exists = await prisma.category.findUnique({ where: { slug: parsed.data.slug } });
  if (exists) backWithError(PATH, "Slug già in uso.");
  const category = await prisma.category.create({ data: parsed.data });
  await audit(user.email, "category.create", "Category", category.id, parsed.data);
  invalidateMemo("catalog:");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, "Categoria creata.");
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("catalog:manage");
  const id = requireString(formData, "id");
  const parsed = categorySchema.safeParse({
    ...formDataToObject(formData),
    isActive: formData.get("isActive") === "on"
  });
  if (!parsed.success) backWithError(PATH, firstZodMessage(parsed.error));
  const clash = await prisma.category.findFirst({
    where: { slug: parsed.data.slug, id: { not: id } }
  });
  if (clash) backWithError(PATH, "Slug già in uso.");
  await prisma.category.update({ where: { id }, data: parsed.data });
  await audit(user.email, "category.update", "Category", id, parsed.data);
  invalidateMemo("catalog:");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, "Categoria aggiornata.");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("catalog:manage");
  const id = requireString(formData, "id");
  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) {
    backWithError(PATH, `La categoria ha ${productCount} prodotti: spostali prima di eliminarla.`);
  }
  await prisma.category.delete({ where: { id } });
  await audit(user.email, "category.delete", "Category", id);
  invalidateMemo("catalog:");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
  backWithMessage(PATH, "Categoria eliminata.");
}
