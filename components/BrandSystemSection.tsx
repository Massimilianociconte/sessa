import Image from "next/image";
import type { CSSProperties } from "react";
import { assetPath } from "@/lib/paths";

type AccentName = "terracotta" | "blue" | "green";

type PaletteCard = {
  accent: AccentName;
  name: string;
  title: string;
  copy: string;
  image: string;
  tile: string;
};

const paletteCards: PaletteCard[] = [
  {
    accent: "terracotta",
    name: "Terracotta",
    title: "Calore autentico",
    copy: "Il colore madre: pieno, solare, vicino alla materia cotta e alla dolcezza partenopea.",
    image: assetPath("/images/official/processed/product-babba.png"),
    tile: assetPath("/patterns/sessa-maiolica-orange.png")
  },
  {
    accent: "blue",
    name: "Blu intenso",
    title: "Profondità e fiducia",
    copy: "Il contrappunto elegante: una tonalità elettrica che rende la tradizione più memorabile.",
    image: assetPath("/images/official/processed/product-sfogliatelle.png"),
    tile: assetPath("/patterns/sessa-maiolica-blue.png")
  },
  {
    accent: "green",
    name: "Verde brillante",
    title: "Vitalita e materia prima",
    copy: "La nota fresca: richiama equilibrio, ingredienti selezionati e cura quotidiana.",
    image: assetPath("/images/official/processed/product-delizia-limone.png"),
    tile: assetPath("/patterns/sessa-maiolica-green.png")
  }
];

const framedProducts = [
  {
    accent: "blue" as const,
    name: "Babba",
    displayName: "Babbà",
    subtitle: "Dolce napoletano al rum",
    image: assetPath("/images/official/processed/product-babba.png"),
    tile: assetPath("/patterns/sessa-maiolica-blue.png"),
    notes: ["Lievitazione naturale", "Bagna al rum selezionato", "Ricetta tradizionale"]
  },
  {
    accent: "green" as const,
    name: "Delizia al limone",
    displayName: "Delizia al limone",
    subtitle: "Freschezza, crema e agrumi",
    image: assetPath("/images/official/processed/product-delizia-limone.png"),
    tile: assetPath("/patterns/sessa-maiolica-green.png"),
    notes: ["Crema al limone", "Materia prima selezionata", "Finitura artigianale"]
  }
];

type CustomStyle = CSSProperties & Record<"--accent" | "--accent-dark" | "--tile", string>;

const accentMap: Record<AccentName, { color: string; dark: string }> = {
  terracotta: { color: "#d85a24", dark: "#a83f18" },
  blue: { color: "#073fd0", dark: "#082a87" },
  green: { color: "#08c963", dark: "#067b43" }
};

function accentStyle(accent: AccentName, tile: string): CustomStyle {
  return {
    "--accent": accentMap[accent].color,
    "--accent-dark": accentMap[accent].dark,
    "--tile": `url("${tile}")`
  };
}

export function BrandSystemSection() {
  return (
    <section
      id="identita"
      className="brand-system-section relative scroll-mt-[72px] overflow-hidden px-5 py-20 sm:scroll-mt-[86px] sm:px-8 sm:py-28 lg:px-12"
    >
      <div className="relative z-20 mx-auto max-w-[1380px]">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="brand-system-kicker">Dalla piastrella nasce un sistema</p>
            <h2 className="mt-5 max-w-5xl font-serif text-[clamp(3.25rem,6.5vw,6.7rem)] font-medium leading-[0.92] text-terracotta">
              Una grammatica visiva, non un semplice ornamento
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-8 text-ink/70 sm:text-lg lg:justify-self-end">
            La maiolica diventa cornice, ritmo e segno proprietario: accompagna il prodotto,
            introduce il colore e prepara un linguaggio pronto per menu, packaging e futuro
            e-commerce.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {paletteCards.map((card) => (
            <article
              key={card.name}
              className="palette-story-card"
              style={accentStyle(card.accent, card.tile)}
            >
              <span className="palette-story-card__tile" aria-hidden="true" />
              <div className="relative z-10 flex min-h-[420px] flex-col justify-between p-6 sm:p-8">
                <div>
                  <p className="font-serif text-4xl leading-none text-white">{card.name}</p>
                  <p className="mt-4 max-w-xs text-sm leading-6 text-white/82">{card.copy}</p>
                </div>
                <div className="mt-8 grid grid-cols-[0.92fr_1fr] items-end gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">
                      {card.title}
                    </p>
                    <div className="mt-4 h-px w-24 bg-white/54" />
                  </div>
                  <div className="palette-story-card__image">
                    <Image
                      src={card.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 15vw, 42vw"
                      className="object-contain p-2"
                    />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-20 grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
          <div>
            <p className="brand-system-kicker">Dal prodotto al mondo visivo</p>
            <h3 className="mt-4 font-serif text-[clamp(3rem,5.6vw,5.9rem)] font-medium leading-[0.9] text-ink">
              Il prodotto non cambia. Cambia il modo in cui viene ricordato.
            </h3>
            <p className="mt-7 max-w-xl text-base leading-8 text-ink/68 sm:text-lg">
              Le immagini ufficiali restano protagoniste, ma vengono incorniciate da un sistema
              coerente: colore, piastrella, micro-dettagli e promessa artigianale.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {framedProducts.map((product) => (
              <article
                key={product.name}
                className="product-world-card"
                style={accentStyle(product.accent, product.tile)}
              >
                <div className="product-world-card__frame">
                  <div className="relative aspect-square bg-[rgba(255,247,237,0.92)]">
                    <Image
                      src={product.image}
                      alt={product.displayName}
                      fill
                      sizes="(min-width: 1024px) 25vw, (min-width: 768px) 42vw, 88vw"
                      className="object-contain p-8"
                    />
                  </div>
                </div>
                <div className="px-6 pb-7 pt-6">
                  <h4 className="font-serif text-5xl font-medium leading-none text-[var(--accent)]">
                    {product.displayName}
                  </h4>
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.16em] text-ink/48">
                    {product.subtitle}
                  </p>
                  <ul className="mt-6 grid gap-3 text-sm leading-6 text-ink/66">
                    {product.notes.map((note) => (
                      <li key={note} className="flex items-center gap-3">
                        <span className="h-2 w-2 rotate-45 bg-[var(--accent)]" aria-hidden="true" />
                        {note}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="commerce-preview mt-16" style={accentStyle("terracotta", assetPath("/patterns/sessa-maiolica-orange.png"))}>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
              E-commerce futuro
            </p>
            <h3 className="mt-3 font-serif text-[clamp(2.6rem,5vw,5.2rem)] font-medium leading-[0.94] text-ink">
              Una base già pronta per catalogo, box regalo e prodotti stagionali.
            </h3>
          </div>
          <div className="max-w-xl">
            <p className="text-base leading-8 text-ink/68 sm:text-lg">
              In questa fase il sito resta una presentazione editoriale. I punti di ingresso allo
              shop sono pensati come inviti morbidi: leggibili, premium e pronti a diventare
              percorsi d&apos;acquisto quando sarà il momento.
            </p>
            <a
              href="#contatti"
              className="mt-7 inline-flex min-h-14 items-center justify-center rounded-full bg-terracotta px-8 text-base font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-4 focus-visible:ring-offset-cream motion-reduce:transition-none"
            >
              Parliamo del catalogo online
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
