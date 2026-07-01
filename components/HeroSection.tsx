import Image from "next/image";
import { SessaSignature } from "@/components/SessaSignature";
import { assetPath } from "@/lib/paths";

const heroFrames = [
  {
    src: assetPath("/images/editorial/baba-hero-cinematic.jpg"),
    alt: "Babà napoletano con crema in luce calda"
  },
  {
    src: assetPath("/images/editorial/sfogliatella-cinematic.jpg"),
    alt: "Sfogliatella napoletana in dettaglio artigianale"
  },
  {
    src: assetPath("/images/editorial/pastiera-cinematic.jpg"),
    alt: "Pastiera napoletana in scena editoriale"
  },
  {
    src: assetPath("/images/editorial/delizia-limone-cinematic.jpg"),
    alt: "Delizia al limone con finitura luminosa"
  }
];

export function HeroSection() {
  return (
    <section id="top" className="relative min-h-[100svh] overflow-hidden bg-ink text-ivory">
      <h1 className="sr-only">Sessa</h1>
      <div className="hero-media-stage absolute inset-0">
        {heroFrames.map((frame, index) => (
          <Image
            key={frame.src}
            src={frame.src}
            alt={frame.alt}
            fill
            priority={index === 0}
            sizes="100vw"
            className={`hero-media-frame hero-media-frame--${index + 1} object-cover object-center`}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(23,20,18,0.56)_0%,rgba(23,20,18,0.12)_42%,rgba(23,20,18,0.72)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,247,237,0.12),rgba(23,20,18,0)_38%)]" />
      <div className="relative z-20 grid min-h-[100svh] grid-rows-[auto_1fr_auto] px-5 pb-16 pt-28 sm:px-8 sm:pb-10 sm:pt-32 lg:px-12 lg:pb-12">
        <div aria-hidden="true" />
        <div className="flex items-center justify-center">
          <SessaSignature
            animate
            ariaLabel="Sessa"
            idSuffix="hero"
            className="hero-signature h-auto w-screen text-ivory drop-shadow-[0_18px_38px_rgba(23,20,18,0.45)]"
            tail="long"
          />
        </div>
        <div className="grid items-end gap-8 md:grid-cols-[minmax(0,0.95fr)_auto]">
          <p
            className="max-w-[920px] font-serif text-[clamp(3.1rem,7.4vw,8.6rem)] font-medium leading-[0.88] text-white"
            style={{ textShadow: "0 12px 36px rgba(23, 20, 18, 0.58)" }}
          >
            Dal 1930
            <br />
            Un&apos;esplosione di
            <br />
            gusto e felicità
          </p>
          <a
            href="#dolci"
            aria-label="Vai alla sezione dolci"
            className="hero-scroll-cue hidden h-28 w-px justify-self-end bg-cream/70 outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-4 focus-visible:ring-offset-ink md:block"
          />
        </div>
      </div>
    </section>
  );
}
