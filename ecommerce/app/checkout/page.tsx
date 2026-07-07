import Link from "next/link";
import { redirect } from "next/navigation";
import CheckoutForm, { type CheckoutRate, type SavedAddress } from "@/components/storefront/CheckoutForm";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { isStripeConfigured } from "@/lib/payments";
import { getCartGiftCard } from "@/lib/services/cart";
import { getCurrentCartView } from "@/lib/services/cart-session";
import { listAddresses } from "@/lib/services/customer-account";
import { quoteRatesForCountry } from "@/lib/services/shipping";

export const dynamic = "force-dynamic";

export const metadata = { title: "Checkout", robots: { index: false, follow: false } };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function CheckoutPage() {
  const view = await getCurrentCartView();
  if (!view || view.lines.length === 0) redirect("/carrello");

  const location = view.cart.location;
  const discounted = view.subtotalCents - view.discountCents;
  const [quoted, customer] = await Promise.all([
    location.deliveryEnabled ? quoteRatesForCountry("IT", discounted) : Promise.resolve([]),
    getSessionCustomer()
  ]);
  const rates: CheckoutRate[] = quoted.map((r) => ({
    id: r.id,
    name: r.name,
    effectiveCents: r.effectiveCents
  }));
  const addresses: SavedAddress[] = customer ? await listAddresses(customer.id) : [];
  const cartGiftCard = await getCartGiftCard(view.cart, customer?.id);
  const giftCard = cartGiftCard && cartGiftCard.valid ? { code: cartGiftCard.code, balanceCents: cartGiftCard.balanceCents } : null;
  const now = new Date().getTime();
  const minWhen = toLocalInput(new Date(now + 60 * 60 * 1000));
  const defaultWhen = toLocalInput(new Date(now + 2 * 60 * 60 * 1000));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-4xl font-semibold">Checkout</h1>
            <p className="mt-1 text-sm text-ink/60">
              Ordine per la sede <strong>{view.locationName}</strong>
            </p>
          </div>
          <Link href="/carrello" className="btn-ghost w-fit text-sm">
            ← Torna al carrello
          </Link>
        </div>

        <div className="card mb-8 p-4 text-sm">
          <ul className="divide-y divide-ink/10">
            {view.lines.map((line) => (
              <li key={line.itemId} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="min-w-0">
                  {line.qty} × {line.productName} <span className="text-ink/50">({line.variantName})</span>
                </span>
                <span className="font-semibold text-terracotta sm:text-ink">{formatCents(line.totalCents)}</span>
              </li>
            ))}
          </ul>
        </div>

        <CheckoutForm
          subtotalCents={view.subtotalCents}
          discountCents={view.discountCents}
          discountCode={view.discountCode}
          rates={rates}
          location={{
            id: location.id,
            name: location.name,
            address: location.address,
            city: location.city,
            pickupEnabled: location.pickupEnabled,
            deliveryEnabled: location.deliveryEnabled
          }}
          items={view.lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            variantName: line.variantName,
            unitCents: line.unitCents,
            qty: line.qty
          }))}
          customer={
            customer
              ? { email: customer.email, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone }
              : null
          }
          addresses={addresses}
          giftCard={giftCard}
          stripeEnabled={isStripeConfigured()}
          minWhen={minWhen}
          defaultWhen={defaultWhen}
        />
      </main>
      <Footer />
    </>
  );
}
