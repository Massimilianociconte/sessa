import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import robots from "@/app/robots";
import {
  buildProductBreadcrumbJsonLd,
  buildProductMetadata,
  buildStoreCategoryMetadata,
  hoursMatchForStructuredData,
  normalizeOpeningHoursText
} from "@/lib/seo/sessa-local";
import { sanitizeCartLines } from "@/lib/commerce/cart-integrity";
import { toStoreProductView } from "@/lib/services/catalog";
import { makeRawProduct } from "../support/fixtures";

const ottaviano = {
  name: "Ottaviano",
  slug: "ottaviano",
  city: "Ottaviano",
  address: "Piazza Municipio, 27",
  province: "NA",
  postalCode: "80044",
  pickupEnabled: true,
  deliveryEnabled: true
};

test("robots tiene fuori account, checkout, carrello, admin e feed", () => {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  const disallow = list.flatMap((rule) => {
    const value = rule.disallow;
    return Array.isArray(value) ? value : value ? [value] : [];
  });
  for (const path of ["/admin", "/account", "/checkout", "/carrello", "/ordine/", "/feeds/", "/api/", "/r/"]) {
    assert.ok(disallow.includes(path), path);
  }
  assert.match(String(robots().sitemap), /sitemap\.xml$/);
});

test("llms.txt elenca le sette sedi e la gift card come credito", () => {
  const llms = readFileSync(resolve(process.cwd(), "public/llms.txt"), "utf8");
  for (const slug of ["ottaviano", "torino", "milano", "firenze", "roma", "merlata-bloom", "roma-termini"]) {
    assert.match(llms, new RegExp(`/sede/${slug}`));
  }
  assert.match(llms, /gift card come credito/i);
  assert.match(llms, /non sono pubbliche/i);
});

test("orari 24:00 del gestionale restano confrontabili con lo schema 00:00", () => {
  assert.equal(normalizeOpeningHoursText("07:00–24:00"), "07:00-00:00");
  assert.equal(hoursMatchForStructuredData("07:00–24:00", "07:00-00:00"), true);
  assert.equal(hoursMatchForStructuredData("06:30-21:00, martedì chiuso", "06:30-21:00, martedì chiuso"), true);
});

test("breadcrumb e metadata prodotto puntano alla landing categoria della sede", () => {
  const product = toStoreProductView(makeRawProduct());
  const crumbs = buildProductBreadcrumbJsonLd(ottaviano, product).itemListElement;
  assert.equal(crumbs.length, 4);
  assert.match(String(crumbs[2]?.item), /\/sede\/ottaviano\/categorie\/sfogliatelle$/);
  const meta = buildProductMetadata(ottaviano, product);
  assert.equal(meta.robots && typeof meta.robots === "object" && "index" in meta.robots ? meta.robots.index : true, true);
  assert.match(String(meta.alternates?.canonical), /\/sede\/ottaviano\/prodotti\/sfogliatelle$/);
  const categoryMeta = buildStoreCategoryMetadata(ottaviano, { name: "Sfogliatelle", slug: "sfogliatelle" });
  assert.match(String(categoryMeta.alternates?.canonical), /\/sede\/ottaviano\/categorie\/sfogliatelle$/);
});

test("un prodotto non piu vendibile scompare dal carrello, non resta visibile come acquistabile", () => {
  const result = sanitizeCartLines([
    {
      itemId: "draft",
      storeVariantId: "sv-d",
      qty: 1,
      productName: "Bozza",
      live: { available: true, productActive: false, variantActive: true, stockQty: 4, unitCents: 200 }
    },
    {
      itemId: "hidden",
      storeVariantId: "sv-h",
      qty: 1,
      productName: "Nascosto",
      live: { available: false, productActive: true, variantActive: true, stockQty: 4, unitCents: 200 }
    },
    {
      itemId: "ok",
      storeVariantId: "sv-ok",
      qty: 2,
      productName: "Sfogliatelle",
      live: { available: true, productActive: true, variantActive: true, stockQty: 8, unitCents: 250 }
    }
  ]);
  assert.deepEqual(result.kept.map((line) => line.itemId), ["ok"]);
  assert.equal(result.removed.some((item) => item.itemId === "draft" && item.reason === "unavailable"), true);
  assert.equal(result.removed.some((item) => item.itemId === "hidden"), true);
});
