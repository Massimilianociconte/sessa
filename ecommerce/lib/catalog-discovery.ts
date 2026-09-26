import type { StoreProductView } from "@/lib/services/catalog";

export const CATALOG_OCCASIONS = [
  {
    slug: "regalo",
    label: "Da regalare",
    description: "Lievitati, box e confezioni con una presenza importante."
  },
  {
    slug: "colazione",
    label: "Perfetti per colazione",
    description: "Dolci da condividere al mattino o con il caffè."
  },
  {
    slug: "festa",
    label: "Per una festa",
    description: "Scelte scenografiche per tavole, compleanni e ricorrenze."
  },
  {
    slug: "classici",
    label: "Classici Sessa",
    description: "Specialità napoletane e pasticceria tradizionale."
  }
] as const;

export function matchesOccasion(product: StoreProductView, occasion?: string): boolean {
  if (!occasion) return true;
  const haystack = [
    product.name,
    product.shortDescription ?? "",
    product.description,
    product.tags,
    product.category?.slug ?? "",
    product.category?.name ?? ""
  ]
    .join(" ")
    .toLowerCase();

  if (occasion === "regalo") return /regalo|box|lievitati|panettone|colomba/.test(haystack);
  if (occasion === "colazione") return /colazioni|sfogliatelle|graffe|cornetti|bab/.test(haystack);
  if (occasion === "festa") return /box|torta|caprese|delizia|lievitati|festa|pasticceria/.test(haystack);
  if (occasion === "classici") return /classici|sfogliatelle|bab|caprese|tradizionale|napoletan/.test(haystack);
  return true;
}

type SearchableProduct = {
  id?: string;
  name: string;
  sku?: string;
  tags?: string;
  category?: string | { name: string } | null;
  shortDescription?: string | null;
  description?: string;
};

function foldIt(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("it-IT");
}

function searchableText(product: SearchableProduct): string {
  const category = typeof product.category === "string" ? product.category : product.category?.name ?? "";
  return [
    product.name,
    product.sku ?? "",
    product.tags ?? "",
    category,
    product.shortDescription ?? "",
    product.description ?? ""
  ].join(" ");
}

export function matchesCatalogQuery(product: SearchableProduct | StoreProductView, query: string): boolean {
  const normalized = foldIt(query.trim());
  if (!normalized) return true;
  const view = product as StoreProductView & SearchableProduct;
  const sku = view.sku ?? view.variants?.map((variant) => variant.sku).join(" ") ?? "";
  return foldIt(searchableText({
    name: view.name,
    sku,
    tags: view.tags,
    category: view.category,
    shortDescription: view.shortDescription,
    description: view.description
  })).includes(normalized);
}

export function rankCatalogHits<T extends SearchableProduct>(products: T[], query: string): T[] {
  const needle = foldIt(query.trim());
  if (!needle) return products;
  return products
    .map((product) => {
      const name = foldIt(product.name);
      const sku = foldIt(product.sku ?? "");
      const hay = foldIt(searchableText(product));
      let score = 0;
      if (sku === needle) score += 100;
      else if (sku.includes(needle)) score += 70;
      if (name.startsWith(needle)) score += 50;
      else if (name.includes(needle)) score += 30;
      else if (hay.includes(needle)) score += 10;
      return { product, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.product);
}
