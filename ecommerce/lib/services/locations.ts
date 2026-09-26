import { prisma } from "@/lib/db";
import { memoTtl } from "@/lib/ttl-cache";

// TTL breve: bilancia latenza (DB in altra regione) e freschezza del gestionale.
const TTL_MS = 30_000;

export async function listActiveLocations() {
  return memoTtl("loc:active", TTL_MS, () =>
    prisma.location.findMany({ where: { isActive: true }, orderBy: { position: "asc" } })
  );
}

export async function getActiveLocationBySlug(slug: string) {
  const location = await memoTtl(`loc:slug:${slug}`, TTL_MS, () =>
    prisma.location.findUnique({ where: { slug } })
  );
  return location && location.isActive ? location : null;
}
