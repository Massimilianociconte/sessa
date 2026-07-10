/**
 * Seed multi-sede con dati reali Sessa 1930.
 * Idempotente: upsert su slug/sku/code. Ricreabile con `npm run db:reset`.
 *
 * Prezzo e stock vivono su StoreVariant (per sede). ProductVariant tiene il
 * prezzo base; ogni sede pubblica il proprio assortimento.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

function getSeedPassword(envKey: string, fallback: string): string {
  return process.env[envKey] ?? fallback;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

// --- Sedi ufficiali Sessa 1930 (dal sito e da Mercato Centrale) ---
const locations = [
  { name: "Ottaviano", slug: "ottaviano", city: "Ottaviano (NA)", address: "Piazza Municipio, 27", province: "NA", postalCode: "80044", hours: "06:30–21:00, martedì chiuso", pickupEnabled: true, deliveryEnabled: true, position: 0 },
  { name: "Mercato Centrale Torino", slug: "torino", city: "Torino", address: "Piazza della Repubblica, 25", province: "TO", postalCode: "10152", hours: "07:00–24:00", pickupEnabled: true, deliveryEnabled: true, position: 1 },
  { name: "Mercato Centrale Milano", slug: "milano", city: "Milano", address: "Via Giovanni Battista Sammartini, 2", province: "MI", postalCode: "20125", hours: "07:00–24:00", pickupEnabled: true, deliveryEnabled: true, position: 2 },
  { name: "Mercato Centrale Firenze", slug: "firenze", city: "Firenze", address: "Via dell'Ariento", province: "FI", postalCode: "50123", hours: "07:00–24:00", pickupEnabled: true, deliveryEnabled: true, position: 3 },
  { name: "Mercato Centrale Roma", slug: "roma", city: "Roma", address: "Via Giovanni Giolitti, 36", province: "RM", postalCode: "00185", hours: "07:00–24:00", pickupEnabled: true, deliveryEnabled: true, position: 4 },
  { name: "Merlata Bloom", slug: "merlata-bloom", city: "Milano", address: "Via Gottlieb Wilhelm Daimler, C2", province: "MI", postalCode: "20151", hours: "09:00–22:00", pickupEnabled: true, deliveryEnabled: true, position: 5 },
  { name: "Stazione Roma Termini", slug: "roma-termini", city: "Roma", address: "Via Giovanni Giolitti, 40", province: "RM", postalCode: "00185", hours: "06:00–23:00", pickupEnabled: true, deliveryEnabled: false, position: 6 }
] as const;

const categories = [
  { name: "Colazioni", slug: "colazioni", accent: "terracotta", image: "/images/products/category-colazioni.webp", position: 0, description: "Cornetti, graffe e lievitati del mattino." },
  { name: "Sfogliatelle", slug: "sfogliatelle", accent: "blue", image: "/images/products/category-sfogliatelle.webp", position: 1, description: "Ricce e frolle, il simbolo napoletano." },
  { name: "Box Regalo", slug: "box-regalo", accent: "green", image: "/images/products/category-box-regalo.webp", position: 2, description: "Grandi lievitati e specialità confezionate." },
  { name: "Pasticceria Tradizionale", slug: "pasticceria-tradizionale", accent: "terracotta", image: "/images/products/category-pasticceria-tradizionale.webp", position: 3, description: "Babà, caprese, delizia al limone." }
] as const;

type VariantSeed = { name: string; sku: string; basePriceCents: number; stock: number };
type ProductSeed = {
  name: string; slug: string; categorySlug: string; description: string; shortDescription: string;
  image: string; tags: string; status: "ACTIVE" | "DRAFT"; featured: boolean; position: number;
  variants: VariantSeed[];
  // sedi in cui è disponibile (slug); assente = tutte
  onlyLocations?: string[];
};

const products: ProductSeed[] = [
  {
    name: "Colomba Artigianale 1Kg", slug: "colomba-artigianale-1kg", categorySlug: "box-regalo",
    description: "Colomba artigianale a lievitazione naturale, sei varianti dalla classica al pistacchio.",
    shortDescription: "Lievitato pasquale artigianale in sei varianti.", image: "/images/products/shop-colomba.webp",
    tags: "lievitati,pasqua,regalo", status: "ACTIVE", featured: true, position: 0,
    variants: [
      { name: "Classica", sku: "COL-1KG-CLA", basePriceCents: 3500, stock: 24 },
      { name: "Albicocca del Vesuvio", sku: "COL-1KG-ALB", basePriceCents: 3500, stock: 18 },
      { name: "Doppio Cioccolato", sku: "COL-1KG-DCI", basePriceCents: 3600, stock: 16 },
      { name: "Limone e Cioccolato Bianco", sku: "COL-1KG-LCB", basePriceCents: 3600, stock: 14 },
      { name: "Frutti di bosco e Cioccolato Bianco", sku: "COL-1KG-FCB", basePriceCents: 3600, stock: 12 },
      { name: "Pistacchio", sku: "COL-1KG-PIS", basePriceCents: 3800, stock: 20 }
    ]
  },
  {
    name: "Panettone Sessa da 1 Kg", slug: "panettone-sessa-1kg", categorySlug: "box-regalo",
    description: "Il Panettone Sessa da 1 Kg: lievitazione lenta, canditi selezionati, sette varianti.",
    shortDescription: "Il grande lievitato delle feste in sette varianti.", image: "/images/products/shop-panettone-box.webp",
    tags: "lievitati,natale,regalo", status: "ACTIVE", featured: true, position: 1,
    variants: [
      { name: "Classico", sku: "PAN-1KG-CLA", basePriceCents: 3400, stock: 30 },
      { name: "Limone", sku: "PAN-1KG-LIM", basePriceCents: 3500, stock: 20 },
      { name: "Pistacchio", sku: "PAN-1KG-PIS", basePriceCents: 3800, stock: 22 },
      { name: "Cioccolato Fondente", sku: "PAN-1KG-CIO", basePriceCents: 3600, stock: 18 },
      { name: "Albicocca del Vesuvio", sku: "PAN-1KG-ALB", basePriceCents: 3500, stock: 15 },
      { name: "Agrumi", sku: "PAN-1KG-AGR", basePriceCents: 3500, stock: 15 },
      { name: "Frutti di bosco e cioccolato bianco", sku: "PAN-1KG-FCB", basePriceCents: 3700, stock: 12 }
    ]
  },
  {
    name: "Panettone Sessa da 500 gr", slug: "panettone-sessa-500gr", categorySlug: "box-regalo",
    description: "Formato da 500 gr del Panettone Sessa. Varianti classico, limone e pistacchio.",
    shortDescription: "Formato piccolo del panettone artigianale.", image: "/images/products/shop-panettone.webp",
    tags: "lievitati,natale", status: "ACTIVE", featured: false, position: 2,
    variants: [
      { name: "Classico", sku: "PAN-500-CLA", basePriceCents: 2700, stock: 25 },
      { name: "Limone", sku: "PAN-500-LIM", basePriceCents: 2800, stock: 18 },
      { name: "Pistacchio", sku: "PAN-500-PIS", basePriceCents: 3000, stock: 20 }
    ]
  },
  {
    name: "Sfogliatelle", slug: "sfogliatelle", categorySlug: "sfogliatelle",
    description: "La sfogliatella Sessa, riccia o frolla, preparata ogni giorno. Box da 6 pezzi.",
    shortDescription: "Ricce e frolle, box da 6.", image: "/images/products/product-sfogliatelle.webp",
    tags: "sfogliatelle,classici,box", status: "ACTIVE", featured: true, position: 3,
    variants: [
      { name: "Ricce (box 6 pezzi)", sku: "SFO-RIC-6", basePriceCents: 1800, stock: 40 },
      { name: "Frolle (box 6 pezzi)", sku: "SFO-FRO-6", basePriceCents: 1800, stock: 40 },
      { name: "Miste (box 6 pezzi)", sku: "SFO-MIX-6", basePriceCents: 1800, stock: 30 }
    ]
  },
  {
    name: "Babà", slug: "babba", categorySlug: "pasticceria-tradizionale",
    description: "Il babà napoletano di Sessa: impasto soffice, bagna al rum equilibrata.",
    shortDescription: "Il classico napoletano, anche in vaso.", image: "/images/products/product-babba.webp",
    tags: "baba,babà,classici,rum", status: "ACTIVE", featured: false, position: 4,
    variants: [
      { name: "In vaso 350g", sku: "BAB-VAS-350", basePriceCents: 1400, stock: 35 },
      { name: "Classico (box 4 pezzi)", sku: "BAB-BOX-4", basePriceCents: 1600, stock: 20 }
    ]
  },
  {
    name: "Caprese", slug: "caprese", categorySlug: "pasticceria-tradizionale",
    description: "Torta caprese al cioccolato e mandorle, ricetta della tradizione campana.",
    shortDescription: "Cioccolato e mandorle, tradizione campana.", image: "/images/products/product-caprese.webp",
    tags: "caprese,cioccolato,classici", status: "ACTIVE", featured: false, position: 5,
    variants: [
      { name: "Classica 500g", sku: "CAP-CLA-500", basePriceCents: 2200, stock: 15 },
      { name: "Al limone 500g", sku: "CAP-LIM-500", basePriceCents: 2200, stock: 12 }
    ]
  },
  {
    name: "Delizia al limone", slug: "delizia-al-limone", categorySlug: "pasticceria-tradizionale",
    description: "La delizia al limone della costiera: pan di Spagna, crema al limone, glassa. Solo Ottaviano.",
    shortDescription: "Fresca di crema al limone — esclusiva Ottaviano.", image: "/images/products/product-delizia-limone.webp",
    tags: "delizia,limone,fresco", status: "ACTIVE", featured: false, position: 6,
    onlyLocations: ["ottaviano"],
    variants: [{ name: "Box 4 pezzi", sku: "DEL-BOX-4", basePriceCents: 1800, stock: 10 }]
  }
];

// Allergeni/ingredienti per slug (obbligo per alimenti).
const productExtra: Record<string, { allergens: string; ingredients: string }> = {
  "colomba-artigianale-1kg": { allergens: "Glutine, uova, latte, frutta a guscio", ingredients: "Farina di grano tenero, uova, burro, zucchero, canditi, lievito madre" },
  "panettone-sessa-1kg": { allergens: "Glutine, uova, latte, frutta a guscio", ingredients: "Farina, uova, burro, zucchero, uvetta, canditi, lievito madre" },
  "panettone-sessa-500gr": { allergens: "Glutine, uova, latte", ingredients: "Farina, uova, burro, zucchero, lievito madre" },
  sfogliatelle: { allergens: "Glutine, uova, latte", ingredients: "Semola, ricotta, uova, canditi, cannella, zucchero" },
  babba: { allergens: "Glutine, uova, latte", ingredients: "Farina, uova, burro, zucchero, rum, lievito" },
  caprese: { allergens: "Uova, latte, frutta a guscio (mandorle)", ingredients: "Mandorle, cioccolato, uova, burro, zucchero" },
  "delizia-al-limone": { allergens: "Glutine, uova, latte", ingredients: "Pan di Spagna, crema al limone, panna, limoni di costiera" }
};

async function main() {
  console.log("Seeding piattaforma multi-sede Sessa 1930…");
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && process.env.ALLOW_PRODUCTION_CATALOG_SEED !== "1") {
    throw new Error(
      "Seed produzione bloccato. Usa ALLOW_PRODUCTION_CATALOG_SEED=1 solo per catalogo/impostazioni; le fixture demo restano escluse."
    );
  }
  const includeDemoFixtures = !isProduction && process.env.SEED_DEMO_FIXTURES !== "0";
  const adminPassword = includeDemoFixtures
    ? getSeedPassword("SEED_ADMIN_PASSWORD", "sessa1930!admin")
    : null;
  const customerPassword = includeDemoFixtures
    ? getSeedPassword("SEED_CUSTOMER_PASSWORD", "cliente1930!")
    : null;

  // Sedi
  const locationIds = new Map<string, string>();
  for (const l of locations) {
    const row = await prisma.location.upsert({
      where: { slug: l.slug },
      update: { name: l.name, city: l.city, address: l.address, province: l.province, postalCode: l.postalCode, hours: l.hours, pickupEnabled: l.pickupEnabled, deliveryEnabled: l.deliveryEnabled, isActive: (l as { isActive?: boolean }).isActive ?? true, position: l.position },
      create: { name: l.name, slug: l.slug, city: l.city, address: l.address, province: l.province, postalCode: l.postalCode, hours: l.hours, pickupEnabled: l.pickupEnabled, deliveryEnabled: l.deliveryEnabled, isActive: (l as { isActive?: boolean }).isActive ?? true, position: l.position }
    });
    locationIds.set(l.slug, row.id);
  }

  // Categorie
  const categoryIds = new Map<string, string>();
  for (const c of categories) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, accent: c.accent, image: c.image, position: c.position, description: c.description },
      create: { ...c }
    });
    categoryIds.set(c.slug, row.id);
  }

  // Prodotti + varianti + assortimento per sede (StoreVariant)
  const activeLocationSlugs = locations.filter((l) => (l as { isActive?: boolean }).isActive ?? true).map((l) => l.slug);
  for (const p of products) {
    const { variants, categorySlug, onlyLocations, ...data } = p;
    const extra = productExtra[p.slug] ?? { allergens: "", ingredients: "" };
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { ...data, ...extra, categoryId: categoryIds.get(categorySlug) },
      create: { ...data, ...extra, categoryId: categoryIds.get(categorySlug) }
    });

    const sellIn = onlyLocations ?? activeLocationSlugs;
    for (const [i, v] of variants.entries()) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: { name: v.name, basePriceCents: v.basePriceCents, position: i },
        create: { productId: product.id, name: v.name, sku: v.sku, basePriceCents: v.basePriceCents, position: i }
      });

      for (const slug of sellIn) {
        const locationId = locationIds.get(slug)!;
        const existing = await prisma.storeVariant.findUnique({
          where: { locationId_variantId: { locationId, variantId: variant.id } }
        });
        if (existing) continue;

        // Differenziazioni dimostrative:
        // - Roma Termini: +10% sui grandi lievitati (contesto stazione)
        // - Sfogliatelle esaurite a Firenze (stock 0)
        const isTermini = slug === "roma-termini";
        const bigLievitato = p.categorySlug === "box-regalo";
        const priceOverride = isTermini && bigLievitato ? Math.round(v.basePriceCents * 1.1) : null;
        const stock = slug === "firenze" && p.slug === "sfogliatelle" ? 0 : slug === "ottaviano" ? v.stock : Math.ceil(v.stock * 0.6);

        const sv = await prisma.storeVariant.create({
          data: { locationId, variantId: variant.id, priceCentsOverride: priceOverride, stockQty: stock, isAvailable: true, position: i }
        });
        if (stock > 0) {
          await prisma.stockMovement.create({
            data: { storeVariantId: sv.id, delta: stock, reason: "INITIAL", note: "Carico iniziale da seed", actor: "system" }
          });
        }
      }
    }
  }

  // Zona e tariffe di spedizione (per la modalità consegna)
  const italia = await prisma.shippingZone.findFirst({ where: { countries: "IT" } });
  const zone = italia ?? (await prisma.shippingZone.create({ data: { name: "Italia", countries: "IT", position: 0 } }));
  if ((await prisma.shippingRate.count({ where: { zoneId: zone.id } })) === 0) {
    await prisma.shippingRate.createMany({
      data: [
        { zoneId: zone.id, name: "Standard 48/72h", amountCents: 990, freeAboveCents: 6900, position: 0 },
        { zoneId: zone.id, name: "Espresso 24h", amountCents: 1490, position: 1 }
      ]
    });
  }

  // Sconti granulari d'esempio
  const babba = await prisma.product.findUnique({ where: { slug: "babba" } });
  const boxRegalo = categoryIds.get("box-regalo")!;
  const merlata = locationIds.get("merlata-bloom")!;

  // BENVENUTO10 — 10% ovunque, min 20€, 1 volta per cliente
  await prisma.discountCode.upsert({
    where: { code: "BENVENUTO10" },
    update: {},
    create: { code: "BENVENUTO10", description: "10% sul primo ordine", type: "PERCENT", value: 1000, scope: "ALL", minSubtotalCents: 2000, perUserLimit: 1 }
  });
  // CINQUEEURO — 5€ su ordini > 30€
  await prisma.discountCode.upsert({
    where: { code: "CINQUEEURO" },
    update: {},
    create: { code: "CINQUEEURO", description: "5€ su ordini oltre 30€", type: "FIXED", value: 500, scope: "ALL", minSubtotalCents: 3000 }
  });
  // BABAMERLATA15 — 15% sui babà della sede Merlata Bloom
  if (babba) {
    const d = await prisma.discountCode.upsert({
      where: { code: "BABAMERLATA15" },
      update: {},
      create: { code: "BABAMERLATA15", description: "15% sui babà — solo Merlata Bloom", type: "PERCENT", value: 1500, scope: "PRODUCTS" }
    });
    await prisma.discountLocation.upsert({ where: { discountId_locationId: { discountId: d.id, locationId: merlata } }, update: {}, create: { discountId: d.id, locationId: merlata } });
    await prisma.discountProduct.upsert({ where: { discountId_productId: { discountId: d.id, productId: babba.id } }, update: {}, create: { discountId: d.id, productId: babba.id } });
  }
  // BOXREGALO20 — 20% sulla categoria Box Regalo
  const dc = await prisma.discountCode.upsert({
    where: { code: "BOXREGALO20" },
    update: {},
    create: { code: "BOXREGALO20", description: "20% sulla categoria Box Regalo", type: "PERCENT", value: 2000, scope: "CATEGORIES" }
  });
  await prisma.discountCategory.upsert({ where: { discountId_categoryId: { discountId: dc.id, categoryId: boxRegalo } }, update: {}, create: { discountId: dc.id, categoryId: boxRegalo } });

  if (includeDemoFixtures && adminPassword && customerPassword) {
    // Fixture locali: mai create quando NODE_ENV=production.
    await prisma.adminUser.upsert({
      where: { email: "admin@sessa1930.com" },
      update: {},
      create: { email: "admin@sessa1930.com", name: "Amministratore", passwordHash: hashPassword(adminPassword), role: "OWNER" }
    });

    await prisma.customer.upsert({
      where: { email: "cliente@demo.it" },
      update: {},
      create: {
        email: "cliente@demo.it",
        firstName: "Mario",
        lastName: "Cliente",
        phone: "081 000 0000",
        passwordHash: hashPassword(customerPassword),
        referralCode: "MARIO-DEMO01",
        marketingOptIn: true
      }
    });
  }

  // Impostazioni
  const settings: Record<string, unknown> = {
    "store.name": "Sessa 1930",
    "store.email": "info@sessa1930.com",
    "store.phone": "+39 081 827 8077",
    "store.address": "Piazza Municipio, 27, 80044 Ottaviano (NA)",
    "store.vat": "P.iva 11751160968",
    "store.currency": "EUR",
    "payments.provider": "manual",
    "payments.manualMethods": ["bank_transfer", "cash_on_pickup"],
    "payments.bankTransferInstructions": "Bonifico intestato a Sessa 1930 — IBAN da configurare nelle impostazioni. L'ordine viene preparato alla ricezione del pagamento.",
    // Referral: sconto all'amico e ricompensa a chi invita
    "referral.friendType": "PERCENT",
    "referral.friendValue": 1000,
    "referral.referrerType": "FIXED",
    "referral.referrerValue": 500,
    "referral.minSubtotalCents": 2000
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value: JSON.stringify(value) } });
  }

  if (includeDemoFixtures) {
    const demoGift = await prisma.giftCard.findUnique({ where: { code: "GIFT-DEMO-2025" } });
    if (!demoGift) {
      const card = await prisma.giftCard.create({
        data: { code: "GIFT-DEMO-2025", initialCents: 5000, balanceCents: 5000 }
      });
      await prisma.giftCardTransaction.create({
        data: { giftCardId: card.id, delta: 5000, reason: "ISSUE" }
      });
    }
  }

  console.log(`Seed completato: ${activeLocationSlugs.length} sedi attive, ${products.length} prodotti.`);
  if (includeDemoFixtures) {
    console.log("Fixture locali create: admin, cliente demo e gift card demo.");
  } else {
    console.log("Fixture demo escluse.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
