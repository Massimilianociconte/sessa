"use client";

import type { CSSProperties, FormEvent, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { CATALOG_OCCASIONS, matchesCatalogQuery, matchesOccasion, rankCatalogHits } from "@/lib/catalog-discovery";
import { trackEcommerceEvent } from "@/lib/analytics";
import type { StoreProductView } from "@/lib/services/catalog";
import ProductCard from "@/components/storefront/ProductCard";

type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  accent: string;
};

const CATEGORY_ACCENTS: Record<string, { color: string; tile: string }> = {
  terracotta: { color: "#d65a1f", tile: 'url("/patterns/sessa-maiolica-orange.png")' },
  blue: { color: "#073fd0", tile: 'url("/patterns/sessa-maiolica-blue.png")' },
  green: { color: "#08c963", tile: 'url("/patterns/sessa-maiolica-green.png")' }
};

function filtersFromLocation(initialCategorySlug?: string) {
  if (typeof window === "undefined") {
    return { category: initialCategorySlug ?? "", occasion: "", query: "" };
  }
  const url = new URL(window.location.href);
  const pathCategory = url.pathname.match(/\/categorie\/([^/]+)\/?$/)?.[1];
  return {
    category: url.searchParams.get("categoria") ?? pathCategory ?? initialCategorySlug ?? "",
    occasion: url.searchParams.get("uso") ?? "",
    query: url.searchParams.get("q") ?? ""
  };
}

export default function CatalogExplorer({
  products,
  categories,
  locationSlug,
  locationId,
  locationName,
  cityLabel,
  initialCategorySlug
}: {
  products: StoreProductView[];
  categories: CatalogCategory[];
  locationSlug: string;
  locationId: string;
  locationName: string;
  cityLabel: string;
  initialCategorySlug?: string;
}) {
  const [category, setCategory] = useState(initialCategorySlug ?? "");
  const [occasion, setOccasion] = useState("");
  const [query, setQuery] = useState("");
  const [queryDraft, setQueryDraft] = useState("");
  const [sort, setSort] = useState<"featured" | "price-asc" | "price-desc" | "name">("featured");

  useEffect(() => {
    const syncFromHistory = () => {
      const next = filtersFromLocation(initialCategorySlug);
      setCategory(next.category);
      setOccasion(next.occasion);
      setQuery(next.query);
      setQueryDraft(next.query);
    };
    syncFromHistory();
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [initialCategorySlug]);

  const filteredProducts = useMemo(() => {
    const base = products.filter(
      (product) =>
        (!category || product.category?.slug === category) &&
        matchesOccasion(product, occasion) &&
        matchesCatalogQuery(product, query)
    );
    const searched = query.trim()
      ? rankCatalogHits(
          base.map((product) => ({
            ...product,
            sku: product.variants.map((variant) => variant.sku).join(" ")
          })),
          query
        )
      : base;
    const copy = [...searched];
    if (sort === "price-asc") copy.sort((a, b) => a.priceMin - b.priceMin);
    if (sort === "price-desc") copy.sort((a, b) => b.priceMin - a.priceMin);
    if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name, "it"));
    return copy;
  }, [category, occasion, products, query, sort]);

  const activeCategory = categories.find((item) => item.slug === category);
  const activeOccasion = CATALOG_OCCASIONS.find((item) => item.slug === occasion);
  const activeFiltersCount = [category && category !== initialCategorySlug ? category : "", occasion, query.trim()].filter(Boolean).length;
  const listId = `${locationSlug}${category ? `-${category}` : ""}${occasion ? `-${occasion}` : ""}`;
  const listName = activeOccasion?.label ?? activeCategory?.name ?? `Catalogo ${locationName}`;

  function writeUrl(next: { category: string; occasion: string; query: string }) {
    const params = new URLSearchParams();
    if (next.category) params.set("categoria", next.category);
    if (next.occasion) params.set("uso", next.occasion);
    if (next.query.trim()) params.set("q", next.query.trim());
    if (initialCategorySlug && next.category === initialCategorySlug) params.delete("categoria");
    const suffix = params.toString();
    const path = initialCategorySlug && next.category === initialCategorySlug
      ? `/sede/${locationSlug}/categorie/${initialCategorySlug}`
      : `/sede/${locationSlug}`;
    window.history.pushState(null, "", `${path}${suffix ? `?${suffix}` : ""}`);
  }

  function selectCategory(nextCategory: string) {
    setCategory(nextCategory);
    writeUrl({ category: nextCategory, occasion, query });
    trackEcommerceEvent("filter_used", {
      location_id: locationId,
      location_name: locationName,
      filter_name: nextCategory || "tutti"
    });
  }

  function selectOccasion(nextOccasion: string) {
    const value = occasion === nextOccasion ? "" : nextOccasion;
    setOccasion(value);
    writeUrl({ category, occasion: value, query });
    trackEcommerceEvent("filter_used", {
      location_id: locationId,
      location_name: locationName,
      filter_name: value || "nessuna occasione"
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = queryDraft.trim();
    setQuery(value);
    writeUrl({ category, occasion, query: value });
    if (value) {
      trackEcommerceEvent("search", {
        location_id: locationId,
        location_name: locationName,
        search_term: value
      });
    }
  }

  function resetFilters() {
    const resetCategory = initialCategorySlug ?? "";
    setCategory(resetCategory);
    setOccasion("");
    setQuery("");
    setQueryDraft("");
    writeUrl({ category: resetCategory, occasion: "", query: "" });
  }

  function interceptCategoryLink(event: MouseEvent<HTMLAnchorElement>, nextCategory: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (nextCategory) return;
    event.preventDefault();
    selectCategory(nextCategory);
  }

  const categoryCards = [
    {
      id: "all",
      name: "Tutti",
      slug: "",
      description: `Tutto il catalogo ecommerce disponibile per ${cityLabel}.`,
      accent: "#d65a1f",
      tile: 'url("/patterns/sessa-maiolica-orange.png")'
    },
    ...categories.map((item, index) => {
      const theme = CATEGORY_ACCENTS[item.accent] ?? Object.values(CATEGORY_ACCENTS)[index % 3];
      return {
        ...item,
        description: item.description ?? "Selezione artigianale Sessa per la sede scelta.",
        accent: theme.color,
        tile: theme.tile
      };
    })
  ];

  return (
    <>
      <section className="catalog-search-card catalog-toolbar mb-8 mt-8 grid gap-4 p-4 md:mt-12 md:grid-cols-[1fr_auto]">
        <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="catalog-search" className="sr-only">
            Cerca prodotti
          </label>
          <input
            id="catalog-search"
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            className="input-field"
            placeholder="Cerca sfogliatelle, box regalo, caprese..."
            autoComplete="off"
            enterKeyHint="search"
          />
          <button type="submit" className="btn-primary shrink-0">
            Cerca
          </button>
          <label className="sr-only" htmlFor="catalog-sort">
            Ordina
          </label>
          <select
            id="catalog-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="input-field sm:w-44"
          >
            <option value="featured">In evidenza</option>
            <option value="price-asc">Prezzo crescente</option>
            <option value="price-desc">Prezzo decrescente</option>
            <option value="name">Nome</option>
          </select>
        </form>
        <div className="flex items-center justify-start gap-3 md:justify-end">
          {activeFiltersCount > 0 ? (
            <span className="hidden rounded-full bg-cream px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/45 sm:inline-flex">
              {activeFiltersCount} filtri
            </span>
          ) : null}
          {activeFiltersCount > 0 ? (
            <button type="button" onClick={resetFilters} className="catalog-reset-link">
              Azzera filtri
            </button>
          ) : null}
        </div>
      </section>

      <section className="catalog-filter-section mb-8">
        <div className="catalog-section-heading mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">Catalogo sede</p>
            <h2 className="font-serif text-3xl font-semibold">Scegli una categoria</h2>
          </div>
          <span className="badge bg-white text-ink/50">{filteredProducts.length} prodotti</span>
        </div>
        <nav className="catalog-filter-grid" aria-label="Categorie prodotto">
          {categoryCards.map((item) => {
            const isActive = category === item.slug;
            const href = item.slug
              ? `/sede/${locationSlug}/categorie/${item.slug}`
              : `/sede/${locationSlug}`;
            return (
              <a
                key={item.id}
                href={href}
                onClick={(event) => interceptCategoryLink(event, item.slug)}
                aria-current={isActive ? "page" : undefined}
                className={`catalog-filter-card ${isActive ? "catalog-filter-card-active" : ""}`}
                style={{ "--accent": item.accent, "--tile": item.tile } as CSSProperties}
              >
                <span className="catalog-filter-kicker">{item.slug ? "Categoria" : "Catalogo"}</span>
                <strong>{item.name}</strong>
                <span>{item.description}</span>
              </a>
            );
          })}
        </nav>
      </section>

      <section className="catalog-filter-section mb-10">
        <div className="catalog-section-heading catalog-section-heading-center mb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink/45">Scegli per occasione</p>
        </div>
        <div className="catalog-filter-grid" role="group" aria-label="Occasioni d'acquisto">
          {CATALOG_OCCASIONS.map((item) => {
            const isActive = occasion === item.slug;
            return (
              <button
                key={item.slug}
                type="button"
                onClick={() => selectOccasion(item.slug)}
                aria-pressed={isActive}
                className={`catalog-filter-card catalog-filter-card-occasion text-left ${isActive ? "catalog-filter-card-active" : ""}`}
                style={
                  {
                    "--accent": isActive ? "#d65a1f" : "#1f4e79",
                    "--tile": isActive
                      ? 'url("/patterns/sessa-maiolica-orange.png")'
                      : 'url("/patterns/sessa-maiolica-blue.png")'
                  } as CSSProperties
                }
              >
                <span className="catalog-filter-kicker">{isActive ? "Selezionato" : "Occasione"}</span>
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="catalog-results" aria-live="polite" aria-busy="false">
        <p className="sr-only">
          {filteredProducts.length} prodotti mostrati{listName ? ` per ${listName}` : ""}.
        </p>
        {filteredProducts.length === 0 ? (
          <div className="card py-16 text-center">
            <p className="font-serif text-2xl font-semibold">Nessun prodotto trovato</p>
            <p className="mt-2 text-sm text-ink/55">
              Prova a cambiare occasione, categoria o ricerca. La disponibilita resta legata alla sede selezionata.
            </p>
            <button type="button" onClick={resetFilters} className="btn-secondary mt-5">
              Mostra tutto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                locationSlug={locationSlug}
                locationId={locationId}
                locationName={locationName}
                listId={listId}
                listName={listName}
                index={index}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
