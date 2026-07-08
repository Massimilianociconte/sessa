"use client";

import Link from "next/link";
import ProductQuickAddButton from "@/components/storefront/ProductQuickAddButton";
import { centsToAnalyticsValue, trackEcommerceEvent } from "@/lib/analytics";
import { formatCents } from "@/lib/money";
import type { StoreProductView } from "@/lib/services/catalog";

const TILES = [
  'url("/patterns/sessa-maiolica-orange.png")',
  'url("/patterns/sessa-maiolica-blue.png")',
  'url("/patterns/sessa-maiolica-green.png")'
];

const ACCENTS = ["#d65a1f", "#1f4e79", "#08c963"];

export default function ProductCard({
  product,
  locationSlug,
  locationId,
  locationName,
  listId,
  listName,
  index = 0
}: {
  product: StoreProductView;
  locationSlug: string;
  locationId?: string;
  locationName?: string;
  listId?: string;
  listName?: string;
  index?: number;
}) {
  const soldOut = !product.inStock;
  const tile = TILES[index % TILES.length];
  const accent = ACCENTS[index % ACCENTS.length];
  const productUrl = `/sede/${locationSlug}/prodotti/${product.slug}`;
  const availableVariants = product.variants.filter((variant) => variant.stockQty > 0);
  const priceVariants = availableVariants.length > 0 ? availableVariants : product.variants;
  const lowStock = availableVariants.length > 0 && availableVariants.some((variant) => variant.stockQty <= variant.lowStockThreshold);
  const discountedCompareAt = priceVariants
    .map((variant) => variant.compareAtCents)
    .filter((price): price is number => typeof price === "number" && price > product.priceMin)
    .sort((a, b) => a - b)[0];
  const discountPercent = discountedCompareAt
    ? Math.max(1, Math.round(((discountedCompareAt - product.priceMin) / discountedCompareAt) * 100))
    : null;
  const hasPriceRange = product.priceMin !== product.priceMax;
  const availabilityLabel = soldOut
    ? "Esaurito"
    : lowStock
      ? "Ultimi pezzi"
      : locationName
        ? `Disponibile a ${locationName}`
        : "Disponibile";

  function trackSelectItem() {
    trackEcommerceEvent("select_item", {
      item_list_id: listId,
      item_list_name: listName,
      value: centsToAnalyticsValue(product.priceMin),
      location_id: locationId,
      location_name: locationName,
      items: [
        {
          item_id: product.id,
          item_name: product.name,
          item_category: product.category?.name,
          price: centsToAnalyticsValue(product.priceMin),
          location_id: locationId,
          location_name: locationName
        }
      ]
    });
  }

  return (
    <article
      className="product-card group"
      style={{ ["--tile" as string]: tile, ["--product-accent" as string]: accent }}
    >
      <Link href={productUrl} onClick={trackSelectItem} className="product-card-media block">
        <div className="product-card-image-wrap">
          <div className="tile-frame product-card-image" style={{ ["--tile" as string]: tile }}>
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center font-script text-4xl text-terracotta/40">
                Sessa
              </div>
            )}
          </div>
          {soldOut && <span className="badge product-card-badge bg-ink/80 text-ivory">Esaurito</span>}
          {product.featured && !soldOut && (
            <span className="badge product-card-badge bg-majolica text-ink">In evidenza</span>
          )}
        </div>
      </Link>
      <div className="product-card-body">
        <div className="product-card-tagrow">
          {product.category && <span>{product.category.name}</span>}
          <span className={soldOut ? "text-ink/45" : lowStock ? "text-terracotta" : "text-emerald-700"}>
            {availabilityLabel}
          </span>
        </div>
        <Link href={productUrl} onClick={trackSelectItem} className="transition hover:text-terracotta">
          <h3 className="product-card-title">{product.name}</h3>
        </Link>
        {product.shortDescription && <p className="product-card-copy">{product.shortDescription}</p>}
        <div className="product-card-meta">
          <span>Fresco di sede</span>
          <span>{product.variants.length === 1 ? product.variants[0].name : `${product.variants.length} formati`}</span>
        </div>
        <div className="product-card-cta-row">
          <div className="product-card-price-stack">
            <span className="product-card-price-eyebrow">{hasPriceRange ? "A partire da" : "Prezzo sede"}</span>
            <p className="product-card-price-line">
              <span className="product-card-price-current">{formatCents(product.priceMin)}</span>
              {discountedCompareAt && (
                <span className="product-card-price-compare">{formatCents(discountedCompareAt)}</span>
              )}
            </p>
            <span className="product-card-price-note">
              {discountPercent
                ? `Risparmi ${discountPercent}%`
                : hasPriceRange
                  ? `fino a ${formatCents(product.priceMax)}`
                  : "IVA inclusa"}
            </span>
          </div>
          {locationId && locationName && (
            <ProductQuickAddButton
              product={product}
              locationId={locationId}
              locationName={locationName}
              productUrl={productUrl}
              tile={tile}
            />
          )}
        </div>
      </div>
    </article>
  );
}
