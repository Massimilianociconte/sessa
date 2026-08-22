import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { effectivePrice } from "@/lib/services/catalog";
import { SITE_URL } from "@/lib/site";

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeMerchantFeed(request: Request): boolean {
  const expected = process.env.MERCHANT_FEED_TOKEN?.trim() ?? "";
  if (expected.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const queryToken = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  const provided = bearer || queryToken;
  return Boolean(provided && safeEqual(provided, expected));
}

function absoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

function text(value: string | null | undefined, max = 5000): string {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

function tsv(value: string | number | null | undefined): string {
  return text(String(value ?? ""));
}

function money(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`;
}

function validStoreCode(value: string | null | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9]{1,64}$/.test(value));
}

function availability(stockQty: number, enabled = true): "in_stock" | "limited_availability" | "out_of_stock" {
  if (!enabled || stockQty <= 0) return "out_of_stock";
  return stockQty <= 2 ? "limited_availability" : "in_stock";
}

async function merchantCatalog() {
  return prisma.product.findMany({
    where: { status: "ACTIVE", merchantEnabled: true },
    include: {
      category: { select: { name: true } },
      variants: {
        where: { isActive: true },
        orderBy: { position: "asc" },
        include: {
          storeVariants: {
            include: { location: true },
            orderBy: { location: { position: "asc" } }
          }
        }
      }
    },
    orderBy: [{ position: "asc" }, { name: "asc" }]
  });
}

export async function buildGoogleProductFeed(): Promise<string> {
  const header = [
    "id", "title", "description", "link", "image_link", "availability", "price",
    "condition", "brand", "identifier_exists", "gtin", "mpn", "item_group_id",
    "product_type", "google_product_category"
  ];
  const rows: Array<Array<string | number>> = [];
  for (const product of await merchantCatalog()) {
    if (!product.image) continue;
    for (const variant of product.variants) {
      const localOffers = variant.storeVariants.filter((storeVariant) =>
        storeVariant.location.isActive &&
        storeVariant.location.merchantEnabled &&
        validStoreCode(storeVariant.location.merchantStoreCode)
      );
      if (localOffers.length === 0) continue;
      const preferred = localOffers.find((offer) => offer.isAvailable && offer.stockQty > 0) ?? localOffers[0]!;
      const inStock = localOffers.some((offer) => offer.isAvailable && offer.stockQty > 0);
      const titleBase = product.merchantTitle || product.name;
      const title = product.variants.length > 1 ? `${titleBase} - ${variant.name}` : titleBase;
      const description = product.merchantDescription || product.description || product.shortDescription || product.name;
      rows.push([
        variant.sku,
        text(title, 150),
        text(description),
        `${SITE_URL}/sede/${preferred.location.slug}/prodotti/${product.slug}`,
        absoluteUrl(product.image),
        inStock ? "in_stock" : "out_of_stock",
        money(effectivePrice(preferred.priceCentsOverride, variant.basePriceCents)),
        "new",
        "Sessa 1930",
        variant.gtin || variant.mpn ? "yes" : "no",
        variant.gtin ?? "",
        variant.mpn ?? "",
        product.slug,
        product.category?.name ?? "Pasticceria artigianale",
        product.googleProductCategory ?? "Food, Beverages & Tobacco > Food Items"
      ]);
    }
  }
  return [header, ...rows].map((row) => row.map(tsv).join("\t")).join("\n") + "\n";
}

export async function buildGoogleLocalInventoryFeed(): Promise<string> {
  const header = ["store_code", "id", "availability", "quantity", "price", "pickup_sla"];
  const rows: Array<Array<string | number>> = [];
  for (const product of await merchantCatalog()) {
    if (!product.image) continue; // deve esistere anche nel feed primario
    for (const variant of product.variants) {
      for (const offer of variant.storeVariants) {
        const location = offer.location;
        if (!location.isActive || !location.merchantEnabled || !validStoreCode(location.merchantStoreCode)) continue;
        const effectiveStock = offer.isAvailable ? Math.max(0, offer.stockQty) : 0;
        rows.push([
          location.merchantStoreCode,
          variant.sku,
          availability(effectiveStock, offer.isAvailable),
          effectiveStock,
          money(effectivePrice(offer.priceCentsOverride, variant.basePriceCents)),
          location.pickupEnabled ? location.merchantPickupSla : ""
        ]);
      }
    }
  }
  rows.sort((a, b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`));
  return [header, ...rows].map((row) => row.map(tsv).join("\t")).join("\n") + "\n";
}

export async function getMerchantReadiness() {
  const [locations, products, variantCount] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: { id: true, name: true, merchantEnabled: true, merchantStoreCode: true }
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE", merchantEnabled: true },
      select: { id: true, name: true, image: true, description: true, merchantDescription: true }
    }),
    prisma.productVariant.count({ where: { isActive: true, product: { status: "ACTIVE", merchantEnabled: true } } })
  ]);
  return {
    tokenConfigured: (process.env.MERCHANT_FEED_TOKEN?.trim().length ?? 0) >= 32,
    locations,
    enabledLocations: locations.filter((location) => location.merchantEnabled && validStoreCode(location.merchantStoreCode)).length,
    missingStoreCode: locations.filter((location) => location.merchantEnabled && !location.merchantStoreCode),
    invalidStoreCode: locations.filter((location) => location.merchantEnabled && location.merchantStoreCode && !validStoreCode(location.merchantStoreCode)),
    productCount: products.length,
    variantCount,
    missingImage: products.filter((product) => !product.image),
    missingDescription: products.filter((product) => !(product.merchantDescription || product.description))
  };
}

export function merchantFeedUrls() {
  const token = process.env.MERCHANT_FEED_TOKEN?.trim() ?? "";
  if (token.length < 32) return null;
  const key = encodeURIComponent(token);
  return {
    products: `${SITE_URL}/feeds/google/products.tsv?key=${key}`,
    localInventory: `${SITE_URL}/feeds/google/local-inventory.tsv?key=${key}`
  };
}
