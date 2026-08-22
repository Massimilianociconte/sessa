import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasAdminCapability } from "@/lib/auth/admin-authorization";
import {
  categorySchema,
  discountSchema,
  locationSchema,
  productSchema,
  storeVariantSchema,
  variantSchema
} from "@/lib/validation";

const validProduct = {
  name: "Sfogliatelle",
  slug: "sfogliatelle",
  status: "ACTIVE",
  taxRateBps: 1000
};

test("il gestionale accetta solo stati prodotto noti e slug canonici", () => {
  assert.equal(productSchema.safeParse(validProduct).success, true);
  assert.equal(productSchema.safeParse({ ...validProduct, status: "DRAFT" }).success, true);
  assert.equal(productSchema.safeParse({ ...validProduct, status: "ARCHIVED" }).success, true);
  assert.equal(productSchema.safeParse({ ...validProduct, status: "PUBLISHED" }).success, false);
  assert.equal(productSchema.safeParse({ ...validProduct, slug: "Sfogliatelle" }).success, true);
  assert.equal(productSchema.parse({ ...validProduct, slug: "Sfogliatelle" }).slug, "sfogliatelle");
  assert.equal(productSchema.safeParse({ ...validProduct, slug: "sfo gliatelle" }).success, false);
  assert.equal(productSchema.safeParse({ ...validProduct, taxRateBps: 10001 }).success, false);
  assert.equal(productSchema.safeParse({ ...validProduct, name: "" }).success, false);
});

test("SKU e prezzo variante sono dogane del gestionale, non input liberi", () => {
  const ok = variantSchema.safeParse({ name: "Pz", sku: "sfo-ric", price: "2,50" });
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.sku, "SFO-RIC");
  assert.equal(variantSchema.safeParse({ name: "Pz", sku: "bad sku!", price: "2,50" }).success, false);
  assert.equal(variantSchema.safeParse({ name: "Pz", sku: "OK-1", price: "" }).success, false);
  assert.equal(variantSchema.safeParse({ name: "Pz", sku: "OK-1", price: "2,50", gtin: "123" }).success, false);
  assert.equal(variantSchema.safeParse({ name: "Pz", sku: "OK-1", price: "2,50", gtin: "8001234567890" }).success, true);
});

test("una sede attiva deve offrire ritiro o consegna prima di essere pubblicata", () => {
  const base = {
    name: "Ottaviano",
    slug: "ottaviano",
    city: "Ottaviano",
    address: "Piazza Municipio 27"
  };
  assert.equal(locationSchema.safeParse(base).success, true);
  assert.equal(
    locationSchema.safeParse({ ...base, isActive: true, pickupEnabled: false, deliveryEnabled: false }).success,
    false
  );
  assert.equal(
    locationSchema.safeParse({ ...base, isActive: false, pickupEnabled: false, deliveryEnabled: false }).success,
    true
  );
});

test("categoria, soglia scorte e sconti rifiutano configurazioni incoerenti", () => {
  assert.equal(categorySchema.safeParse({ name: "Box Regalo", slug: "box-regalo" }).success, true);
  assert.equal(categorySchema.safeParse({ name: "Box", slug: "Box Regalo" }).success, false);
  assert.equal(storeVariantSchema.safeParse({ isAvailable: true, lowStockThreshold: 3 }).success, true);
  assert.equal(storeVariantSchema.safeParse({ lowStockThreshold: -1 }).success, false);
  assert.equal(
    discountSchema.safeParse({
      code: "estate",
      type: "PERCENT",
      value: "10",
      startsAt: "2026-08-01",
      endsAt: "2026-07-01"
    }).success,
    false
  );
  const discount = discountSchema.safeParse({ code: "estate-10", type: "FIXED", value: "5,00" });
  assert.equal(discount.success, true);
  if (discount.success) assert.equal(discount.data.code, "ESTATE-10");
});

test("pubblicare catalogo e promozioni richiede le capability giuste", () => {
  assert.equal(hasAdminCapability("MARKETING", "catalog:manage"), true);
  assert.equal(hasAdminCapability("MARKETING", "promotions:manage"), true);
  assert.equal(hasAdminCapability("MARKETING", "orders:refund"), false);
  assert.equal(hasAdminCapability("FULFILLMENT", "catalog:manage"), false);
  assert.equal(hasAdminCapability("FULFILLMENT", "orders:manage"), true);
  assert.equal(hasAdminCapability("STORE_MANAGER", "catalog:manage"), false);
  assert.equal(hasAdminCapability("STORE_MANAGER", "inventory:manage"), true);
  assert.equal(hasAdminCapability("ADMIN", "catalog:manage"), true);
  assert.equal(hasAdminCapability("OWNER", "admins:manage"), true);
});

test("le query vetrina leggono solo prodotti ACTIVE acquistabili nella sede", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/services/catalog.ts"), "utf8");
  assert.match(source, /status:\s*"ACTIVE"/);
  assert.match(source, /isAvailable:\s*true/);
  assert.match(source, /toStoreProductView/);
});
