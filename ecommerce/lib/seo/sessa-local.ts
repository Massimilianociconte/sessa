import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import type { StoreProductView } from "@/lib/services/catalog";

type LocationLike = {
  id?: string;
  name: string;
  slug: string;
  city: string;
  address: string;
  province: string;
  postalCode: string;
  phone?: string | null;
  hours?: string | null;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string | null;
  gbpUrl?: string | null;
  updatedAt?: Date;
};

type LocalFaq = {
  question: string;
  answer: string;
};

type CategoryLike = {
  name: string;
  slug: string;
  description?: string | null;
};

type OpeningHoursSpecification = {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
};

type OfficialLocationProfile = {
  publicName?: string;
  cityName: string;
  province: string;
  address?: string;
  postalCode?: string;
  hours?: string;
  openingHoursSchema?: string[];
  openingHoursSpecification?: OpeningHoursSpecification[];
  geoArea: string;
  keywordCity: string;
  localIntent: string;
  signatureProducts: string[];
  sourceNote: string;
  sourceUrl: string;
};

const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const OTTAVIANO_OPEN_DAYS = ["Monday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function normalizeOpeningHoursText(value: string): string {
  return value.replaceAll("–", "-").replaceAll("24:00", "00:00").trim();
}

export function hoursMatchForStructuredData(operationalHours: string, profileHours?: string): boolean {
  if (!profileHours) return false;
  return normalizeOpeningHoursText(operationalHours) === normalizeOpeningHoursText(profileHours);
}

function openingHoursSpec(dayOfWeek: string[], opens: string, closes: string): OpeningHoursSpecification[] {
  return [{ "@type": "OpeningHoursSpecification", dayOfWeek, opens, closes }];
}

const OFFICIAL_LOCATION_PROFILES: Record<string, OfficialLocationProfile> = {
  ottaviano: {
    publicName: "Sessa 1930 Ottaviano",
    cityName: "Ottaviano",
    province: "NA",
    address: "Piazza Municipio, 27",
    postalCode: "80044",
    hours: "06:30-21:00, martedì chiuso",
    openingHoursSchema: ["Mo,We,Th,Fr,Sa,Su 06:30-21:00"],
    openingHoursSpecification: openingHoursSpec(OTTAVIANO_OPEN_DAYS, "06:30", "21:00"),
    geoArea: "Ottaviano, Vesuvio e provincia di Napoli",
    keywordCity: "Ottaviano",
    localIntent: "pasticceria artigianale napoletana a Ottaviano",
    signatureProducts: ["sfogliatelle", "babà", "pastiera", "caprese", "delizia al limone", "box regalo"],
    sourceNote: "Sede storica ufficiale Sessa 1930 in Piazza Municipio, con storia familiare iniziata nel 1930.",
    sourceUrl: "https://sessa1930.com/chi-siamo/"
  },
  torino: {
    publicName: "Sessa 1930 Mercato Centrale Torino",
    cityName: "Torino",
    province: "TO",
    address: "Mercato Centrale - Piazza della Repubblica, 25",
    postalCode: "10152",
    hours: "07:00-00:00",
    openingHoursSchema: ["Mo-Su 07:00-00:00"],
    openingHoursSpecification: openingHoursSpec(ALL_DAYS, "07:00", "00:00"),
    geoArea: "Torino e Porta Palazzo",
    keywordCity: "Torino",
    localIntent: "sfogliatelle napoletane e pasticceria Sessa a Torino",
    signatureProducts: ["sfogliatelle", "graffe", "pastiere", "babà", "caprese", "pasticciotti", "cannoli", "rosticceria napoletana"],
    sourceNote: "Pagina Mercato Centrale Torino dedicata alla sfogliatella napoletana di Sabato Sessa.",
    sourceUrl: "https://www.mercatocentrale.com/turin/artisans/sfogliatella-napoletana-sabato-sessa/"
  },
  milano: {
    publicName: "Sessa 1930 Mercato Centrale Milano",
    cityName: "Milano",
    province: "MI",
    address: "Mercato Centrale - Via Giovanni Battista Sammartini, 2",
    postalCode: "20125",
    hours: "07:00-00:00",
    openingHoursSchema: ["Mo-Su 07:00-00:00"],
    openingHoursSpecification: openingHoursSpec(ALL_DAYS, "07:00", "00:00"),
    geoArea: "Milano Centrale",
    keywordCity: "Milano Centrale",
    localIntent: "pasticceria napoletana Sessa a Milano Centrale",
    signatureProducts: ["sfogliatelle", "pasticceria napoletana", "grandi lievitati", "box regalo"],
    sourceNote: "Sessa 1930 è presente al Mercato Centrale Milano con la sfogliatella napoletana di Sabato Sessa.",
    sourceUrl: "https://www.mercatocentrale.com/milan/artisans/sabato-sessas-neapolitan-sfogliatella/"
  },
  firenze: {
    publicName: "Sessa 1930 Mercato Centrale Firenze",
    cityName: "Firenze",
    province: "FI",
    address: "Mercato Centrale - Via dell'Ariento",
    postalCode: "50123",
    hours: "07:00-00:00",
    openingHoursSchema: ["Mo-Su 07:00-00:00"],
    openingHoursSpecification: openingHoursSpec(ALL_DAYS, "07:00", "00:00"),
    geoArea: "Firenze San Lorenzo",
    keywordCity: "Firenze",
    localIntent: "sfogliatelle napoletane Sessa a Firenze",
    signatureProducts: ["sfogliatelle", "graffe", "pasticceria tradizionale", "dolci napoletani"],
    sourceNote: "Il sito Sessa indica la sede Firenze presso il Mercato Centrale, Via dell'Ariento.",
    sourceUrl: "https://sessa1930.com/"
  },
  roma: {
    publicName: "Sessa 1930 Mercato Centrale Roma",
    cityName: "Roma",
    province: "RM",
    address: "Mercato Centrale - Via Giovanni Giolitti, 36",
    postalCode: "00185",
    hours: "07:00-00:00",
    openingHoursSchema: ["Mo-Su 07:00-00:00"],
    openingHoursSpecification: openingHoursSpec(ALL_DAYS, "07:00", "00:00"),
    geoArea: "Roma Termini e Mercato Centrale Roma",
    keywordCity: "Mercato Centrale Roma",
    localIntent: "sfogliatelle napoletane Sessa a Roma Termini",
    signatureProducts: ["sfogliatelle", "babà", "pastiera", "cornetti", "ciambelle", "panzerotti"],
    sourceNote: "Pagina Mercato Centrale Roma dedicata alla sfogliatella napoletana di Sabato Sessa.",
    sourceUrl: "https://www.mercatocentrale.it/roma/artigiani/la-sfogliatella-napoletana-di-sabato-sessa/"
  },
  "merlata-bloom": {
    publicName: "Sessa 1930 Merlata Bloom Milano",
    cityName: "Milano",
    province: "MI",
    address: "Via Gottlieb Wilhelm Daimler, 0 C2",
    postalCode: "20151",
    hours: "09:00-23:00",
    openingHoursSchema: ["Mo-Su 09:00-23:00"],
    openingHoursSpecification: openingHoursSpec(ALL_DAYS, "09:00", "23:00"),
    geoArea: "Merlata Bloom, Milano",
    keywordCity: "Merlata Bloom Milano",
    localIntent: "pasticceria Sessa 1930 a Merlata Bloom Milano",
    signatureProducts: ["sfogliatelle", "pasticceria napoletana", "colazioni", "box regalo"],
    sourceNote: "Sessa 1930 è presente nell'offerta food del centro Merlata Bloom Milano.",
    sourceUrl: "https://www.merlatabloommilano.com/la-nostra-offerta/food/sessa-1930/"
  },
  "roma-termini": {
    publicName: "Sessa 1930 Stazione Roma Termini",
    cityName: "Roma",
    province: "RM",
    address: "Via Giovanni Giolitti, 40",
    postalCode: "00185",
    hours: "06:00-23:00",
    openingHoursSchema: ["Mo-Su 06:00-23:00"],
    openingHoursSpecification: openingHoursSpec(ALL_DAYS, "06:00", "23:00"),
    geoArea: "Stazione Roma Termini",
    keywordCity: "Roma Termini",
    localIntent: "pasticceria Sessa 1930 alla Stazione Roma Termini",
    signatureProducts: ["caffè gourmet", "cornetti", "sfogliatelle", "cheesecake", "pasticceria napoletana"],
    sourceNote: "Il sito Sessa indica la sede Stazione Roma Termini in Via Giovanni Giolitti, 40.",
    sourceUrl: "https://sessa1930.com/"
  }
};

const BRAND_DESCRIPTION =
  "Sessa 1930 è una pasticceria artigianale partenopea nata a Ottaviano, legata a tradizione napoletana, materie prime selezionate e specialità come sfogliatelle, babà, pastiera, caprese e grandi lievitati.";

function profileFor(location: LocationLike): OfficialLocationProfile {
  return (
    OFFICIAL_LOCATION_PROFILES[location.slug] ?? {
      cityName: location.city.replace(/\s*\(.+?\)/g, ""),
      province: location.province,
      address: location.address,
      postalCode: location.postalCode,
      hours: location.hours ?? undefined,
      geoArea: location.city,
      keywordCity: location.city,
      localIntent: `pasticceria Sessa 1930 a ${location.city}`,
      signatureProducts: ["sfogliatelle", "pasticceria napoletana", "box regalo"],
      sourceNote: "Sede Sessa 1930 attiva nello shop ecommerce.",
      sourceUrl: "https://sessa1930.com/"
    }
  );
}

export function getStoreSeo(location: LocationLike) {
  const profile = profileFor(location);
  const name = profile.publicName ?? `Sessa 1930 ${location.name}`;
  const cityName = profile.cityName;
  // Il gestionale e la fonte operativa: i profili editoriali arricchiscono i
  // contenuti, ma non devono rendere obsoleti indirizzo, CAP o orari aggiornati.
  const address = location.address.trim() || profile.address || "";
  const postalCode = location.postalCode.trim() || profile.postalCode || "";
  const province = location.province.trim() || profile.province || "";
  const hours = location.hours?.trim() || profile.hours || "";
  const profileHoursStillCurrent = hoursMatchForStructuredData(hours, profile.hours);
  const canonicalUrl = `${SITE_URL}/sede/${location.slug}`;
  const title = `${name} - Shop online ${cityName}`;
  const description =
    `Ordina online da ${name}: ${profile.signatureProducts.slice(0, 4).join(", ")} e specialità napoletane. ` +
    `${address}, ${cityName}. Ritiro${location.deliveryEnabled ? " e consegna" : ""}.`;
  const h1 = `${name}: ecommerce della sede di ${cityName}`;
  const directAnswer =
    `${name} è la pagina ecommerce locale di Sessa 1930 per ${profile.geoArea}. Qui puoi ordinare online ` +
    `${profile.signatureProducts.slice(0, 4).join(", ")} e prodotti della pasticceria napoletana, con disponibilità e stock collegati alla sede.`;
  const narrative =
    `${BRAND_DESCRIPTION} La sede ${name} porta questa identità a ${profile.geoArea}, con un catalogo online pensato per ritiro` +
    `${location.deliveryEnabled ? " e consegna" : ""} dalla sede selezionata.`;
  const faq: LocalFaq[] = [
    {
      question: `Dove si trova ${name}?`,
      answer: `${name} si trova in ${address}${postalCode ? `, ${postalCode}` : ""} ${cityName}${province ? ` (${province})` : ""}.`
    },
    {
      question: `Cosa posso ordinare online da ${name}?`,
      answer: `Puoi ordinare prodotti Sessa come ${profile.signatureProducts.slice(0, 5).join(", ")} e altre specialità disponibili nel catalogo della sede.`
    },
    {
      question: `Il catalogo online cambia in base alla sede?`,
      answer:
        "Sì. Prezzi, disponibilità, prodotti attivi e stock sono collegati alla sede selezionata, così il carrello resta coerente con il punto vendita scelto."
    }
  ];

  return {
    ...profile,
    name,
    cityName,
    address,
    postalCode,
    province,
    hours,
    openingHoursSchema: profileHoursStillCurrent ? profile.openingHoursSchema : undefined,
    openingHoursSpecification: profileHoursStillCurrent ? profile.openingHoursSpecification : undefined,
    canonicalUrl,
    title,
    description,
    h1,
    directAnswer,
    narrative,
    faq,
    keywords: [
      profile.localIntent,
      `Sessa 1930 ${profile.keywordCity}`,
      `pasticceria napoletana ${profile.keywordCity}`,
      `sfogliatelle ${profile.keywordCity}`,
      `dolci napoletani ${profile.keywordCity}`,
      `box regalo Sessa ${profile.keywordCity}`
    ]
  };
}

export function buildStoreMetadata(location: LocationLike): Metadata {
  const seo = getStoreSeo(location);
  return {
    title: { absolute: seo.title },
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: seo.canonicalUrl },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      title: seo.title,
      description: seo.description,
      url: seo.canonicalUrl,
      siteName: "Sessa 1930",
      locale: "it_IT",
      images: [{ url: "/brand/sessa-logo-white.webp", alt: "Sessa 1930" }]
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description
    }
  };
}

export function buildStoreCategoryMetadata(location: LocationLike, category: CategoryLike): Metadata {
  const seo = getStoreSeo(location);
  const canonicalUrl = `${seo.canonicalUrl}/categorie/${category.slug}`;
  const title = `${category.name} a ${seo.keywordCity} - ${seo.name}`;
  const description =
    `${category.name} disponibili nello shop locale ${seo.name}. ` +
    `${category.description ?? "Specialità artigianali Sessa 1930"} con stock collegato alla sede, ` +
    `ritiro${location.deliveryEnabled ? " e consegna" : ""}.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    keywords: [
      `${category.name} ${seo.keywordCity}`,
      `${category.name} Sessa 1930`,
      `pasticceria ${seo.keywordCity}`,
      `dolci napoletani ${seo.keywordCity}`
    ],
    openGraph: {
      type: "website",
      title,
      description,
      url: canonicalUrl,
      siteName: "Sessa 1930",
      locale: "it_IT",
      images: [{ url: "/brand/sessa-logo-white.webp", alt: `${category.name} - Sessa 1930` }]
    },
    twitter: { card: "summary_large_image", title, description }
  };
}

export function buildStoreJsonLd(location: LocationLike, products: StoreProductView[]) {
  const seo = getStoreSeo(location);
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "Bakery",
    "@id": `${seo.canonicalUrl}#localbusiness`,
    name: seo.name,
    url: seo.canonicalUrl,
    image: `${SITE_URL}/brand/sessa-logo-white.webp`,
    description: seo.description,
    telephone: location.phone ?? undefined,
    priceRange: "€€",
    servesCuisine: ["Pasticceria napoletana", "Dolci artigianali", "Colazioni"],
    address: {
      "@type": "PostalAddress",
      streetAddress: seo.address,
      addressLocality: seo.cityName,
      addressRegion: seo.province,
      postalCode: seo.postalCode,
      addressCountry: "IT"
    },
    openingHours: seo.openingHoursSchema ?? (seo.hours || undefined),
    openingHoursSpecification: seo.openingHoursSpecification,
    areaServed: {
      "@type": "AdministrativeArea",
      name: seo.geoArea
    },
    geo:
      location.latitude != null && location.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: location.latitude,
            longitude: location.longitude
          }
        : undefined,
    hasMap: location.googleMapsUrl || undefined,
    parentOrganization: {
      "@type": "Organization",
      name: "Sessa 1930",
      url: "https://sessa1930.com/"
    },
    sameAs: [location.gbpUrl, "https://sessa1930.com/"].filter(Boolean),
    subjectOf:
      seo.sourceUrl !== "https://sessa1930.com/"
        ? { "@type": "WebPage", url: seo.sourceUrl, name: seo.sourceNote }
        : undefined
  };

  const webpage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${seo.canonicalUrl}#webpage`,
    url: seo.canonicalUrl,
    name: seo.title,
    description: seo.description,
    isPartOf: { "@type": "WebSite", name: "Sessa 1930 Shop", url: SITE_URL },
    about: { "@id": `${seo.canonicalUrl}#localbusiness` }
  };

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Catalogo ecommerce ${seo.name}`,
    itemListElement: products.slice(0, 12).map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${seo.canonicalUrl}/prodotti/${product.slug}`,
      name: product.name
    }))
  };

  const breadcrumb = buildStoreBreadcrumbJsonLd(location, seo.name, seo.canonicalUrl);
  const faq = buildFaqJsonLd(seo.faq);

  return [localBusiness, webpage, itemList, breadcrumb, faq];
}

export function buildStoreCategoryJsonLd(
  location: LocationLike,
  category: CategoryLike,
  products: StoreProductView[]
) {
  const seo = getStoreSeo(location);
  const canonicalUrl = `${seo.canonicalUrl}/categorie/${category.slug}`;
  const base = buildStoreJsonLd(location, products);
  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name: `${category.name} a ${seo.keywordCity} - ${seo.name}`,
    description:
      category.description ?? `${category.name} disponibili nel catalogo ecommerce della sede ${seo.name}.`,
    isPartOf: { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "Sessa 1930 Shop", url: SITE_URL },
    about: { "@id": `${seo.canonicalUrl}#localbusiness` },
    mainEntity: { "@id": `${canonicalUrl}#products` }
  };
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${canonicalUrl}#products`,
    name: `${category.name} - ${seo.name}`,
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: product.name,
      url: `${seo.canonicalUrl}/prodotti/${product.slug}`
    }))
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shop Sessa 1930", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: seo.name, item: seo.canonicalUrl },
      { "@type": "ListItem", position: 3, name: category.name, item: canonicalUrl }
    ]
  };
  return [base[0], collectionPage, itemList, breadcrumb];
}

export function buildHomeJsonLd(locations: LocationLike[]) {
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organizationId,
      name: "Sessa 1930",
      url: "https://sessa1930.com/",
      logo: `${SITE_URL}/brand/sessa-logo-white.webp`,
      description: BRAND_DESCRIPTION,
      sameAs: ["https://sessa1930.com/"],
      subOrganization: locations.map((location) => ({
        "@type": "Bakery",
        "@id": `${SITE_URL}/sede/${location.slug}#localbusiness`,
        name: getStoreSeo(location).name,
        url: `${SITE_URL}/sede/${location.slug}`
      }))
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": websiteId,
      name: "Sessa 1930 Shop",
      url: `${SITE_URL}/`,
      inLanguage: "it-IT",
      publisher: { "@id": organizationId }
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/#webpage`,
      name: "Shop online Sessa 1930 - scegli la sede",
      url: `${SITE_URL}/`,
      description: "Scegli il punto vendita Sessa 1930 e ordina dal catalogo locale con disponibilità per sede.",
      isPartOf: { "@id": websiteId },
      about: { "@id": organizationId },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: locations.map((location, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: getStoreSeo(location).name,
          url: `${SITE_URL}/sede/${location.slug}`
        }))
      }
    }
  ];
}

export function buildStoreBreadcrumbJsonLd(location: LocationLike, label?: string, url?: string) {
  const seo = getStoreSeo(location);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shop Sessa 1930", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: label ?? seo.name, item: url ?? seo.canonicalUrl }
    ]
  };
}

export function buildProductBreadcrumbJsonLd(location: LocationLike, product: StoreProductView) {
  const seo = getStoreSeo(location);
  const productUrl = `${seo.canonicalUrl}/prodotti/${product.slug}`;
  const crumbs: Array<{ "@type": "ListItem"; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Shop Sessa 1930", item: `${SITE_URL}/` },
    { "@type": "ListItem", position: 2, name: seo.name, item: seo.canonicalUrl }
  ];
  if (product.category) {
    crumbs.push({
      "@type": "ListItem",
      position: crumbs.length + 1,
      name: product.category.name,
      item: `${seo.canonicalUrl}/categorie/${product.category.slug}`
    });
  }
  crumbs.push({
    "@type": "ListItem",
    position: crumbs.length + 1,
    name: product.name,
    item: productUrl
  });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs
  };
}

export function buildProductJsonLd(location: LocationLike, product: StoreProductView) {
  const seo = getStoreSeo(location);
  const productUrl = `${seo.canonicalUrl}/prodotti/${product.slug}`;
  const image = product.image ? new URL(product.image, SITE_URL).toString() : undefined;
  const seller = { "@id": `${seo.canonicalUrl}#localbusiness` };
  const variants = product.variants.map((variant) => ({
    "@type": "Product",
    "@id": `${productUrl}#${encodeURIComponent(variant.sku)}`,
    name: `${product.name} - ${variant.name}`,
    sku: variant.sku,
    image: image ? [image] : undefined,
    description: product.shortDescription ?? product.description,
    brand: { "@type": "Brand", name: "Sessa 1930" },
    category: product.category?.name,
    isVariantOf: { "@id": `${productUrl}#product` },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "EUR",
      price: (variant.priceCents / 100).toFixed(2),
      availability: variant.stockQty > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller,
      availableAtOrFrom: seller,
      hasMerchantReturnPolicy:
        product.shippingScope === "NATIONAL"
          ? {
              "@type": "MerchantReturnPolicy",
              applicableCountry: "IT",
              returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
              merchantReturnDays: 14,
              returnMethod: "https://schema.org/ReturnByMail",
              returnFees: "https://schema.org/ReturnFeesCustomerResponsibility"
            }
          : {
              // Prodotti freschi deperibili: recesso escluso (art. 59 Codice del Consumo).
              "@type": "MerchantReturnPolicy",
              applicableCountry: "IT",
              returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted"
            }
    }
  }));

  const productEntity =
    variants.length > 1
      ? {
          "@context": "https://schema.org",
          "@type": "ProductGroup",
          "@id": `${productUrl}#product`,
          productGroupID: product.id,
          name: product.name,
          image: image ? [image] : undefined,
          description: product.shortDescription ?? product.description,
          brand: { "@type": "Brand", name: "Sessa 1930" },
          category: product.category?.name,
          variesBy: "https://schema.org/name",
          hasVariant: variants,
          offers:
            product.priceMin > 0
              ? {
                  "@type": "AggregateOffer",
                  priceCurrency: "EUR",
                  lowPrice: (product.priceMin / 100).toFixed(2),
                  highPrice: (product.priceMax / 100).toFixed(2),
                  offerCount: variants.length
                }
              : undefined
        }
      : {
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": `${productUrl}#product`,
          name: product.name,
          sku: product.variants[0]?.sku,
          image: image ? [image] : undefined,
          description: product.shortDescription ?? product.description,
          brand: { "@type": "Brand", name: "Sessa 1930" },
          category: product.category?.name,
          offers: variants[0]?.offers
        };

  return [
    productEntity,
    buildProductBreadcrumbJsonLd(location, product)
  ];
}

export function buildProductMetadata(
  location: LocationLike,
  product: StoreProductView,
  canonicalLocationSlug?: string | null
): Metadata {
  const seo = getStoreSeo(location);
  const productUrl = `${seo.canonicalUrl}/prodotti/${product.slug}`;
  // Stessa scheda in più sedi: canonical sulla sede principale del prodotto.
  const canonicalUrl =
    canonicalLocationSlug && canonicalLocationSlug !== location.slug
      ? `${SITE_URL}/sede/${canonicalLocationSlug}/prodotti/${product.slug}`
      : productUrl;
  const city = seo.keywordCity;
  const title = `${product.name} ${city} - Ordina da ${seo.name}`;
  const description =
    `${product.name} disponibile nello shop ${seo.name}. ` +
    `${product.shortDescription ?? "Pasticceria artigianale Sessa 1930"} Ritiro${location.deliveryEnabled ? " o consegna" : ""} dalla sede.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    robots: { index: true, follow: true },
    keywords: [
      `${product.name} ${city}`,
      `${product.name} Sessa 1930`,
      `ordina ${product.name} online`,
      `pasticceria napoletana ${city}`
    ],
    openGraph: {
      type: "website",
      title,
      description,
      url: productUrl,
      siteName: "Sessa 1930",
      locale: "it_IT",
      images: product.image ? [{ url: new URL(product.image, SITE_URL).toString(), alt: product.name }] : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

export function buildFaqJsonLd(faq: LocalFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
}
