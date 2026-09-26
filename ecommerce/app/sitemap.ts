import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const locations = await prisma.location.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      updatedAt: true,
      storeVariants: {
        where: { isAvailable: true, variant: { isActive: true, product: { status: "ACTIVE" } } },
        select: {
          variant: {
            select: {
              product: {
                select: {
                  slug: true,
                  updatedAt: true,
                  category: { select: { slug: true, updatedAt: true, isActive: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    ...["condizioni-di-vendita", "privacy", "cookie", "note-legali"].map((path) => ({
      url: `${SITE_URL}/${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.2
    }))
  ];

  for (const location of locations) {
    entries.push({
      url: `${SITE_URL}/sede/${location.slug}`,
      lastModified: location.updatedAt,
      changeFrequency: "daily",
      priority: 0.9
    });
    const seen = new Set<string>();
    const seenCategories = new Set<string>();
    for (const sv of location.storeVariants) {
      const p = sv.variant.product;
      if (p.category?.isActive && !seenCategories.has(p.category.slug)) {
        seenCategories.add(p.category.slug);
        entries.push({
          url: `${SITE_URL}/sede/${location.slug}/categorie/${p.category.slug}`,
          lastModified: p.category.updatedAt,
          changeFrequency: "daily",
          priority: 0.75
        });
      }
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
