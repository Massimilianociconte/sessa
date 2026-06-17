import Image from "next/image";
import { assetPath } from "@/lib/paths";

export function HeritageSection() {
  return (
    <section
      id="storia"
      className="relative bg-white px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-36"
    >
      <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-20">
        <div className="relative z-30 max-w-xl">
          <p className="mb-7 inline-flex border-b border-terracotta/60 pb-2 text-sm font-bold uppercase text-terracotta">
            Dal banco alla tavola
          </p>
          <h2 className="font-serif text-[clamp(3.3rem,7vw,7rem)] font-medium leading-[0.9] text-ink">
            Tradizione napoletana, anima contemporanea
          </h2>
          <div className="mt-8 space-y-5 text-base leading-8 text-ink/[0.72] sm:text-lg">
            <p>
              Sessa nasce a Ottaviano nel racconto di Anna e Gaetano: una storia di dolcezza,
              passione e lavoro quotidiano che il sito ufficiale fa risalire al 1930.
            </p>
            <p>
              Dagli anni Settanta la famiglia continua a custodire valori artigianali, qualità e
              attenzione al dettaglio, portando oggi le specialità Sessa anche nei Mercati Centrali.
            </p>
          </div>
        </div>
        <div className="relative z-10 min-h-[430px] sm:min-h-[560px]">
          <div className="absolute -left-4 -top-4 h-24 w-24 border-l border-t border-terracotta/50 sm:h-32 sm:w-32" />
          <div className="relative ml-auto h-[430px] w-full overflow-hidden shadow-editorial sm:h-[560px] lg:w-[86%]">
            <Image
              src={assetPath("/images/official/processed/about-sessa3.jpg")}
              alt="Sessa 1930, dettaglio ufficiale del lavoro artigianale"
              fill
              sizes="(min-width: 1024px) 48vw, 100vw"
              className="object-cover contrast-[1.03] saturate-[1.03]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
