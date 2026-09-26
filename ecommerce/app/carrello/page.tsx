import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import {
  applyDiscountAction,
  applyGiftCardAction,
  removeCartItemAction,
  removeDiscountAction,
  removeGiftCardAction,
  removeUnavailableAction,
  updateCartItemAction
} from "@/lib/actions/cart";
import CartRefreshBeacon from "@/components/storefront/CartRefreshBeacon";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { getCartGiftCard } from "@/lib/services/cart";
import { getCurrentCartView } from "@/lib/services/cart-session";
import { listStoreProducts } from "@/lib/services/catalog";
import { quoteRatesForCountry } from "@/lib/services/shipping";

export const dynamic = "force-dynamic";

export const metadata = { title: "Carrello", robots: { index: false, follow: false } };

export default async function CartPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string; warn?: string }>;
}) {
  const [{ err, warn }, view, customer] = await Promise.all([searchParams, getCurrentCartView(), getSessionCustomer()]);
  const isEmpty = !view || (view.lines.length === 0 && view.unavailableLines.length === 0);
  const giftCard = view ? await getCartGiftCard(view.cart, customer?.id) : null;
  const discounted = view ? view.subtotalCents - view.discountCents : 0;
  const [rates, catalog] = view
    ? await Promise.all([
        view.cart.location.deliveryEnabled ? quoteRatesForCountry("IT", discounted) : Promise.resolve([]),
        listStoreProducts(view.locationId)
      ])
    : [[], []];
  // Soglia di consegna gratuita più vicina, per un incentivo chiaro nel riepilogo.
  const nextFreeShipping = rates
    .map((rate) => rate.freeAboveCents)
    .filter((threshold): threshold is number => threshold !== null && threshold > discounted)
    .sort((a, b) => a - b)[0];
  const inCart = new Set(view?.lines.map((line) => line.productId) ?? []);
  const suggestions = catalog.filter((product) => !inCart.has(product.id) && product.inStock).slice(0, 3);
  const blocked = Boolean(view && view.unavailableLines.length > 0);

  return (
    <>
      <Header />
      <CartRefreshBeacon />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="font-serif text-4xl font-semibold">Il tuo carrello</h1>
        {view && (
          <p className="mt-1 text-sm text-ink/60">
            Sede: <strong>{view.locationName}</strong> ·{" "}
            <Link href={`/sede/${view.locationSlug}`} className="text-terracotta hover:underline">
              continua a ordinare
            </Link>
          </p>
        )}

        {err && (
          <p className="mt-4 rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
            {err}
          </p>
        )}
        {warn && (
          <p className="mt-4 rounded-xl bg-majolica/20 px-4 py-3 text-sm font-semibold text-ink/80">
            {warn}
          </p>
        )}
        {view?.integrityWarnings?.map((warning) => (
          <p key={warning} className="mt-3 rounded-xl bg-majolica/20 px-4 py-3 text-sm text-ink/70">
            {warning}
          </p>
        ))}

        {isEmpty ? (
          <div className="mt-12 text-center">
            <p className="text-ink/60">Il carrello è vuoto.</p>
            <Link href="/" className="btn-primary mt-6">
              Scegli una sede
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <ul className="space-y-3">
              {view.lines.map((line) => (
                <li key={line.itemId} className="cart-page-line">
                  <div className="tile-frame h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-cream">
                    {line.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={line.image} alt={line.productName} className="h-full w-full object-contain p-1" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/sede/${view.locationSlug}/prodotti/${line.productSlug}`}
                      className="font-serif text-lg font-semibold hover:text-terracotta"
                    >
                      {line.productName}
                    </Link>
                    <p className="text-sm text-ink/60">{line.variantName}</p>
                    <p className="text-sm font-semibold">{formatCents(line.unitCents)}</p>
                  </div>
                  <div className="cart-page-actions">
                    <form action={updateCartItemAction} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <input type="hidden" name="itemId" value={line.itemId} />
                      <input
                        type="number"
                        name="qty"
                        min={0}
                        max={line.maxQty}
                        defaultValue={line.qty}
                        inputMode="numeric"
                        className="input-field w-full sm:w-24"
                        aria-label={`Quantità per ${line.productName}`}
                      />
                      <SubmitButton pendingLabel="Aggiorno…" className="btn-secondary !px-4 text-xs">
                        Aggiorna
                      </SubmitButton>
                    </form>
                    <div className="font-serif text-xl font-bold text-terracotta">{formatCents(line.totalCents)}</div>
                    <form action={removeCartItemAction}>
                      <input type="hidden" name="itemId" value={line.itemId} />
                      <SubmitButton pendingLabel="Rimuovo…" className="btn-ghost text-xs text-terracotta" aria-label={`Rimuovi ${line.productName}`}>
                        Rimuovi
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>

            {view.unavailableLines.length > 0 && (
              <div className="card border-terracotta/30 p-4" role="status">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-terracotta">
                    Alcuni prodotti non sono ordinabili ora. Rimuovili per procedere.
                  </p>
                  <form action={removeUnavailableAction}>
                    <SubmitButton pendingLabel="Rimuovo…" className="btn-secondary !px-4 text-xs">
                      Rimuovi non disponibili
                    </SubmitButton>
                  </form>
                </div>
                <ul className="mt-3 divide-y divide-ink/10">
                  {view.unavailableLines.map((line) => (
                    <li key={line.itemId} className="flex items-center justify-between gap-3 py-2 text-sm text-ink/60">
                      <span>
                        {line.qty} × {line.productName} ({line.variantName})
                        <span className="badge ml-2 bg-ink/10 text-ink/60">
                          {line.reason === "sold_out" ? "Esaurito" : "Non più disponibile"}
                        </span>
                      </span>
                      <form action={removeCartItemAction}>
                        <input type="hidden" name="itemId" value={line.itemId} />
                        <SubmitButton pendingLabel="…" className="btn-ghost text-xs text-terracotta" aria-label={`Rimuovi ${line.productName}`}>
                          Rimuovi
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card p-4">
              {view.discountCode && !view.discountWarning ? (
                <div className="flex items-center justify-between text-sm">
                  <p>
                    Codice <strong>{view.discountCode}</strong> applicato: −{formatCents(view.discountCents)}
                  </p>
                  <form action={removeDiscountAction}>
                    <SubmitButton pendingLabel="Rimuovo…" className="btn-ghost text-xs text-terracotta">
                      Rimuovi
                    </SubmitButton>
                  </form>
                </div>
              ) : (
                <form action={applyDiscountAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="code" className="label-field">
                      Codice sconto
                    </label>
                    <input id="code" name="code" className="input-field uppercase" placeholder="Inserisci il codice" />
                  </div>
                  <SubmitButton pendingLabel="Applico…" className="btn-secondary">
                    Applica
                  </SubmitButton>
                </form>
              )}
              {view.discountWarning && (
                <p className="mt-2 text-xs font-semibold text-terracotta">{view.discountWarning}</p>
              )}
            </div>

            <div className="card p-4">
              {giftCard && giftCard.valid ? (
                <div className="flex items-center justify-between text-sm">
                  <p>
                    Gift card <strong>{giftCard.code}</strong> — saldo {formatCents(giftCard.balanceCents)}
                    <span className="block text-xs text-ink/50">Applicata all'importo dovuto al checkout.</span>
                  </p>
                  <form action={removeGiftCardAction}>
                    <SubmitButton pendingLabel="Rimuovo…" className="btn-ghost text-xs text-terracotta">
                      Rimuovi
                    </SubmitButton>
                  </form>
                </div>
              ) : (
                <form action={applyGiftCardAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor="giftCardCode" className="label-field">
                      Gift card
                    </label>
                    <input id="giftCardCode" name="giftCardCode" className="input-field uppercase" placeholder="GIFT-XXXX-XXXX" />
                  </div>
                  <SubmitButton pendingLabel="Applico…" className="btn-secondary">
                    Applica
                  </SubmitButton>
                </form>
              )}
              {giftCard && !giftCard.valid && (
                <p className="mt-2 text-xs font-semibold text-terracotta">{giftCard.reason}</p>
              )}
            </div>

            <div className="cart-page-summary card space-y-2 p-6 text-sm">
              <div className="flex justify-between">
                <span className="text-ink/60">Subtotale</span>
                <span className="font-semibold">{formatCents(view.subtotalCents)}</span>
              </div>
              {view.discountCents > 0 && (
                <div className="flex justify-between text-brilliant">
                  <span>Sconto</span>
                  <span>−{formatCents(view.discountCents)}</span>
                </div>
              )}
              {giftCard?.valid && giftCard.balanceCents > 0 && (
                <div className="flex justify-between text-ceramic">
                  <span>Gift card {giftCard.code}</span>
                  <span>
                    −{formatCents(Math.min(giftCard.balanceCents, Math.max(0, view.subtotalCents - view.discountCents)))}
                  </span>
                </div>
              )}
              <p className="text-xs text-ink/40">Consegna calcolata al checkout (il ritiro in sede è gratuito).</p>
              {nextFreeShipping !== undefined && (
                <p className="rounded-xl bg-brilliant/10 px-3 py-2 text-xs font-semibold text-emerald-800">
                  Ti mancano {formatCents(nextFreeShipping - discounted)} per la consegna gratuita.
                </p>
              )}
              <div className="flex justify-between border-t border-ink/10 pt-3 text-base font-bold">
                <span>{giftCard?.valid ? "Da pagare (anteprima)" : "Totale parziale"}</span>
                <span>
                  {formatCents(
                    Math.max(
                      0,
                      view.subtotalCents -
                        view.discountCents -
                        (giftCard?.valid ? Math.min(giftCard.balanceCents, view.subtotalCents - view.discountCents) : 0)
                    )
                  )}
                </span>
              </div>
              {blocked || view.lines.length === 0 ? (
                <p className="mt-4 rounded-xl bg-ink/5 px-4 py-3 text-center text-xs font-semibold text-ink/60">
                  Rimuovi i prodotti non disponibili per procedere al checkout.
                </p>
              ) : (
                <Link href="/checkout" className="btn-primary mt-4 w-full">
                  Procedi al checkout
                </Link>
              )}
            </div>

            {suggestions.length > 0 && (
              <section aria-labelledby="cart-suggestions" className="pt-4">
                <h2 id="cart-suggestions" className="font-serif text-2xl font-semibold">
                  Da aggiungere dalla stessa sede
                </h2>
                <ul className="mt-4 grid gap-4 sm:grid-cols-3">
                  {suggestions.map((product) => (
                    <li key={product.id}>
                      <Link
                        href={`/sede/${view.locationSlug}/prodotti/${product.slug}`}
                        className="card flex h-full items-center gap-3 p-3 transition hover:border-terracotta/40"
                      >
                        <span className="tile-frame h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-cream">
                          {product.image && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{product.name}</span>
                          <span className="text-sm text-ink/60">da {formatCents(product.priceMin)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
