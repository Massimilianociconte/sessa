import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_OCCASIONS, matchesCatalogQuery, matchesOccasion, rankCatalogHits } from "@/lib/catalog-discovery";
import { effectivePrice, toStoreProductView, type StoreProductView } from "@/lib/services/catalog";
import { makeRawProduct } from "../support/fixtures";

test("il prezzo effettivo usa l'override della sede se presente", () => {
  assert.equal(effectivePrice(null, 450), 450);
  assert.equal(effectivePrice(390, 450), 390);
  assert.equal(effectivePrice(0, 450), 0);
});

test("la vetrina esclude varianti senza StoreVariant e calcola stock e range prezzi", () => {
  const view = toStoreProductView(
    makeRawProduct({
      variants: [
        {
          id: "missing-sv",
          name: "Nascosta",
          sku: "HID-01",
          basePriceCents: 100,
          compareAtCents: null,
          position: 0,
          storeVariants: []
        },
        {
          id: "small",
          name: "Piccola",
          sku: "SFO-S",
          basePriceCents: 250,
          compareAtCents: 300,
          position: 1,
          storeVariants: [
            { id: "sv-s", priceCentsOverride: 220, compareAtCents: 280, stockQty: 0, lowStockThreshold: 3 }
          ]
        },
        {
          id: "large",
          name: "Grande",
          sku: "SFO-L",
          basePriceCents: 400,
          compareAtCents: null,
          position: 2,
          storeVariants: [
            { id: "sv-l", priceCentsOverride: null, compareAtCents: null, stockQty: 4, lowStockThreshold: 2 }
          ]
        }
      ]
    })
  );
  assert.deepEqual(
    view.variants.map((variant) => variant.sku),
    ["SFO-S", "SFO-L"]
  );
  assert.equal(view.variants[0]?.priceCents, 220);
  assert.equal(view.variants[0]?.compareAtCents, 280);
  assert.equal(view.variants[1]?.priceCents, 400);
  assert.equal(view.priceMin, 220);
  assert.equal(view.priceMax, 400);
  assert.equal(view.inStock, true);
  assert.deepEqual(view.gallery, [
    "/images/products/product-sfogliatelle.webp",
    "/images/gallery/sfo-2.webp"
  ]);
});

test("un prodotto senza pezzi disponibili risulta esaurito ma resta mappato", () => {
  const view = toStoreProductView(
    makeRawProduct({
      variants: [
        {
          id: "only",
          name: "Pz",
          sku: "OUT-1",
          basePriceCents: 200,
          compareAtCents: null,
          position: 0,
          storeVariants: [
            { id: "sv-o", priceCentsOverride: null, compareAtCents: null, stockQty: 0, lowStockThreshold: 1 }
          ]
        }
      ]
    })
  );
  assert.equal(view.inStock, false);
  assert.equal(view.priceMin, 200);
});

test("la ricerca ignora accenti, trova SKU e classifica i match", () => {
  const products = [
    { id: "1", name: "Sfogliatella riccia", sku: "SFO-RIC", tags: "classici", category: "Sfogliatelle" },
    { id: "2", name: "Babà al rum", sku: "BABA-01", tags: "tradizionale", category: "Pasticceria" },
    { id: "3", name: "Box regalo", sku: "BOX-REG", tags: "regalo", category: "Box Regalo" }
  ];
  assert.equal(matchesCatalogQuery({ name: "Babà al rum", sku: "BABA-01" }, "baba"), true);
  assert.equal(matchesCatalogQuery({ name: "Sfogliatella", sku: "SFO-RIC" }, "sfo-ric"), true);
  assert.equal(matchesCatalogQuery({ name: "Caprese", sku: "CAP-01" }, "xyz"), false);
  assert.equal(matchesCatalogQuery({ name: "Caprese", sku: "CAP-01" }, "   "), true);
  assert.equal(rankCatalogHits(products, "sfogliatella")[0]?.id, "1");
  assert.equal(rankCatalogHits(products, "box-reg")[0]?.id, "3");
  assert.equal(rankCatalogHits(products, "inesistente").length, 0);
});

test("le occasioni sono slugs stabili e un filtro sconosciuto non nasconde il catalogo", () => {
  assert.deepEqual(
    CATALOG_OCCASIONS.map((occasion) => occasion.slug),
    ["regalo", "colazione", "festa", "classici"]
  );
  const product = toStoreProductView(makeRawProduct());
  assert.equal(matchesOccasion(product, "classici"), true);
  assert.equal(matchesOccasion(product, "regalo"), false);
  assert.equal(matchesOccasion(product, "filtro-futuro"), true);
  assert.equal(matchesOccasion(product as StoreProductView, undefined), true);
});
