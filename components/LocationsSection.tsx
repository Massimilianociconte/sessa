import Image from "next/image";
import { brandFacts, locations } from "@/data/site-content";

export function LocationsSection() {
  return (
    <section id="sedi" className="relative bg-ivory px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
      <div className="mx-auto max-w-[1380px]">
        <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-terracotta">
              Le sedi
            </p>
            <h2 className="mt-4 max-w-3xl font-serif text-[clamp(3.2rem,7vw,7rem)] font-medium leading-[0.9] text-ink">
              Da Ottaviano ai Mercati Centrali
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-8 text-ink/70 sm:text-lg lg:justify-self-end">
            Le informazioni sulle sedi riprendono gli indirizzi pubblicati da Sessa 1930: una rete
            che parte da Ottaviano e arriva a Torino, Milano, Firenze e Roma.
          </p>
        </div>

        <div className="-mx-5 mt-12 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0">
          <div className="flex snap-x snap-mandatory gap-5">
            {locations.map((location) => (
              <article
                key={`${location.name}-${location.address}`}
                className="min-w-[82vw] snap-start bg-white shadow-[0_20px_56px_rgba(23,20,18,0.08)] sm:min-w-[380px] lg:min-w-[420px]"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-ink">
                  <Image
                    src={location.image}
                    alt={`${location.name}, ${location.city}`}
                    fill
                    sizes="(min-width: 1024px) 420px, (min-width: 640px) 380px, 82vw"
                    className="object-cover contrast-[1.03] saturate-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/38 to-transparent" />
                </div>
                <div className="p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
                    {location.city}
                  </p>
                  <h3 className="mt-2 font-serif text-4xl font-medium leading-none text-ink">
                    {location.name}
                  </h3>
                  <p className="mt-4 min-h-[3.5rem] text-sm leading-6 text-ink/65">
                    {location.address}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-4 border-t border-ink/12 pt-8 text-sm leading-7 text-ink/65 md:grid-cols-2">
          <p>{brandFacts.ottavianoHours}</p>
          <p>{brandFacts.marketHours}</p>
        </div>
      </div>
    </section>
  );
}
