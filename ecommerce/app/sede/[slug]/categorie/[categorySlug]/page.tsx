import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import AnalyticsBeacon from "@/components/storefront/AnalyticsBeacon";
import CatalogExplorer from "@/components/storefront/CatalogExplorer";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { prisma } from "@/lib/db";
import { getLocationVisual } from "@/lib/location-visuals";
import {
  buildStoreCategoryJsonLd,
  buildStoreCategoryMetadata,
  getStoreSeo
} from "@/lib/seo/sessa-local";
import { listStoreCategories, listStoreProducts } from "@/lib/services/catalog";
import { getActiveLocationBySlug } from "@/lib/services/locations";

export const revalidate = 30;

type Props = { params: Promise<{ slug: string; categorySlug: string }> };

export async function generateStaticParams() {
  try {
    const rows = await prisma.storeVariant.findMany({
      where: {
        isAvailable: true,
        location: { isActive: true },
        variant: {
          isActive: true,
          product: { status: "ACTIVE", category: { isActive: true } }
        }
      },
      select: {
        location: { select: { slug: true } },
        variant: { select: { product: { select: { category: { select: { slug: true } } } } } }
      }
    });
    const unique = new Map<string, { slug: string; categorySlug: string }>();
    for (const row of rows) {
      const categorySlug = row.variant.product.category?.slug;
      if (!categorySlug) continue;
      const value = { slug: row.location.slug, categorySlug };
      unique.set(`${value.slug}:${value.categorySlug}`, value);
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, categorySlug } = await params;
  const location = await getActiveLocationBySlug(slug);
  if (!location) return {};
  const categories = await listStoreCategories(location.id);
  const category = categories.find((item) => item.slug === categorySlug);
  return category ? buildStoreCategoryMetadata(location, category) : {};
}

export default async function StoreCategoryPage({ params }: Props) {
  const { slug, categorySlug } = await params;
  const location = await getActiveLocationBySlug(slug);
  if (!location) notFound();

  const [products, categories] = await Promise.all([
    listStoreProducts(location.id),
    listStoreCategories(location.id)
  ]);
  const category = categories.find((item) => item.slug === categorySlug);
  if (!category) notFound();
  const categoryProducts = products.filter((product) => product.category?.slug === category.slug);
  if (categoryProducts.length === 0) notFound();

  const seo = getStoreSeo(location);
  const visual = getLocationVisual(location, seo.cityName);
  const jsonLd = buildStoreCategoryJsonLd(location, category, categoryProducts);

  return (
    <>
      <Header currentLocation={{ slug: location.slug, name: seo.name }} />
      <JsonLd data={jsonLd} />
      <AnalyticsBeacon
        event="view_item_list"
        payload={{
          item_list_id: `${slug}-${category.slug}`,
          item_list_name: `${category.name} - ${location.name}`,
          location_id: location.id,
          location_name: location.name,
          filter_name: category.name,
          items: categoryProducts.slice(0, 12).map((product) => ({
            item_id: product.id,
            item_name: product.name,
            item_category: product.category?.name,
            price: product.priceMin / 100,
            location_id: location.id,
            location_name: location.name
          }))
        }}
      />
      <main className="shop-main mx-auto max-w-6xl px-4">
        <section
          className="catalog-hero catalog-hero-premium catalog-hero-bleed py-8 md:py-12"
          style={
            {
              "--location-hero-bg": `url("${visual.background}")`,
              "--hero-tile": visual.tile,
              "--hero-accent": visual.accent
            } as CSSProperties
          }
        >
          <div className="catalog-hero-inner">
            <div className="catalog-hero-copy">
              <Link href={`/sede/${slug}`} className="catalog-back-link">
                ← Catalogo {location.name}
              </Link>
              <p className="script-accent mt-5 text-4xl md:text-5xl">{location.name}</p>
              <h1 className="catalog-hero-title display-title mt-1 max-w-3xl">
                {category.name} a {seo.keywordCity}
              </h1>
              <p className="catalog-hero-description mt-4 max-w-2xl text-sm leading-6 text-ink/65 md:text-base md:leading-7">
                {category.description ?? `Scopri la selezione ${category.name} disponibile nella sede ${seo.name}.`} Prezzi,
                varianti e disponibilità sono aggiornati per questo punto vendita.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="badge bg-white/75 text-ink/65">{categoryProducts.length} prodotti</span>
                {location.pickupEnabled ? <span className="badge bg-majolica/25 text-ink/70">Ritiro in sede</span> : null}
                {location.deliveryEnabled ? <span className="badge bg-brilliant/15 text-emerald-800">Consegna</span> : null}
              </div>
            </div>
            <aside className="catalog-hero-panel" aria-label={`Informazioni ${category.name} ${seo.name}`}>
              <div className="catalog-hero-panel-header">
                <p className="catalog-hero-panel-kicker">Categoria locale</p>
                <h2>{category.name}</h2>
                <p>Una pagina dedicata alla selezione realmente disponibile presso {location.name}.</p>
              </div>
              <dl className="catalog-hero-facts">
                <div className="catalog-hero-fact">
                  <dt>Sede</dt>
                  <dd>{seo.address}, {seo.cityName}</dd>
                </div>
                {seo.hours ? (
                  <div className="catalog-hero-fact">
                    <dt>Orari</dt>
                    <dd>{seo.hours}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="catalog-hero-mini-grid mt-5">
                <span>Catalogo sede</span>
                <strong>{category.name}</strong>
              </div>
            </aside>
          </div>
        </section>

        <CatalogExplorer
          products={products}
          categories={categories.map((item) => ({
            id: item.id,
            name: item.name,
            slug: item.slug,
            description: item.description,
            accent: item.accent
          }))}
          locationSlug={slug}
          locationId={location.id}
          locationName={location.name}
          cityLabel={seo.keywordCity}
          initialCategorySlug={category.slug}
        />

        <section className="local-seo-band mt-16 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Sessa locale</p>
          <h2 className="mt-2 max-w-3xl font-serif text-3xl font-semibold">
            {category.name} Sessa 1930 a {seo.keywordCity}
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-ink/70">
            Questa selezione appartiene al catalogo ecommerce di {seo.name}. Ogni prodotto mostrato e associato alla
            sede, così disponibilità, formati e modalità di ritiro o consegna restano coerenti fino al checkout.
          </p>
        </section>
      </main>
      <Footer
        location={{
          name: seo.name,
          address: seo.address,
          city: seo.cityName,
          postalCode: seo.postalCode,
          phone: location.phone
        }}
      />
    </>
  );
}
