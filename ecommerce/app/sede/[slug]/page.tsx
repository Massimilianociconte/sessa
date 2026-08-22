import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import AnalyticsBeacon from "@/components/storefront/AnalyticsBeacon";
import CatalogExplorer from "@/components/storefront/CatalogExplorer";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { buildStoreJsonLd, buildStoreMetadata, getStoreSeo } from "@/lib/seo/sessa-local";
import { listStoreCategories, listStoreProducts } from "@/lib/services/catalog";
import { getActiveLocationBySlug, listActiveLocations } from "@/lib/services/locations";
import { getLocationVisual } from "@/lib/location-visuals";

export const revalidate = 30;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = await getActiveLocationBySlug(slug);
  if (!location) return {};
  return buildStoreMetadata(location);
}

export async function generateStaticParams() {
  try {
    const locations = await listActiveLocations();
    return locations.map((location) => ({ slug: location.slug }));
  } catch {
    // Il deploy resta possibile durante un disservizio DB; la route verra
    // generata e messa in cache alla prima richiesta riuscita.
    return [];
  }
}

export default async function StoreCatalogPage({ params }: Props) {
  const { slug } = await params;
  const location = await getActiveLocationBySlug(slug);
  if (!location) notFound();

  const [products, categories] = await Promise.all([
    listStoreProducts(location.id),
    listStoreCategories(location.id)
  ]);
  const itemListId = slug;
  const itemListName = `Catalogo ${location.name}`;
  const seo = getStoreSeo(location);
  const jsonLd = buildStoreJsonLd(location, products);
  const locationVisual = getLocationVisual(location, seo.cityName);
  return (
    <>
      <Header currentLocation={{ slug: location.slug, name: seo.name }} />
      <JsonLd data={jsonLd} />
      <AnalyticsBeacon
        event="view_item_list"
        payload={{
          item_list_id: itemListId,
          item_list_name: itemListName,
          location_id: location.id,
          location_name: location.name,
          items: products.slice(0, 12).map((product) => ({
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
              "--location-hero-bg": `url("${locationVisual.background}")`,
              "--hero-tile": locationVisual.tile,
              "--hero-accent": locationVisual.accent
            } as CSSProperties
          }
        >
          <div className="catalog-hero-inner">
            <div className="catalog-hero-copy">
              <Link href="/" className="catalog-back-link">
                ← Tutte le sedi
              </Link>
              <p className="script-accent mt-5 text-4xl md:text-5xl">{location.name}</p>
              <h1 className="catalog-hero-title display-title mt-1 max-w-3xl">{seo.h1}</h1>
              <p className="catalog-hero-description mt-4 max-w-2xl text-sm leading-6 text-ink/65 md:text-base md:leading-7">
                {seo.directAnswer}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {location.pickupEnabled && <span className="badge bg-majolica/25 text-ink/70">Ritiro in sede</span>}
                {location.deliveryEnabled && <span className="badge bg-brilliant/15 text-emerald-800">Consegna</span>}
                <span className="badge bg-white/70 text-ink/60">{products.length} prodotti</span>
              </div>
            </div>

            <aside className="catalog-hero-panel" aria-label={`Informazioni ${seo.name}`}>
              <div className="catalog-hero-panel-header">
                <p className="catalog-hero-panel-kicker">Sessa locale</p>
                <h2>{seo.keywordCity}</h2>
                <p>Catalogo ecommerce collegato alla sede, con disponibilità e servizi aggiornati.</p>
              </div>

              <dl className="catalog-hero-facts">
                <div className="catalog-hero-fact">
                  <dt>Indirizzo</dt>
                  <dd>
                    {seo.address}
                    {seo.cityName ? `, ${seo.cityName}` : ""}
                  </dd>
                </div>
                {seo.hours && (
                  <div className="catalog-hero-fact">
                    <dt>Orari</dt>
                    <dd>{seo.hours}</dd>
                  </div>
                )}
              </dl>

              <div className="catalog-hero-services" aria-label="Servizi disponibili">
                {location.pickupEnabled && <span>Ritiro in sede</span>}
                {location.deliveryEnabled && <span>Consegna</span>}
              </div>

              <div className="catalog-hero-mini-grid mt-5">
                <span>Catalogo sede</span>
                <strong>Tutto</strong>
              </div>
            </aside>
          </div>
        </section>

        <CatalogExplorer
          products={products}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            accent: category.accent
          }))}
          locationSlug={slug}
          locationId={location.id}
          locationName={location.name}
          cityLabel={seo.keywordCity}
        />

        <section className="local-seo-band mt-16 py-12">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Sessa locale</p>
              <h2 className="mt-2 font-serif text-3xl font-semibold">Ordina Sessa 1930 a {seo.keywordCity}</h2>
              <p className="mt-4 text-base leading-7 text-ink/70">{seo.directAnswer}</p>
              <p className="mt-4 text-sm leading-6 text-ink/60">{seo.narrative}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {seo.signatureProducts.slice(0, 7).map((item) => (
                  <span key={item} className="badge bg-cream text-ink/65">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="local-info-card rounded-2xl border border-ink/10 bg-white p-5">
              <h3 className="font-serif text-2xl font-semibold">Informazioni sede</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-semibold text-ink">Indirizzo</dt>
                  <dd className="text-ink/60">
                    {seo.address}, {seo.postalCode} {seo.cityName} {seo.province && `(${seo.province})`}
                  </dd>
                </div>
                {seo.hours && (
                  <div>
                    <dt className="font-semibold text-ink">Orari</dt>
                    <dd className="text-ink/60">{seo.hours}</dd>
                  </div>
                )}
                <div>
                  <dt className="font-semibold text-ink">Servizi ecommerce</dt>
                  <dd className="text-ink/60">
                    {location.pickupEnabled ? "Ritiro in sede" : "Ritiro non disponibile"}
                    {location.deliveryEnabled ? " e consegna dove prevista." : "."}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-ink/45">
                {seo.sourceNote}{" "}
                <a href={seo.sourceUrl} rel="nofollow noopener noreferrer" target="_blank" className="font-semibold text-terracotta">
                  Fonte ufficiale
                </a>
              </p>
            </div>
          </div>

          <div className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ceramic">FAQ locale</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold">Domande frequenti su {seo.name}</h2>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {seo.faq.map((item) => (
              <article key={item.question} className="faq-card rounded-2xl border border-ink/10 bg-white p-4">
                <h3 className="font-serif text-lg font-semibold">{item.question}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/60">{item.answer}</p>
              </article>
            ))}
          </div>
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
