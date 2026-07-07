import { prisma } from "@/lib/db";

export async function listActiveLocations() {
  return prisma.location.findMany({ where: { isActive: true }, orderBy: { position: "asc" } });
}

export async function listAllLocations() {
  return prisma.location.findMany({ orderBy: { position: "asc" } });
}

export async function getLocationBySlug(slug: string) {
  return prisma.location.findUnique({ where: { slug } });
}

export async function getActiveLocationBySlug(slug: string) {
  const location = await prisma.location.findUnique({ where: { slug } });
  return location && location.isActive ? location : null;
}

export async function getLocation(id: string) {
  return prisma.location.findUnique({ where: { id } });
}
