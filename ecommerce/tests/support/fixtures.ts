import type { GiftCard } from "@prisma/client";
import type { DiscountWithLinks } from "@/lib/services/discounts";
import type { RawProduct } from "@/lib/services/catalog";
import { formatRomeDateTimeLocal } from "@/lib/datetime";

/** Data/ora checkout valida rispetto al wall-clock di Roma (non una data fissa). */
export function futureCheckoutWhen(hoursAhead = 4): string {
  return formatRomeDateTimeLocal(new Date(Date.now() + hoursAhead * 60 * 60_000));
}

export function makeGiftCard(overrides: Partial<GiftCard> = {}): GiftCard {
  return {
    id: "gc-test",
    code: "GIFT-TEST-0001",
    initialCents: 5000,
    balanceCents: 5000,
    currency: "EUR",
    isActive: true,
    expiresAt: null,
    customerId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

export function makeDiscount(overrides: Partial<DiscountWithLinks> = {}): DiscountWithLinks {
  return {
    id: "disc-test",
    code: "BENVENUTO10",
    description: "Sconto di prova",
    type: "PERCENT",
    value: 1000,
    scope: "ALL",
    minSubtotalCents: null,
    maxUses: null,
    perUserLimit: null,
    usedCount: 0,
    firstOrderOnly: false,
    stackable: false,
    customerId: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    locations: [],
    categories: [],
    products: [],
    redemptions: [],
    carts: [],
    orders: [],
    customer: null,
    ...overrides
  } as DiscountWithLinks;
}

export function makeRawProduct(overrides: Partial<RawProduct> = {}): RawProduct {
  return {
    id: "prod-sfogliatelle",
    name: "Sfogliatelle",
    slug: "sfogliatelle",
    description: "Classico napoletano",
    shortDescription: "Riccia e frolla",
    image: "/images/products/product-sfogliatelle.webp",
    images: [{ url: "/images/products/product-sfogliatelle.webp" }, { url: "/images/gallery/sfo-2.webp" }],
    tags: "classici, colazioni",
    featured: true,
    taxRateBps: 1000,
    allergens: "glutine",
    ingredients: "semola, ricotta",
    category: { name: "Sfogliatelle", slug: "sfogliatelle" },
    variants: [
      {
        id: "var-1",
        name: "Pz",
        sku: "SFO-RIC",
        basePriceCents: 250,
        compareAtCents: 300,
        position: 0,
        storeVariants: [
          {
            id: "sv-1",
            priceCentsOverride: null,
            compareAtCents: null,
            stockQty: 12,
            lowStockThreshold: 5
          }
        ]
      }
    ],
    ...overrides
  };
}

export function checkoutPickupInput(overrides: Record<string, unknown> = {}) {
  return {
    email: "cliente@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "333 123 4567",
    fulfillmentType: "PICKUP" as const,
    slot: futureCheckoutWhen(),
    paymentMethod: "card" as const,
    acceptTerms: "on",
    ...overrides
  };
}
