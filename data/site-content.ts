import { assetPath } from "@/lib/paths";

export type NavItem = {
  label: string;
  href: string;
};

export type Category = {
  name: string;
  image: string;
  accent: "terracotta" | "blue" | "green";
  tile: string;
};

export type Specialty = {
  name: string;
  image: string;
  category: string;
  alt: string;
};

export type ShopProduct = {
  name: string;
  image: string;
  href: string;
  price: string;
  availability: string;
  description: string;
  variants: string[];
};

export type GalleryImage = {
  image: string;
  alt: string;
};

export type Location = {
  name: string;
  address: string;
  city: string;
  image: string;
};

export type StoryMilestone = {
  year: string;
  title: string;
  copy: string;
};

export type SocialLink = {
  label: string;
  href: string;
};

export type ImageCredit = {
  label: string;
  href: string;
};

const officialImagePath = assetPath("/images/official/processed");
const stickerImagePath = assetPath("/images/stickers");
const patternPath = assetPath("/patterns");

export const navItems: NavItem[] = [
  { label: "Storia", href: "#storia" },
  { label: "Dolci", href: "#dolci" },
  { label: "Identità", href: "#identita" },
  { label: "Sedi", href: "#sedi" },
  { label: "Galleria", href: "#galleria" },
  { label: "Contatti", href: "#contatti" }
];

export const brandFacts = {
  headline: "Sessa 1930 - Un'esplosione di gusto e felicità",
  intro:
    "Dal laboratorio di Ottaviano ai Mercati Centrali, Sessa porta avanti una pasticceria partenopea fatta di cura, qualità e passione.",
  address: "Piazza Municipio, 27, 80044 Ottaviano (NA)",
  phone: "+39 081 827 8077",
  email: "info@sessa1930.com",
  vat: "P.iva: 11751160968",
  officialSite: "https://sessa1930.com/",
  ottavianoHours: "Ottaviano: 06:30 - 21:00, martedì chiuso",
  marketHours: "Mercati: tutti i giorni, 07:00 - 00:00"
};

export const categories: Category[] = [
  {
    name: "Colazioni",
    image: `${stickerImagePath}/colazioni-sessa-sticker.png`,
    accent: "terracotta",
    tile: `${patternPath}/sessa-maiolica-orange.png`
  },
  {
    name: "Sfogliatelle",
    image: `${stickerImagePath}/sfogliatella-sessa-sticker.png`,
    accent: "blue",
    tile: `${patternPath}/sessa-maiolica-blue.png`
  },
  {
    name: "Box Regalo",
    image: `${stickerImagePath}/box-regalo-sessa-sticker.png`,
    accent: "green",
    tile: `${patternPath}/sessa-maiolica-green.png`
  },
  {
    name: "Pasticceria Tradizionale",
    image: `${stickerImagePath}/pasticceria-tradizionale-sessa-sticker.png`,
    accent: "terracotta",
    tile: `${patternPath}/sessa-maiolica-orange.png`
  }
];

export const specialties: Specialty[] = [
  {
    name: "Babbà",
    image: `${officialImagePath}/product-babba.png`,
    category: "Pasticceria tradizionale",
    alt: "Babbà Sessa su fondo chiaro"
  },
  {
    name: "Caprese",
    image: `${officialImagePath}/product-caprese.png`,
    category: "Pasticceria tradizionale",
    alt: "Caprese Sessa su fondo chiaro"
  },
  {
    name: "Delizia al limone",
    image: `${officialImagePath}/product-delizia-limone.png`,
    category: "Pasticceria tradizionale",
    alt: "Delizia al limone Sessa su fondo chiaro"
  },
  {
    name: "Sfogliatelle",
    image: `${officialImagePath}/product-sfogliatelle.png`,
    category: "Sfogliatelle",
    alt: "Sfogliatelle Sessa su fondo chiaro"
  }
];

export const shopProducts: ShopProduct[] = [
  {
    name: "Colomba Artigianale 1Kg",
    image: `${officialImagePath}/shop-colomba.jpg`,
    href: "https://sessa1930.com/prodotto/colomba-artigianale-1kg/",
    price: "35,00 € - 38,00 €",
    availability: "Disponibile online",
    description:
      "Colomba artigianale proposta dal sito ufficiale in sei varianti, dalla classica al pistacchio.",
    variants: [
      "Classica",
      "Albicocca del Vesuvio",
      "Doppio Cioccolato",
      "Limone e Cioccolato Bianco",
      "Frutti di bosco e Cioccolato Bianco",
      "Pistacchio"
    ]
  },
  {
    name: "Panettone Sessa da 1 Kg",
    image: `${officialImagePath}/shop-panettone-box.png`,
    href: "https://sessa1930.com/prodotto/panettone-sessa-ottaviano/",
    price: "34,00 € - 38,00 €",
    availability: "Esaurito sul sito ufficiale",
    description:
      "Panettone Sessa da 1 Kg con varianti ufficiali classiche, agli agrumi, al pistacchio e al cioccolato.",
    variants: [
      "Classico",
      "Limone",
      "Pistacchio",
      "Cioccolato Fondente",
      "Albicocca del Vesuvio",
      "Agrumi",
      "Frutti di bosco e cioccolato bianco"
    ]
  },
  {
    name: "Panettone Sessa da 500 gr",
    image: `${officialImagePath}/shop-panettone.png`,
    href: "https://sessa1930.com/prodotto/panettone-sessa/",
    price: "27,00 € - 30,00 €",
    availability: "Esaurito sul sito ufficiale",
    description:
      "Formato da 500 gr del Panettone Sessa, indicato dal catalogo ufficiale con varianti classico, limone e pistacchio.",
    variants: ["Classico", "Limone", "Pistacchio"]
  }
];

export const storyMilestones: StoryMilestone[] = [
  {
    year: "1930",
    title: "Anna e Gaetano",
    copy:
      "La storia Sessa nasce con Anna e Gaetano, tra dolcezza, passione e una tavola di famiglia che diventa mestiere."
  },
  {
    year: "1970",
    title: "Sabato Sessa",
    copy:
      "Il figlio Sabato porta avanti i valori familiari nella sua arte pasticcera, mantenendo il legame con Ottaviano."
  },
  {
    year: "Oggi",
    title: "La nuova generazione",
    copy:
      "Gaetano Sessa prosegue il percorso con attenzione alla qualità, alla sfogliatella e ai prodotti artigianali."
  }
];

export const locations: Location[] = [
  {
    name: "Ottaviano",
    city: "Ottaviano (NA)",
    address: "Piazza Municipio, 27, 80044 Ottaviano NA",
    image: `${officialImagePath}/location-ottaviano.png`
  },
  {
    name: "Mercato Centrale Torino",
    city: "Torino",
    address: "Piazza della Repubblica, 25, 10152 Torino TO",
    image: `${officialImagePath}/location-torino.png`
  },
  {
    name: "Mercato Centrale Milano",
    city: "Milano",
    address: "Via Giovanni Battista Sammartini, 2, 20125 Milano MI",
    image: `${officialImagePath}/location-milano-mercato.png`
  },
  {
    name: "Mercato Centrale Firenze",
    city: "Firenze",
    address: "Via dell'Ariento, 50123 Firenze FI",
    image: `${officialImagePath}/location-firenze.png`
  },
  {
    name: "Mercato Centrale Roma",
    city: "Roma",
    address: "Via Giovanni Giolitti, 36, 00185 Roma RM",
    image: `${officialImagePath}/location-roma.png`
  },
  {
    name: "Merlata Bloom",
    city: "Milano",
    address: "Via Gottlieb Wilhelm Daimler, 0 C2, 20151 Milano MI",
    image: `${officialImagePath}/location-merlata.png`
  },
  {
    name: "Stazione Roma Termini",
    city: "Roma",
    address: "Via Giovanni Giolitti, 40, 00185 Roma RM",
    image: `${officialImagePath}/location-roma-termini.png`
  }
];

export const galleryImages: GalleryImage[] = [
  {
    image: `${officialImagePath}/homepage-gallery.jpg`,
    alt: "Selezione di dolci Sessa in composizione editoriale"
  },
  {
    image: `${officialImagePath}/about-sessa3.jpg`,
    alt: "Interno e lavoro artigianale Sessa 1930"
  },
  {
    image: `${officialImagePath}/about-prodotti.png`,
    alt: "Prodotti artigianali Sessa"
  },
  {
    image: `${officialImagePath}/shop-colomba.jpg`,
    alt: "Colomba artigianale Sessa nella sua confezione"
  }
];

export const socialLinks: SocialLink[] = [
  { label: "Instagram", href: "https://www.instagram.com/sessa1930/" },
  { label: "Facebook", href: "https://www.facebook.com/pasticceriasessa/" },
  {
    label: "Tripadvisor",
    href: "https://www.tripadvisor.it/Restaurant_Review-g1602959-d4555401-Reviews-Pasticceria_Sessa_1930_L_arte_del_gusto-Ottaviano_Province_of_Naples_Campania.html"
  },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/pasticceriasessa/" }
];

export const imageCredits: ImageCredit[] = [
  { label: "Immagini e dati prodotto: Sessa 1930", href: "https://sessa1930.com/" }
];
