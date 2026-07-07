import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import AnalyticsBeacon from "@/components/storefront/AnalyticsBeacon";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import ProductCard from "@/components/storefront/ProductCard";
import { buildStoreJsonLd, buildStoreMetadata, getStoreSeo } from "@/lib/seo/sessa-local";
import { CATALOG_OCCASIONS, listStoreCategories, listStoreProducts } from "@/lib/services/catalog";
import { getActiveLocationBySlug } from "@/lib/services/locations";

export const dynamic = "force-dynamic";

const CATEGORY_ACCENTS: Record<string, { color: string; tile: string }> = {
  terracotta: { color: "#d65a1f", tile: 'url("/patterns/sessa-maiolica-orange.png")' },
  blue: { color: "#073fd0", tile: 'url("/patterns/sessa-maiolica-blue.png")' },
  green: { color: "#08c963", tile: 'url("/patterns/sessa-maiolica-green.png")' }
};

const CITY_HERO_BACKGROUNDS: Record<string, string> = {
  firenze: "/images/sfondo-sedi/firenze.webp",
  milano: "/images/sfondo-sedi/milano.webp",
  roma: "/images/sfondo-sedi/roma.webp",
  torino: "/images/sfondo-sedi/torino.webp",
  vesuvio: "/images/sfondo-sedi/vesuvio1.webp"
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ categoria?: string; q?: string; uso?: string }>;
};

function normalizeLocationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.+?\)/g, " ");
}

function getLocationHeroBackground(location: { slug: string; name: string; city: string }, cityName: string) {
  const haystack = normalizeLocationText(`${location.slug} ${location.name} ${location.city} ${cityName}`);
  if (haystack.includes("milano") || haystack.includes("merlata")) return CITY_HERO_BACKGROUNDS.milano;
  if (haystack.includes("roma")) return CITY_HERO_BACKGROUNDS.roma;
  if (haystack.includes("torino")) return CITY_HERO_BACKGROUNDS.torino;
  if (haystack.includes("firenze")) return CITY_HERO_BACKGROUNDS.firenze;
  if (haystack.includes("ottaviano") || haystack.includes("vesuvio") || haystack.includes("napoli")) {
    return CITY_HERO_BACKGROUNDS.vesuvio;
  }
  return CITY_HERO_BACKGROUNDS.vesuvio;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const location = await getActiveLocationBySlug(slug);
  if (!location) return {};
  return buildStoreMetadata(location);
}

export default async function StoreCatalogPage({ params, searchParams }: Props) {
  const [{ slug }, { categoria, q, uso }] = await Promise.all([params, searchParams]);
  const location = await getActiveLocationBySlug(slug);
  if (!location) notFound();

  const [products, categories] = await Promise.all([
    listStoreProducts(location.id, { categorySlug: categoria, query: q, occasion: uso }),
    listStoreCategories(location.id)
  ]);
  const activeCategory = categories.find((c) => c.slug === categoria);
  const activeOccasion = CATALOG_OCCASIONS.find((o) => o.slug === uso);
  const itemListId = `${slug}${categoria ? `-${categoria}` : ""}${uso ? `-${uso}` : ""}`;
  const itemListName = activeOccasion?.label ?? activeCategory?.name ?? `Catalogo ${location.name}`;
  const seo = getStoreSeo(location);
  const jsonLd = buildStoreJsonLd(location, products);
  const heroBackground = getLocationHeroBackground(location, seo.cityName);
  const activeFiltersCount = [categoria, uso, q?.trim()].filter(Boolean).length;
  const categoryFilters = [
    {
      id: "all",
      name: "Tutti",
      slug: "",
      description: `Tutto il catalogo ecommerce disponibile per ${seo.keywordCity}.`,
      accent: "#d65a1f",
      tile: 'url("/patterns/sessa-maiolica-orange.png")'
    },
    ...categories.map((category, index) => {
      const accent = CATEGORY_ACCENTS[category.accent ?? ""] ?? Object.values(CATEGORY_ACCENTS)[index % 3];
      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description ?? "Selezione artigianale Sessa per la sede scelta.",
        accent: accent.color,
        tile: accent.tile
      };
    })
  ];
  const baseParams = new URLSearchParams();
  if (categoria) baseParams.set("categoria", categoria);
  if (q) baseParams.set("q", q);
  if (uso) baseParams.set("uso", uso);

  function hrefWith(next: { categoria?: string; uso?: string; q?: string }) {
    const params = new URLSearchParams(baseParams);
    if (next.categoria !== undefined) {
      if (next.categoria) params.set("categoria", next.categoria);
      else params.delete("categoria");
    }
    if (next.uso !== undefined) {
      if (next.uso) params.set("uso", next.uso);
      else params.delete("uso");
    }
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    const qs = params.toString();
    return `/sede/${slug}${qs ? `?${qs}` : ""}`;
  }

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
          search_term: q,
          filter_name: activeOccasion?.label ?? activeCategory?.name,
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
          className="catalog-hero catalog-hero-premium py-8 md:py-12"
          style={
            {
              "--location-hero-bg": `url("${heroBackground}")`
            } as CSSProperties
          }
        >
          <div className="catalog-hero-inner">
            <div className="catalog-hero-copy">
              <Link href="/" className="catalog-back-link">
                ← Tutte le sedi
              </Link>
              <p className="script-accent mt-5 text-4xl md:text-5xl">{location.name}</p>
              <h1 className="catalog-hero-title display-title mt-1 max-w-3xl">
                {activeCategory ? `${activeCategory.name} ${seo.keywordCity}` : seo.h1}
              </h1>
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
                <strong>{activeCategory?.name ?? activeOccasion?.label ?? "Tutto"}</strong>
              </div>
            </aside>
          </div>
        </section>

        <section className="catalog-search-card catalog-toolbar mb-8 grid gap-4 p-4 md:grid-cols-[1fr_auto]">
          <form action={`/sede/${slug}`} className="flex flex-col gap-3 sm:flex-row">
            {categoria && <input type="hidden" name="categoria" value={categoria} />}
            {uso && <input type="hidden" name="uso" value={uso} />}
            <label htmlFor="catalog-search" className="sr-only">
              Cerca prodotti
            </label>
            <input
              id="catalog-search"
              name="q"
              defaultValue={q}
              className="input-field"
              placeholder="Cerca sfogliatelle, box regalo, caprese..."
              autoComplete="off"
            />
            <button type="submit" className="btn-primary shrink-0">
              Cerca
            </button>
          </form>
          <div className="flex items-center justify-start gap-3 md:justify-end">
            {activeFiltersCount > 0 && (
              <span className="hidden rounded-full bg-cream px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/45 sm:inline-flex">
                {activeFiltersCount} filtri
              </span>
            )}
            {(q || categoria || uso) && (
              <Link href={`/sede/${slug}`} scroll={false} className="catalog-reset-link">
                Azzera filtri
              </Link>
            )}
          </div>
        </section>

        <section className="catalog-filter-section mb-8">
          <div className="catalog-section-heading mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Catalogo sede</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold text-ink">Scegli una categoria</h2>
            </div>
            <span className="rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs font-semibold text-ink/50">
              {products.length} {products.length === 1 ? "prodotto" : "prodotti"}
            </span>
          </div>
          <nav className="catalog-filter-grid" aria-label="Categorie prodotto">
            {categoryFilters.map((filter) => {
              const isActive = filter.slug ? categoria === filter.slug : !categoria;
              return (
                <Link
                  key={filter.id}
                  href={hrefWith({ categoria: filter.slug })}
                  scroll={false}
                  aria-current={isActive ? "page" : undefined}
                  className={`catalog-filter-card ${isActive ? "catalog-filter-card-active" : ""}`}
                  style={{ "--accent": filter.accent, "--tile": filter.tile } as CSSProperties}
                >
                  <span className="catalog-filter-kicker">{filter.slug ? "Categoria" : "Catalogo"}</span>
                  <strong>{filter.name}</strong>
                  <span>{filter.description}</span>
                </Link>
              );
            })}
          </nav>
        </section>

        <section className="catalog-filter-section mb-10">
          <div className="catalog-section-heading catalog-section-heading-center mb-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">Scegli per occasione</p>
          </div>
          <nav className="catalog-filter-grid" aria-label="Occasioni d'acquisto">
            {CATALOG_OCCASIONS.map((occasion) => (
              <Link
                key={occasion.slug}
                href={hrefWith({ uso: uso === occasion.slug ? "" : occasion.slug })}
                scroll={false}
                aria-current={uso === occasion.slug ? "page" : undefined}
                className={`catalog-filter-card catalog-filter-card-occasion ${uso === occasion.slug ? "catalog-filter-card-active" : ""}`}
                style={
                  {
                    "--accent": uso === occasion.slug ? "#d65a1f" : "#1f4e79",
                    "--tile": uso === occasion.slug ? 'url("/patterns/sessa-maiolica-orange.png")' : 'url("/patterns/sessa-maiolica-blue.png")'
                  } as CSSProperties
                }
              >
                <span className="catalog-filter-kicker">{uso === occasion.slug ? "Selezionato" : "Occasione"}</span>
                <strong>{occasion.label}</strong>
                <span>{occasion.description}</span>
              </Link>
            ))}
          </nav>
        </section>

        <section className="catalog-results" aria-live="polite">
          {products.length === 0 ? (
            <div className="card py-16 text-center">
              <p className="font-serif text-2xl font-semibold">Nessun prodotto trovato</p>
              <p className="mt-2 text-sm text-ink/55">
                Prova a cambiare occasione, categoria o ricerca. La disponibilità resta legata alla sede selezionata.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  locationSlug={slug}
                  locationId={location.id}
                  locationName={location.name}
                  listId={itemListId}
                  listName={itemListName}
                  index={i}
                />
              ))}
            </div>
          )}
        </section>

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
      <Footer />
    </>
  );
}
