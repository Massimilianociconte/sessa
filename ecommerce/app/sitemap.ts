import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      updatedAt: true,
      storeVariants: {
        where: { isAvailable: true, variant: { isActive: true, product: { status: "ACTIVE" } } },
        select: { variant: { select: { product: { select: { slug: true, updatedAt: true } } } } }
      }
    }
  });

  const entries: MetadataRoute.Sitemap = [{ url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 }];

  for (const location of locations) {
    entries.push({
      url: `${SITE_URL}/sede/${location.slug}`,
      lastModified: location.updatedAt,
      changeFrequency: "daily",
      priority: 0.9
    });
    const seen = new Set<string>();
    for (const sv of location.storeVariants) {
      const p = sv.variant.product;
      if (seen.has(p.slug)) continue;
      seen.add(p.slug);
      entries.push({
        url: `${SITE_URL}/sede/${location.slug}/prodotti/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: "weekly",
        priority: 0.6
      });
    }
  }

  return entries;
}
