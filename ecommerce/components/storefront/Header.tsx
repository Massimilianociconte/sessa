import Link from "next/link";
import AccountMenu from "@/components/storefront/AccountMenu";
import CartWidget from "@/components/storefront/CartWidget";
import { logoutCustomerAction } from "@/lib/actions/account/auth";

type HeaderLocationContext = {
  slug: string;
  name: string;
};

/**
 * Header a nastro terracotta, coerente col sito vetrina.
 * Sulle pagine autenticate il nome può arrivare dal layout. Sulla vetrina il
 * menu legge il cookie visuale (mai usato per auth) lato client: il dato non
 * rende dinamica l'intera pagina e la CDN può quindi cachearla.
 */
export default function Header({
  currentLocation,
  displayName = null
}: {
  currentLocation?: HeaderLocationContext;
  displayName?: string | null;
}) {
  return (
    <header className="brand-ribbon sticky top-0 z-40 text-ivory backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="brand-mark-link group flex min-w-0 items-center gap-3 outline-none" aria-label="Sessa 1930 home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/sessa-logo-white.webp"
            alt="Sessa 1930"
            width={720}
            height={196}
            fetchPriority="high"
            decoding="async"
            className="h-9 w-auto transition group-hover:scale-[1.02] sm:h-10"
          />
          <span className="hidden min-w-0 flex-col leading-none sm:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cream/80">Shop</span>
            <span className="mt-1 max-w-[11rem] truncate text-xs font-medium text-cream/55">Pasticceria e regali</span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 text-sm">
          {currentLocation ? (
            <Link
              href={`/sede/${currentLocation.slug}`}
              className="location-pill hidden rounded-full px-3 py-1.5 text-cream/85 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <span>Sede attiva</span>
              {currentLocation.name}
            </Link>
          ) : (
            <Link
              href="/"
              className="hidden rounded-full px-3 py-1.5 font-medium text-cream/85 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              Sedi
            </Link>
          )}
          <AccountMenu name={displayName} logout={logoutCustomerAction} />
          <CartWidget initialCount={0} currentLocation={currentLocation} />
        </div>
      </div>
    </header>
  );
}
