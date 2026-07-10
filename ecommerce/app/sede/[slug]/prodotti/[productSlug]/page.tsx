import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import JsonLd from "@/components/seo/JsonLd";
import AddToCartForm from "@/components/storefront/AddToCartForm";
import AnalyticsBeacon from "@/components/storefront/AnalyticsBeacon";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import ProductCard from "@/components/storefront/ProductCard";
import { formatCents } from "@/lib/money";
import { buildProductJsonLd, buildProductMetadata, getStoreSeo } from "@/lib/seo/sessa-local";
import { CATALOG_OCCASIONS, getStoreProduct, listStoreProducts, matchesOccasion } from "@/lib/services/catalog";
import { getActiveLocationBySlug } from "@/lib/services/locations";

export const revalidate = 30;

type Props = { params: Promise<{ slug: string; productSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const location = await getActiveLocationBySlug(slug);
  if (!location) return {};
  const product = await getStoreProduct(location.id, productSlug);
  if (!product) return {};
  return buildProductMetadata(location, product);
}

export default async function StoreProductPage({ params }: Props) {
  const { slug, productSlug } = await params;
  const location = await getActiveLocationBySlug(slug);
  if (!location) notFound();
  const product = await getStoreProduct(location.id, productSlug);
  if (!product) notFound();
  const seo = getStoreSeo(location);
  const jsonLd = buildProductJsonLd(location, product);

  const available = product.variants.filter((v) => v.stockQty > 0);
  const relatedProducts = product.category
    ? (await listStoreProducts(location.id, { categorySlug: product.category.slug }))
        .filter((item) => item.id !== product.id)
        .slice(0, 3)
    : [];
  const occasionLabels = CATALOG_OCCASIONS.filter((occasion) => matchesOccasion(product, occasion.slug)).slice(0, 3);
  const priceLabel =
    product.priceMin === product.priceMax
      ? formatCents(product.priceMin)
      : `${formatCents(product.priceMin)} - ${formatCents(product.priceMax)}`;
  const fulfillmentCopy = [
    location.pickupEnabled ? "ritiro in sede" : null,
    location.deliveryEnabled ? "consegna" : null
  ]
    .filter(Boolean)
    .join(" e ");

  return (
    <>
      <Header currentLocation={{ slug: location.slug, name: seo.name }} />
      <JsonLd data={jsonLd} />
      <AnalyticsBeacon
        event="view_item"
        payload={{
          value: product.priceMin / 100,
          location_id: location.id,
          location_name: location.name,
          items: [
            {
              item_id: product.id,
              item_name: product.name,
              item_category: product.category?.name,
              price: product.priceMin / 100,
              location_id: location.id,
              location_name: location.name
            }
          ]
        }}
      />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <nav className="mb-6 text-sm text-ink/50">
          <Link href={`/sede/${slug}`} className="hover:text-terracotta">
            {seo.name}
          </Link>
          {product.category && (
            <>
              {" / "}
              <Link href={`/sede/${slug}?categoria=${product.category.slug}`} className="hover:text-terracotta">
                {product.category.name}
              </Link>
            </>
          )}
          {" / "}
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="card overflow-hidden bg-cream">
            <div className="tile-frame flex aspect-square items-center justify-center">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt={product.name}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="max-h-[440px] object-contain"
                />
              ) : (
                <span className="font-script text-6xl text-terracotta/40">Sessa</span>
              )}
            </div>
          </div>

          <div>
            {product.category && (
              <p className="text-xs font-semibold uppercase tracking-widest text-terracotta">
                {product.category.name}
              </p>
            )}
            <h1 className="mt-1 font-serif text-4xl font-semibold">{product.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-serif text-2xl font-semibold">{priceLabel}</span>
              <span className="badge bg-majolica/25 text-ink/70">Disponibile presso {location.name}</span>
              {occasionLabels.map((occasion) => (
                <Link
                  key={occasion.slug}
                  href={`/sede/${slug}?uso=${occasion.slug}`}
                  className="badge bg-brilliant/12 text-emerald-800 hover:bg-brilliant/20"
                >
                  {occasion.label}
                </Link>
              ))}
            </div>
            <p className="mt-4 whitespace-pre-line text-ink/70">{product.description}</p>
            <p className="mt-3 text-sm leading-6 text-ink/55">
              Pagina prodotto locale per {seo.keywordCity}: disponibilità, varianti e stock sono collegati alla sede {seo.name}.
            </p>

            {(product.ingredients || product.allergens) && (
              <div className="mt-4 space-y-1 rounded-xl bg-cream px-4 py-3 text-sm">
                {product.ingredients && (
                  <p>
                    <span className="font-semibold">Ingredienti:</span> {product.ingredients}
                  </p>
                )}
                {product.allergens && (
                  <p className="text-ink/70">
                    <span className="font-semibold text-terracotta">Allergeni:</span> {product.allergens}
                  </p>
                )}
              </div>
            )}

            {available.length === 0 ? (
              <p className="mt-8 rounded-xl bg-ink/5 px-4 py-3 text-sm font-semibold text-ink/60">
                Al momento non disponibile in questa sede. Prova un'altra sede o torna sul catalogo per una proposta simile.
              </p>
            ) : (
              <AddToCartForm
                locationId={location.id}
                analytics={{
                  productId: product.id,
                  productName: product.name,
                  category: product.category?.name,
                  locationName: location.name
                }}
                variants={product.variants.map((v) => ({
                  storeVariantId: v.storeVariantId,
                  name: v.name,
                  priceCents: v.priceCents,
                  stockQty: v.stockQty,
                  lowStockThreshold: v.lowStockThreshold
                }))}
              />
            )}
          </div>
        </div>

        <section className="mt-12 grid gap-4 md:grid-cols-4" aria-label="Informazioni utili sul prodotto">
          <div className="accent-card rounded-2xl border border-ink/10 bg-white p-4">
            <p className="font-serif text-lg font-semibold">Freschezza</p>
            <p className="mt-1 text-sm text-ink/60">
              Disponibilita e stock sono letti dalla sede selezionata, con avvisi quando restano pochi pezzi.
            </p>
          </div>
          <div className="accent-card rounded-2xl border border-ink/10 bg-white p-4">
            <p className="font-serif text-lg font-semibold">Ritiro e consegna</p>
            <p className="mt-1 text-sm text-ink/60">
              {fulfillmentCopy ? `Puoi scegliere ${fulfillmentCopy} nel checkout.` : "La sede gestisce la disponibilità prima della conferma."}
            </p>
          </div>
          <div className="accent-card rounded-2xl border border-ink/10 bg-white p-4">
            <p className="font-serif text-lg font-semibold">Allergeni</p>
            <p className="mt-1 text-sm text-ink/60">
              {product.allergens || "Il team puo confermare ingredienti e possibili contaminazioni prima del ritiro."}
            </p>
          </div>
          <div className="accent-card rounded-2xl border border-ink/10 bg-white p-4">
            <p className="font-serif text-lg font-semibold">Regalo</p>
            <p className="mt-1 text-sm text-ink/60">
              Aggiungi una nota ordine per confezione, dedica o indicazioni di servizio.
            </p>
          </div>
        </section>

        {relatedProducts.length > 0 && (
          <section className="mt-16">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Potresti aggiungere</p>
                <h2 className="font-serif text-3xl font-semibold">Scelte coerenti dalla stessa sede</h2>
              </div>
              <Link href={`/sede/${slug}`} className="btn-ghost text-sm">
                Vedi catalogo
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedProducts.map((item, index) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  locationSlug={slug}
                  locationId={location.id}
                  locationName={location.name}
                  listId={`related-${product.slug}`}
                  listName={`Correlati ${product.name}`}
                  index={index + 1}
                />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
