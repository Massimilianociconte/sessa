"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { centsToAnalyticsValue, trackEcommerceEvent, type AnalyticsItem } from "@/lib/analytics";
import { placeOrderAction, type CheckoutState } from "@/lib/actions/checkout";
import { formatCents } from "@/lib/money";

const initialCheckoutState: CheckoutState = { error: null, fieldErrors: {} };

export type CheckoutRate = { id: string; name: string; effectiveCents: number };

export type SavedAddress = {
  id: string;
  label: string | null;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string | null;
};

export type CheckoutAnalyticsLine = {
  productId: string;
  productName: string;
  variantName: string;
  unitCents: number;
  qty: number;
};

type Props = {
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  rates: CheckoutRate[];
  location: {
    id: string;
    name: string;
    address: string;
    city: string;
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
  };
  items: CheckoutAnalyticsLine[];
  customer: { email: string; firstName: string; lastName: string; phone: string | null } | null;
  addresses: SavedAddress[];
  giftCard: { code: string; balanceCents: number } | null;
  stripeEnabled: boolean;
  minWhen: string;
  defaultWhen: string;
};

function Field({
  name,
  label,
  error,
  value,
  onChange,
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
  value?: string;
  onChange?: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  const errorId = `${name}-error`;
  return (
    <div>
      <label htmlFor={name} className="label-field">
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="input-field"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...(onChange ? { value: value ?? "", onChange: (e) => onChange(e.target.value) } : { defaultValue: value })}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs font-semibold text-terracotta">
          {error}
        </p>
      )}
    </div>
  );
}

export default function CheckoutForm({
  subtotalCents,
  discountCents,
  discountCode,
  rates,
  location,
  items,
  customer,
  addresses,
  giftCard,
  stripeEnabled,
  minWhen,
  defaultWhen
}: Props) {
  const [state, formAction, pending] = useActionState(placeOrderAction, initialCheckoutState);
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">(
    location.pickupEnabled ? "PICKUP" : "DELIVERY"
  );
  const [rateId, setRateId] = useState(rates[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash_on_pickup" | "card">("bank_transfer");
  const trackedCheckoutStart = useRef(false);

  const defaults = addresses[0];
  const [addr, setAddr] = useState({
    line1: defaults?.line1 ?? "",
    line2: defaults?.line2 ?? "",
    city: defaults?.city ?? "",
    province: defaults?.province ?? "",
    postalCode: defaults?.postalCode ?? ""
  });

  const isDelivery = fulfillment === "DELIVERY";
  const selectedRate = rates.find((r) => r.id === rateId) ?? rates[0];
  const shippingCents = isDelivery ? selectedRate?.effectiveCents ?? 0 : 0;
  const totalCents = subtotalCents - discountCents + shippingCents;
  const giftCardApplied = giftCard ? Math.min(giftCard.balanceCents, totalCents) : 0;
  const amountDue = totalCents - giftCardApplied;
  const errors = state.fieldErrors;
  const analyticsItems = useMemo<AnalyticsItem[]>(
    () =>
      items.map((item) => ({
        item_id: item.productId,
        item_name: item.productName,
        item_variant: item.variantName,
        price: centsToAnalyticsValue(item.unitCents),
        quantity: item.qty,
        location_id: location.id,
        location_name: location.name
      })),
    [items, location.id, location.name]
  );

  useEffect(() => {
    if (trackedCheckoutStart.current) return;
    trackedCheckoutStart.current = true;
    trackEcommerceEvent("begin_checkout", {
      value: centsToAnalyticsValue(amountDue),
      coupon: discountCode ?? undefined,
      location_id: location.id,
      location_name: location.name,
      items: analyticsItems
    });
  }, [amountDue, analyticsItems, discountCode, location.id, location.name]);

  function applySavedAddress(id: string) {
    const a = addresses.find((x) => x.id === id);
    if (a) setAddr({ line1: a.line1, line2: a.line2 ?? "", city: a.city, province: a.province, postalCode: a.postalCode });
  }

  function choosePaymentMethod(next: "bank_transfer" | "cash_on_pickup" | "card") {
    setPaymentMethod(next);
    trackEcommerceEvent("add_payment_info", {
      value: centsToAnalyticsValue(amountDue),
      payment_type: next,
      coupon: discountCode ?? undefined,
      location_id: location.id,
      location_name: location.name,
      items: analyticsItems
    });
  }

  function trackSubmit() {
    trackEcommerceEvent("checkout_submit", {
      value: centsToAnalyticsValue(amountDue),
      payment_type: paymentMethod,
      coupon: discountCode ?? undefined,
      location_id: location.id,
      location_name: location.name,
      items: analyticsItems
    });
  }

  function choiceClass(active: boolean) {
    return `checkout-choice ${active ? "checkout-choice-active" : ""}`;
  }

  const submitDisabled = pending || (isDelivery && rates.length === 0);

  return (
    <form action={formAction} onSubmit={trackSubmit} className="grid gap-10 pb-28 lg:grid-cols-[1fr_360px] lg:pb-0">
      <div className="space-y-8">
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Garanzie checkout">
          <div className="checkout-trust-card">
            <p className="font-serif text-lg font-semibold">Pagamento tracciato</p>
            <p className="mt-1 text-xs leading-5 text-ink/55">Ogni ordine conserva stato, metodo e riferimento pagamento.</p>
          </div>
          <div className="checkout-trust-card">
            <p className="font-serif text-lg font-semibold">Fresco su orario</p>
            <p className="mt-1 text-xs leading-5 text-ink/55">Ritiro o consegna vengono preparati sulla fascia scelta.</p>
          </div>
          <div className="checkout-trust-card">
            <p className="font-serif text-lg font-semibold">Sede chiara</p>
            <p className="mt-1 text-xs leading-5 text-ink/55">Catalogo e stock restano legati a {location.name}.</p>
          </div>
        </section>

        <section className="checkout-section card space-y-4 p-6">
          <h2 className="font-serif text-2xl font-semibold">Contatti</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              name="email"
              label="Email"
              type="email"
              required
              error={errors.email}
              value={customer?.email}
              readOnly={Boolean(customer)}
              autoComplete="email"
            />
            <Field name="phone" label="Telefono (opzionale)" type="tel" error={errors.phone} value={customer?.phone ?? undefined} autoComplete="tel" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="firstName" label="Nome" required error={errors.firstName} value={customer?.firstName} autoComplete="given-name" />
            <Field name="lastName" label="Cognome" required error={errors.lastName} value={customer?.lastName} autoComplete="family-name" />
          </div>
          {!customer && (
            <p className="text-xs text-ink/50">
              Hai un account? Accedi per usare i tuoi indirizzi salvati e ritrovare lo storico ordini.
            </p>
          )}
        </section>

        <section className="checkout-section card space-y-3 p-6">
          <h2 className="font-serif text-2xl font-semibold">Come vuoi ricevere l'ordine?</h2>
          <input type="hidden" name="fulfillmentType" value={fulfillment} />
          {location.pickupEnabled && (
            <label className={choiceClass(fulfillment === "PICKUP")}>
              <input type="radio" checked={fulfillment === "PICKUP"} onChange={() => setFulfillment("PICKUP")} className="mt-1 accent-terracotta" />
              <span>
                <span className="font-semibold">Ritiro in sede — gratis</span>
                <span className="block text-xs text-ink/50">
                  {location.name}: {location.address}
                  {location.city ? `, ${location.city}` : ""}
                </span>
              </span>
            </label>
          )}
          {location.deliveryEnabled && (
            <label className={choiceClass(fulfillment === "DELIVERY")}>
              <input type="radio" checked={fulfillment === "DELIVERY"} onChange={() => setFulfillment("DELIVERY")} className="mt-1 accent-terracotta" />
              <span>
                <span className="font-semibold">Consegna a domicilio</span>
                <span className="block text-xs text-ink/50">Spedizione calcolata in base al metodo scelto.</span>
              </span>
            </label>
          )}
          <div className="pt-2">
            <label htmlFor="fulfillmentAt" className="label-field">
              {isDelivery ? "Data e ora di consegna desiderata" : "Data e ora di ritiro desiderata"}
            </label>
            <input
              id="fulfillmentAt"
              name="fulfillmentAt"
              type="datetime-local"
              required
              min={minWhen}
              defaultValue={defaultWhen}
              className="input-field"
            />
            {errors.fulfillmentAt && (
              <p role="alert" className="mt-1 text-xs font-semibold text-terracotta">
                {errors.fulfillmentAt}
              </p>
            )}
            <p className="mt-1 text-xs text-ink/40">Prodotti freschi: indica quando ti servono (min 1 ora).</p>
          </div>
        </section>

        {isDelivery && (
          <section className="checkout-section card space-y-4 p-6">
            <h2 className="font-serif text-2xl font-semibold">Indirizzo di consegna</h2>
            {addresses.length > 0 && (
              <div>
                <label className="label-field">Usa un indirizzo salvato</label>
                <select
                  className="input-field"
                  defaultValue={defaults?.id ?? ""}
                  onChange={(e) => applySavedAddress(e.target.value)}
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label || a.fullName} — {a.line1}, {a.city}
                    </option>
                  ))}
                  <option value="">Nuovo indirizzo…</option>
                </select>
              </div>
            )}
            <Field name="line1" label="Indirizzo" error={errors.line1} value={addr.line1} onChange={(v) => setAddr({ ...addr, line1: v })} autoComplete="address-line1" />
            <Field name="line2" label="Scala / interno (opzionale)" error={errors.line2} value={addr.line2} onChange={(v) => setAddr({ ...addr, line2: v })} autoComplete="address-line2" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field name="city" label="Città" error={errors.city} value={addr.city} onChange={(v) => setAddr({ ...addr, city: v })} autoComplete="address-level2" />
              <Field name="province" label="Provincia (sigla)" maxLength={4} error={errors.province} value={addr.province} onChange={(v) => setAddr({ ...addr, province: v })} autoComplete="address-level1" />
              <Field name="postalCode" label="CAP" inputMode="numeric" maxLength={5} error={errors.postalCode} value={addr.postalCode} onChange={(v) => setAddr({ ...addr, postalCode: v })} autoComplete="postal-code" />
            </div>
            <input type="hidden" name="country" value="IT" />
            <fieldset className="space-y-2 pt-2">
              <legend className="label-field">Metodo di spedizione</legend>
              {rates.length === 0 && (
                <p className="text-xs font-semibold text-terracotta">Nessuna spedizione configurata: scegli il ritiro in sede.</p>
              )}
              {rates.map((rate) => (
                <label key={rate.id} className={`${choiceClass(rateId === rate.id)} items-center justify-between`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="shippingRateId" value={rate.id} checked={rateId === rate.id} onChange={() => setRateId(rate.id)} className="accent-terracotta" />
                    {rate.name}
                  </span>
                  <span className="font-bold">{rate.effectiveCents === 0 ? "Gratis" : formatCents(rate.effectiveCents)}</span>
                </label>
              ))}
              {errors.shippingRateId && (
                <p role="alert" className="text-xs font-semibold text-terracotta">
                  {errors.shippingRateId}
                </p>
              )}
            </fieldset>
          </section>
        )}

        <section className="checkout-section card space-y-2 p-6">
          <h2 className="font-serif text-2xl font-semibold">Pagamento</h2>
          {stripeEnabled && (
            <div className="rounded-xl border border-majolica/50 bg-majolica/15 px-4 py-3 text-sm text-ink/70">
              Stripe Checkout puo mostrare automaticamente carta, Link, Apple Pay e Google Pay quando sono abilitati e disponibili sul dispositivo.
            </div>
          )}
          <label className={`${choiceClass(paymentMethod === "bank_transfer")} items-center`}>
            <input
              type="radio"
              name="paymentMethod"
              value="bank_transfer"
              checked={paymentMethod === "bank_transfer"}
              onChange={() => choosePaymentMethod("bank_transfer")}
              className="accent-terracotta"
            />
            <span>
              <span className="font-semibold">Bonifico bancario</span>
              <span className="block text-xs text-ink/50">Ricevi i dati dopo l'ordine; prepariamo alla ricezione.</span>
            </span>
          </label>
          <label className={`${choiceClass(paymentMethod === "cash_on_pickup")} items-center`}>
            <input
              type="radio"
              name="paymentMethod"
              value="cash_on_pickup"
              checked={paymentMethod === "cash_on_pickup"}
              onChange={() => choosePaymentMethod("cash_on_pickup")}
              className="accent-terracotta"
            />
            <span>
              <span className="font-semibold">Pagamento alla consegna / ritiro</span>
              <span className="block text-xs text-ink/50">Paghi quando ricevi o ritiri l'ordine.</span>
            </span>
          </label>
          {stripeEnabled && (
            <label className={`${choiceClass(paymentMethod === "card")} items-center`}>
              <input
                type="radio"
                name="paymentMethod"
                value="card"
                checked={paymentMethod === "card"}
                onChange={() => choosePaymentMethod("card")}
                className="accent-terracotta"
              />
              <span>
                <span className="font-semibold">Carta e wallet rapidi</span>
                <span className="block text-xs text-ink/50">Pagamento sicuro tramite Stripe Checkout.</span>
              </span>
            </label>
          )}
        </section>

        <section className="checkout-section card space-y-3 p-6">
          <label htmlFor="customerNote" className="label-field">
            Note per l'ordine (opzionale)
          </label>
          <textarea id="customerNote" name="customerNote" rows={3} className="input-field" placeholder="Es. dedica sulla torta, senza canditi…" />
          {!customer && (
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input type="checkbox" name="marketingOptIn" className="accent-terracotta" />
              Voglio ricevere novità e offerte da Sessa 1930
            </label>
          )}
        </section>
      </div>

      <aside className="checkout-summary card sticky top-24 h-fit space-y-3 p-6 text-sm">
        <h2 className="font-serif text-2xl font-semibold">Riepilogo</h2>
        <div className="flex justify-between">
          <span className="text-ink/60">Subtotale</span>
          <span className="font-semibold">{formatCents(subtotalCents)}</span>
        </div>
        {discountCents > 0 && (
          <div className="flex justify-between text-brilliant">
            <span>Sconto</span>
            <span>−{formatCents(discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink/60">{isDelivery ? "Spedizione" : "Ritiro in sede"}</span>
          <span className="font-semibold">{shippingCents === 0 ? "Gratis" : formatCents(shippingCents)}</span>
        </div>
        {giftCardApplied > 0 && (
          <div className="flex justify-between text-ceramic">
            <span>Gift card {giftCard?.code}</span>
            <span>−{formatCents(giftCardApplied)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-ink/10 pt-3 text-base font-bold">
          <span>{giftCardApplied > 0 ? "Da pagare" : "Totale"}</span>
          <span>{formatCents(amountDue)}</span>
        </div>
        {amountDue === 0 && giftCardApplied > 0 && (
          <p className="rounded-xl bg-brilliant/10 px-3 py-2 text-xs font-semibold text-emerald-800">
            Ordine interamente coperto dalla gift card.
          </p>
        )}

        {state.error && (
          <p role="alert" className="rounded-xl bg-terracotta/10 px-4 py-3 text-xs font-semibold text-terracotta">{state.error}</p>
        )}

        <button type="submit" disabled={submitDisabled} className="btn-primary w-full">
          {pending ? "Invio in corso…" : "Conferma ordine"}
        </button>
        <p className="text-xs text-ink/40">Confermando accetti le condizioni di vendita. IVA inclusa.</p>
      </aside>

      <div className="checkout-mobile-bar lg:hidden" aria-live="polite">
        <div className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-ink/45">
            {giftCardApplied > 0 ? "Da pagare" : "Totale ordine"}
          </span>
          <strong className="block truncate font-serif text-2xl leading-none text-terracotta">
            {formatCents(amountDue)}
          </strong>
        </div>
        <button type="submit" disabled={submitDisabled} className="btn-primary !px-4">
          {pending ? "Invio…" : "Conferma"}
        </button>
      </div>
    </form>
  );
}
