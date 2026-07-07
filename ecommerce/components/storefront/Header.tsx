import Link from "next/link";
import CartWidget from "@/components/storefront/CartWidget";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { getCurrentCartView } from "@/lib/services/cart-session";

type HeaderLocationContext = {
  slug: string;
  name: string;
};

/** Header a nastro terracotta, coerente col sito vetrina. */
export default async function Header({ currentLocation }: { currentLocation?: HeaderLocationContext }) {
  const [cartView, customer] = await Promise.all([getCurrentCartView(), getSessionCustomer()]);
  const count = cartView?.itemCount ?? 0;
  const cartLocation = cartView ? { slug: cartView.locationSlug, name: cartView.locationName } : undefined;
  const activeLocation = cartView && cartView.itemCount > 0 ? cartLocation : currentLocation ?? cartLocation;

  return (
    <header className="brand-ribbon sticky top-0 z-40 text-ivory backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="group flex min-w-0 items-center gap-3 outline-none" aria-label="Sessa 1930 home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sessa-logo-white.webp" alt="Sessa 1930" className="h-9 w-auto transition group-hover:scale-[1.02] sm:h-10" />
          <span className="hidden min-w-0 flex-col leading-none sm:flex">
            <span className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cream/80">Shop</span>
            <span className="mt-1 max-w-[11rem] truncate text-xs font-medium text-cream/55">Pasticceria e regali</span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-2 text-sm">
          {activeLocation && (
            <Link
              href={`/sede/${activeLocation.slug}`}
              className="hidden rounded-full px-3 py-1.5 text-cream/85 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              {activeLocation.name}
            </Link>
          )}
          <Link
            href="/"
            className="hidden rounded-full px-3 py-1.5 font-medium text-cream/85 transition hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            Sedi
          </Link>
          <Link
            href="/account"
            className="inline-flex min-h-10 items-center rounded-full border border-cream/45 px-3 py-1.5 font-semibold text-cream transition hover:bg-cream hover:text-terracotta sm:px-4"
          >
            {customer ? customer.firstName : "Accedi"}
          </Link>
          <CartWidget initialCount={count} currentLocation={currentLocation} />
        </div>
      </div>
    </header>
  );
}
