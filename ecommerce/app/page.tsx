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
      <main className="shop-main mx-auto max-w-6xl px-4">
        <section className="shop-home-hero py-10 md:py-16">
          <div className="shop-home-copy">
            <span className="eyebrow-chip">Shop ufficiale Sessa 1930</span>
            <p className="script-accent mt-5 text-4xl md:text-6xl">Un'esplosione di gusto</p>
            <h1 className="display-title mt-3 max-w-5xl text-balance text-4xl md:text-6xl">
              Scegli la tua pasticceria Sessa
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink/65">
              Ogni sede ha il suo assortimento, i suoi orari e le sue modalità di ritiro o consegna.
              Seleziona il punto vendita per iniziare a ordinare.
            </p>
          </div>
          <aside className="shop-home-panel" aria-label="Selezione ecommerce Sessa">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-cream/70">Napoli nel gesto</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight text-ivory">
              Laboratorio, sede e catalogo lavorano insieme.
            </h2>
            <div className="mt-6 grid gap-2">
              <span>Prodotti freschi per sede</span>
              <span>Ritiro e consegna dove disponibili</span>
              <span>Box regalo e classici Sessa</span>
            </div>
          </aside>
        </section>

        <div className="mb-6 flex justify-center md:justify-start">
          <span className="kicker">I nostri punti vendita</span>
        </div>

        <div className="location-grid grid grid-cols-1 gap-6 pb-8 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location, i) => {
            const theme = ACCENTS[i % ACCENTS.length];
            const style = { "--accent": theme.accent, "--tile": theme.tile } as CSSProperties;
            return (
              <Link
                key={location.id}
                href={`/sede/${location.slug}`}
                style={style}
                className="location-card accent-card card flex flex-col gap-2 p-6"
              >
                <span className="location-card-city" style={{ color: theme.accent }}>
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
                <span className="location-card-cta mt-4 text-sm font-bold" style={{ color: theme.accent }}>
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
