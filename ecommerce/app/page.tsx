import Link from "next/link";
import type { CSSProperties } from "react";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { listActiveLocations } from "@/lib/services/locations";

export const dynamic = "force-dynamic";

const ACCENTS = [
  { accent: "#d65a1f", tile: 'url("/patterns/sessa-maiolica-orange.png")' },
  { accent: "#1f4e79", tile: 'url("/patterns/sessa-maiolica-blue.png")' },
  { accent: "#08c963", tile: 'url("/patterns/sessa-maiolica-green.png")' }
];

export default async function HomePage() {
  const locations = await listActiveLocations();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4">
        <section className="py-14 text-center md:py-20">
          <p className="script-accent text-4xl md:text-6xl">Un'esplosione di gusto</p>
          <h1 className="display-title mx-auto mt-3 max-w-5xl text-balance text-4xl md:text-6xl">
            Scegli la tua pasticceria Sessa
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-ink/60">
            Ogni sede ha il suo assortimento, i suoi orari e le sue modalità di ritiro o consegna.
            Seleziona il punto vendita per iniziare a ordinare.
          </p>
        </section>

        <div className="mb-6 flex justify-center">
          <span className="kicker">I nostri punti vendita</span>
        </div>

        <div className="grid grid-cols-1 gap-6 pb-8 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location, i) => {
            const theme = ACCENTS[i % ACCENTS.length];
            const style = { "--accent": theme.accent, "--tile": theme.tile } as CSSProperties;
            return (
              <Link
                key={location.id}
                href={`/sede/${location.slug}`}
                style={style}
                className="accent-card card flex flex-col gap-2 p-6"
              >
                <span
                  className="text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: theme.accent }}
                >
                  {location.city}
                </span>
                <h2 className="font-serif text-2xl font-semibold">{location.name}</h2>
                <p className="text-sm text-ink/60">{location.address}</p>
                {location.hours && <p className="text-sm text-ink/45">{location.hours}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {location.pickupEnabled && (
                    <span className="badge bg-majolica/25 text-ink/70">Ritiro in sede</span>
                  )}
                  {location.deliveryEnabled && (
                    <span className="badge bg-brilliant/15 text-emerald-800">Consegna</span>
                  )}
                </div>
                <span className="mt-4 text-sm font-bold" style={{ color: theme.accent }}>
                  Ordina qui →
                </span>
              </Link>
            );
          })}
        </div>
      </main>
      <Footer />
    </>
  );
}
