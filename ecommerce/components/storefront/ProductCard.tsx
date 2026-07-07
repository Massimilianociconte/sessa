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
  const productUrl = `/sede/${locationSlug}/prodotti/${product.slug}`;

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
    <article className="card group flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(23,20,18,0.14)]">
      <Link href={productUrl} onClick={trackSelectItem} className="block bg-cream">
        <div className="relative">
          <div className="tile-frame aspect-square" style={{ ["--tile" as string]: tile }}>
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.image}
                alt={product.name}
                className="h-full w-full object-contain transition duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center font-script text-4xl text-terracotta/40">
                Sessa
              </div>
            )}
          </div>
          {soldOut && <span className="badge absolute left-3 top-3 bg-ink/80 text-ivory">Esaurito</span>}
          {product.featured && !soldOut && (
            <span className="badge absolute left-3 top-3 bg-majolica text-ink">In evidenza</span>
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-5">
        {product.category && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">
            {product.category.name}
          </p>
        )}
        <Link href={productUrl} onClick={trackSelectItem} className="transition hover:text-terracotta">
          <h3 className="font-serif text-xl font-semibold">{product.name}</h3>
        </Link>
        {product.shortDescription && <p className="text-sm text-ink/55">{product.shortDescription}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="font-serif text-lg font-semibold leading-none">
            {product.priceMin === product.priceMax
              ? formatCents(product.priceMin)
              : `${formatCents(product.priceMin)} – ${formatCents(product.priceMax)}`}
          </p>
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
