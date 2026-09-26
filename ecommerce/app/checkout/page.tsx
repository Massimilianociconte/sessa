import Link from "next/link";
import { redirect } from "next/navigation";
import CheckoutForm, { type CheckoutRate, type SavedAddress } from "@/components/storefront/CheckoutForm";
import CartRefreshBeacon from "@/components/storefront/CartRefreshBeacon";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { earliestDateAfterBusinessDays } from "@/lib/commerce/scheduling";
import { formatCents } from "@/lib/money";
import { isStripeConfigured } from "@/lib/payments";
import { applyGiftCardAction, removeGiftCardAction } from "@/lib/actions/cart";
import { getCartGiftCard } from "@/lib/services/cart";
import { getCurrentCartView } from "@/lib/services/cart-session";
import { getCheckoutPolicy } from "@/lib/services/commerce-settings";
import { getEffectiveFulfillmentPreference, listAddresses } from "@/lib/services/customer-account";
import { getSlotOptions, productLeadMinutes } from "@/lib/services/fulfillment-slots";
import { checkoutBlockedReason } from "@/lib/services/launch-readiness";
import { quoteRatesForCountry } from "@/lib/services/shipping";

export const dynamic = "force-dynamic";

export const metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [{ err }, view] = await Promise.all([searchParams, getCurrentCartView()]);
  if (!view || view.lines.length === 0) redirect("/carrello");
  // Righe esaurite o non più vendibili: si decide nel carrello, non al pagamento.
  if (view.unavailableLines.length > 0) redirect("/carrello?err=Rimuovi%20i%20prodotti%20non%20disponibili%20per%20procedere.");

  const storeClosed = await checkoutBlockedReason();
  if (storeClosed) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="font-serif text-4xl font-semibold">Ordini online in arrivo</h1>
          <p className="mt-4 text-ink/65">{storeClosed}</p>
          <Link href="/carrello" className="btn-secondary mt-8">Torna al carrello</Link>
        </main>
        <Footer />
      </>
    );
  }

  const location = view.cart.location;
  const now = new Date();
  const products = view.cart.items.map((item) => item.storeVariant.variant.product);
  const discounted = view.subtotalCents - view.discountCents;
  const [quoted, customer, policy, slotOptions] = await Promise.all([
    location.deliveryEnabled ? quoteRatesForCountry("IT", discounted) : Promise.resolve([]),
    getSessionCustomer(),
    getCheckoutPolicy(),
    getSlotOptions(location, productLeadMinutes(products), now)
  ]);
  const rates: CheckoutRate[] = quoted.map((r) => ({
    id: r.id,
    name: r.name,
    effectiveCents: r.effectiveCents,
    scope: r.scope === "LOCAL" ? "LOCAL" : "NATIONAL"
  }));
  const [addresses, fulfillmentPreference] = customer
    ? await Promise.all([listAddresses(customer.id), getEffectiveFulfillmentPreference(customer.id)])
    : [[] as SavedAddress[], null];
  const cartGiftCard = await getCartGiftCard(view.cart, customer?.id);
  const giftCard = cartGiftCard && cartGiftCard.valid ? { code: cartGiftCard.code, balanceCents: cartGiftCard.balanceCents } : null;

  return (
    <>
      <Header />
      <CartRefreshBeacon />
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

        {view.integrityWarnings.map((warning) => (
          <p key={warning} className="mb-4 rounded-xl bg-majolica/20 px-4 py-3 text-sm font-semibold text-ink/80">
            {warning}
          </p>
        ))}
        {err && (
          <p className="mb-6 rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{err}</p>
        )}

        <section className="card mb-6 space-y-3 p-5">
          <h2 className="font-serif text-xl font-semibold">Gift card</h2>
          <p className="text-sm text-ink/60">
            Il credito si stacca dal totale. Se copre tutto, non serve un altro pagamento. Se copre in parte, scegli come pagare il resto.
          </p>
          {giftCard ? (
            <form action={removeGiftCardAction} className="flex flex-wrap items-center justify-between gap-3">
              <input type="hidden" name="next" value="checkout" />
              <p className="text-sm font-semibold text-ceramic">
                {giftCard.code} · saldo {formatCents(giftCard.balanceCents)}
              </p>
              <button type="submit" className="btn-ghost text-sm">Rimuovi</button>
            </form>
          ) : (
            <form action={applyGiftCardAction} className="flex flex-col gap-3 sm:flex-row">
              <input type="hidden" name="next" value="checkout" />
              <label htmlFor="giftCardCode" className="sr-only">Codice gift card</label>
              <input id="giftCardCode" name="giftCardCode" className="input-field" placeholder="GIFT-XXXX" autoComplete="off" />
              <button type="submit" className="btn-secondary shrink-0">Applica credito</button>
            </form>
          )}
        </section>

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
            deliveryEnabled: location.deliveryEnabled,
            localDeliveryPostalCodes: location.localDeliveryPostalCodes
          }}
          allItemsShippable={products.every((product) => product.shippingScope === "NATIONAL")}
          slotDays={slotOptions.days}
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
          payment={{
            cashMaxCents: policy.cashMaxCents,
            cashMaxAdvanceMs: policy.cashMaxAdvanceDays * 24 * 60 * 60_000,
            cashMaxAdvanceDays: policy.cashMaxAdvanceDays,
            bankEarliestDateKey: earliestDateAfterBusinessDays(now, policy.bankTransferMinBusinessDays),
            bankMinBusinessDays: policy.bankTransferMinBusinessDays
          }}
          nowMs={now.getTime()}
          preferredFulfillment={
            fulfillmentPreference === "PICKUP" || fulfillmentPreference === "DELIVERY"
              ? fulfillmentPreference
              : null
          }
        />
      </main>
      <Footer />
    </>
  );
}
