import { cache } from "react";
import { prisma } from "@/lib/db";
import { memoTtl } from "@/lib/ttl-cache";
import { matchesOccasion } from "@/lib/catalog-discovery";

export { CATALOG_OCCASIONS, matchesOccasion } from "@/lib/catalog-discovery";

/**
 * Catalogo store-aware: prezzo e stock provengono da StoreVariant (per sede).
 * Le query restituiscono "view" già risolte (prezzo effettivo, stock) così le
 * pagine non ragionano su override/base.
 * Le liste pubbliche sono memoizzate con TTL breve (vedi lib/ttl-cache):
 * il carrello/checkout NON passa da qui e rilegge sempre stock e prezzi reali.
 */

// TTL della vetrina: modifiche dal gestionale visibili entro mezzo minuto.
const CATALOG_TTL_MS = 30_000;

/** Prezzo effettivo di uno StoreVariant: override della sede o prezzo base. */
export function effectivePrice(priceCentsOverride: number | null, basePriceCents: number): number {
  return priceCentsOverride ?? basePriceCents;
}

export type StoreVariantView = {
  storeVariantId: string;
  variantId: string;
  name: string;
  sku: string;
  priceCents: number;
  compareAtCents: number | null;
  stockQty: number;
  lowStockThreshold: number;
};

export type StoreProductView = {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  image: string | null;
  gallery: string[];
  tags: string;
  featured: boolean;
  taxRateBps: number;
  allergens: string;
  ingredients: string;
  storageInfo: string;
  /** LOCAL = fresco (ritiro/consegna locale), NATIONAL = spedibile. */
  shippingScope: "LOCAL" | "NATIONAL";
  leadTimeHours: number;
  category: { name: string; slug: string } | null;
  variants: StoreVariantView[];
  priceMin: number;
  priceMax: number;
  inStock: boolean;
};

export type RawProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string | null;
  image: string | null;
  images?: Array<{ url: string }>;
  tags: string;
  featured: boolean;
  taxRateBps: number;
  allergens: string;
  ingredients: string;
  storageInfo?: string;
  shippingScope?: string;
  leadTimeHours?: number;
  category: { name: string; slug: string } | null;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    basePriceCents: number;
    compareAtCents: number | null;
    position: number;
    storeVariants: Array<{
      id: string;
      priceCentsOverride: number | null;
      compareAtCents: number | null;
      stockQty: number;
      lowStockThreshold: number;
    }>;
  }>;
};

/** Mapping gestionale → vetrina. Le liste pubbliche filtrano prima per ACTIVE. */
export function toStoreProductView(product: RawProduct): StoreProductView {
  const variants: StoreVariantView[] = product.variants
    .map((v) => {
      const sv = v.storeVariants[0];
      if (!sv) return null;
      return {
        storeVariantId: sv.id,
        variantId: v.id,
        name: v.name,
        sku: v.sku,
        priceCents: effectivePrice(sv.priceCentsOverride, v.basePriceCents),
        compareAtCents: sv.compareAtCents ?? v.compareAtCents,
        stockQty: sv.stockQty,
        lowStockThreshold: sv.lowStockThreshold
      } satisfies StoreVariantView;
    })
    .filter((v): v is StoreVariantView => v !== null);

  const prices = variants.map((v) => v.priceCents);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    shortDescription: product.shortDescription,
    image: product.image,
    gallery: [product.image, ...(product.images ?? []).map((image) => image.url)].filter(
      (url, index, all): url is string => Boolean(url) && all.indexOf(url) === index
    ),
    tags: product.tags,
    featured: product.featured,
    taxRateBps: product.taxRateBps,
    allergens: product.allergens,
    ingredients: product.ingredients,
    storageInfo: product.storageInfo ?? "",
    shippingScope: product.shippingScope === "NATIONAL" ? "NATIONAL" : "LOCAL",
    leadTimeHours: product.leadTimeHours ?? 0,
    category: product.category ? { name: product.category.name, slug: product.category.slug } : null,
    variants,
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
    inStock: variants.some((v) => v.stockQty > 0)
  };
}

function storeProductInclude(locationId: string) {
  return {
    category: true,
    variants: {
      where: { isActive: true, storeVariants: { some: { locationId, isAvailable: true } } },
      orderBy: { position: "asc" as const },
      include: {
        storeVariants: { where: { locationId, isAvailable: true } }
      }
    }
  };
}

export async function listStoreProducts(
  locationId: string,
  filters?: { categorySlug?: string; query?: string; occasion?: string } | string
): Promise<StoreProductView[]> {
  const normalized = typeof filters === "string" ? { categorySlug: filters } : (filters ?? {});
  const query = normalized.query?.trim();
  const memoKey = `catalog:list:${locationId}:${normalized.categorySlug ?? ""}:${query ?? ""}`;
  const rows = await memoTtl(memoKey, CATALOG_TTL_MS, () => prisma.product.findMany({
    where: {
      status: "ACTIVE",
      ...(normalized.categorySlug ? { category: { slug: normalized.categorySlug } } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { shortDescription: { contains: query, mode: "insensitive" } },
              { description: { contains: query, mode: "insensitive" } },
              { tags: { contains: query, mode: "insensitive" } },
              { variants: { some: { sku: { contains: query, mode: "insensitive" } } } }
            ]
          }
        : {}),
      variants: { some: { isActive: true, storeVariants: { some: { locationId, isAvailable: true } } } }
    },
    include: { ...storeProductInclude(locationId), images: { orderBy: { position: "asc" } } },
    orderBy: [{ featured: "desc" }, { position: "asc" }]
  }));
  const products = (rows as RawProduct[]).map(toStoreProductView);
  return normalized.occasion ? products.filter((product) => matchesOccasion(product, normalized.occasion)) : products;
}

export const getStoreProduct = cache(async function getStoreProduct(
  locationId: string,
  slug: string
): Promise<StoreProductView | null> {
  const row = await prisma.product.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      variants: { some: { isActive: true, storeVariants: { some: { locationId, isAvailable: true } } } }
    },
    include: { ...storeProductInclude(locationId), images: { orderBy: { position: "asc" } } }
  });
  return row ? toStoreProductView(row as RawProduct) : null;
});

/**
 * Sede canonica di un prodotto: la prima sede attiva (per posizione) che lo
 * vende. Le schede identiche nelle altre sedi puntano qui come canonical,
 * evitando contenuti duplicati e cannibalizzazione tra sedi.
 */
export async function getCanonicalLocationSlug(productId: string): Promise<string | null> {
  return memoTtl(`catalog:canonical:${productId}`, CATALOG_TTL_MS, async () => {
    const row = await prisma.storeVariant.findFirst({
      where: {
        isAvailable: true,
        location: { isActive: true },
        variant: { isActive: true, productId, product: { status: "ACTIVE" } }
      },
      orderBy: [{ location: { position: "asc" } }],
      select: { location: { select: { slug: true } } }
    });
    return row?.location.slug ?? null;
  });
}

/** Categorie che hanno almeno un prodotto acquistabile nella sede. */
export async function listStoreCategories(locationId: string) {
  return memoTtl(`catalog:categories:${locationId}`, CATALOG_TTL_MS, () =>
    prisma.category.findMany({
      where: {
        isActive: true,
        products: {
          some: {
            status: "ACTIVE",
            variants: { some: { isActive: true, storeVariants: { some: { locationId, isAvailable: true } } } }
          }
        }
      },
      orderBy: { position: "asc" }
    })
  );
}
