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
  updatedAt?: Date;
};

type LocalFaq = {
  question: string;
  answer: string;
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
    hours: "06:30-21:00, martedi chiuso",
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
    sourceNote: "Sessa 1930 e presente al Mercato Centrale Milano con la sfogliatella napoletana di Sabato Sessa.",
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
    keywordCity: "Roma Termini",
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
    sourceNote: "Sessa 1930 e presente nell'offerta food del centro Merlata Bloom Milano.",
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
    signatureProducts: ["caffe gourmet", "cornetti", "sfogliatelle", "cheesecake", "pasticceria napoletana"],
    sourceNote: "Il sito Sessa indica la sede Stazione Roma Termini in Via Giovanni Giolitti, 40.",
    sourceUrl: "https://sessa1930.com/"
  }
};

const BRAND_DESCRIPTION =
  "Sessa 1930 e una pasticceria artigianale partenopea nata a Ottaviano, legata a tradizione napoletana, materie prime selezionate e specialita come sfogliatelle, babà, pastiera, caprese e grandi lievitati.";

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
  const address = profile.address ?? location.address;
  const postalCode = profile.postalCode ?? location.postalCode;
  const hours = profile.hours ?? location.hours ?? "";
  const canonicalUrl = `${SITE_URL}/sede/${location.slug}`;
  const title = `${name} - Shop online ${cityName}`;
  const description =
    `Ordina online da ${name}: ${profile.signatureProducts.slice(0, 4).join(", ")} e specialita napoletane. ` +
    `${address}, ${cityName}. Ritiro${location.deliveryEnabled ? " e consegna" : ""}.`;
  const h1 = `${name}: ecommerce della sede di ${cityName}`;
  const directAnswer =
    `${name} e la pagina ecommerce locale di Sessa 1930 per ${profile.geoArea}. Qui puoi ordinare online ` +
    `${profile.signatureProducts.slice(0, 4).join(", ")} e prodotti della pasticceria napoletana, con disponibilita e stock collegati alla sede.`;
  const narrative =
    `${BRAND_DESCRIPTION} La sede ${name} porta questa identita a ${profile.geoArea}, con un catalogo online pensato per ritiro` +
    `${location.deliveryEnabled ? " e consegna" : ""} dalla sede selezionata.`;
  const faq: LocalFaq[] = [
    {
      question: `Dove si trova ${name}?`,
      answer: `${name} si trova in ${address}${postalCode ? `, ${postalCode}` : ""} ${cityName}${profile.province ? ` (${profile.province})` : ""}.`
    },
    {
      question: `Cosa posso ordinare online da ${name}?`,
      answer: `Puoi ordinare prodotti Sessa come ${profile.signatureProducts.slice(0, 5).join(", ")} e altre specialita disponibili nel catalogo della sede.`
    },
    {
      question: `Il catalogo online cambia in base alla sede?`,
      answer:
        "Si. Prezzi, disponibilita, prodotti attivi e stock sono collegati alla sede selezionata, cosi il carrello resta coerente con il punto vendita scelto."
    }
  ];

  return {
    ...profile,
    name,
    cityName,
    address,
    postalCode,
    hours,
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
    title: seo.title,
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
    areaServed: seo.geoArea,
    parentOrganization: {
      "@type": "Organization",
      name: "Sessa 1930",
      url: "https://sessa1930.com/"
    },
    sameAs: [seo.sourceUrl, "https://sessa1930.com/"]
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
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Shop Sessa 1930", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: seo.name, item: seo.canonicalUrl },
      { "@type": "ListItem", position: 3, name: product.name, item: productUrl }
    ]
  };
}

export function buildProductJsonLd(location: LocationLike, product: StoreProductView) {
  const seo = getStoreSeo(location);
  const productUrl = `${seo.canonicalUrl}/prodotti/${product.slug}`;
  const available = product.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const offer =
    product.priceMin > 0
      ? {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "EUR",
          price: (product.priceMin / 100).toFixed(2),
          availability: available,
          availableAtOrFrom: { "@id": `${seo.canonicalUrl}#localbusiness` }
        }
      : undefined;

  return [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${productUrl}#product`,
      name: product.name,
      image: product.image ? [`${SITE_URL}${product.image}`] : undefined,
      description: product.shortDescription ?? product.description,
      sku: product.variants[0]?.sku,
      brand: { "@type": "Brand", name: "Sessa 1930" },
      category: product.category?.name,
      offers: offer
    },
    buildProductBreadcrumbJsonLd(location, product)
  ];
}

export function buildProductMetadata(location: LocationLike, product: StoreProductView): Metadata {
  const seo = getStoreSeo(location);
  const productUrl = `${seo.canonicalUrl}/prodotti/${product.slug}`;
  const city = seo.keywordCity;
  const title = `${product.name} ${city} - Ordina da ${seo.name}`;
  const description =
    `${product.name} disponibile nello shop ${seo.name}. ` +
    `${product.shortDescription ?? "Pasticceria artigianale Sessa 1930"} Ritiro${location.deliveryEnabled ? " o consegna" : ""} dalla sede.`;
  return {
    title,
    description,
    alternates: { canonical: productUrl },
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
      images: product.image ? [{ url: product.image, alt: product.name }] : undefined
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
