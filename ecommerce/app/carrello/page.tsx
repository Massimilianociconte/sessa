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
  updateCartItemAction
} from "@/lib/actions/cart";
import { formatCents } from "@/lib/money";
import { getCartGiftCard } from "@/lib/services/cart";
import { getCurrentCartView } from "@/lib/services/cart-session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Carrello", robots: { index: false, follow: false } };

export default async function CartPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [{ err }, view] = await Promise.all([searchParams, getCurrentCartView()]);
  const isEmpty = !view || view.lines.length === 0;
  const giftCard = view ? await getCartGiftCard(view.cart) : null;

  return (
    <>
      <Header />
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
                      Codice sconto / gift card
                    </label>
                    <input id="code" name="code" className="input-field uppercase" placeholder="BENVENUTO10" />
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
              <p className="text-xs text-ink/40">Spedizione calcolata al checkout (gratis per il ritiro).</p>
              <div className="flex justify-between border-t border-ink/10 pt-3 text-base font-bold">
                <span>Totale parziale</span>
                <span>{formatCents(view.subtotalCents - view.discountCents)}</span>
              </div>
              <Link href="/checkout" className="btn-primary mt-4 w-full">
                Procedi al checkout
              </Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
