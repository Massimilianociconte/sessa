"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { centsToAnalyticsValue, trackEcommerceEvent, type AnalyticsItem } from "@/lib/analytics";
import { placeOrderAction, type CheckoutState } from "@/lib/actions/checkout";
import { formatCents } from "@/lib/money";
import { createCheckoutIdempotencyKey } from "@/lib/commerce/checkout-idempotency";
import { allowedShippingScopes, type ShippingScope } from "@/lib/commerce/shipping-scope";
import { submitWithoutReset } from "@/components/submit-without-reset";
import type { SlotDayOption } from "@/lib/services/fulfillment-slots";

const initialCheckoutState: CheckoutState = { error: null, fieldErrors: {} };

type PaymentMethodId = "card" | "bank_transfer" | "cash_on_pickup";

export type CheckoutRate = { id: string; name: string; effectiveCents: number; scope: ShippingScope };

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
    localDeliveryPostalCodes: string;
  };
  allItemsShippable: boolean;
  slotDays: SlotDayOption[];
  items: CheckoutAnalyticsLine[];
  customer: { email: string; firstName: string; lastName: string; phone: string | null } | null;
  addresses: SavedAddress[];
  giftCard: { code: string; balanceCents: number } | null;
  stripeEnabled: boolean;
  payment: {
    cashMaxCents: number;
    cashMaxAdvanceMs: number;
    cashMaxAdvanceDays: number;
    bankEarliestDateKey: string;
    bankMinBusinessDays: number;
  };
  nowMs: number;
  /** Preferenza salvata in area personale (o dedotta dall'ultimo ordine). */
  preferredFulfillment?: "PICKUP" | "DELIVERY" | null;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-semibold text-terracotta">
      {message}
    </p>
  );
}

function TextField({
  name,
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "name">) {
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
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export default function CheckoutForm({
  subtotalCents,
  discountCents,
  discountCode,
  rates,
  location,
  allItemsShippable,
  slotDays,
  items,
  customer,
  addresses,
  giftCard,
  stripeEnabled,
  payment,
  nowMs,
  preferredFulfillment
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(placeOrderAction, initialCheckoutState);
  const [checkoutKey] = useState(() => createCheckoutIdempotencyKey());
  const trackedCheckoutStart = useRef(false);

  // Tutti i campi sono controllati: un errore non cancella mai cio che il cliente ha scritto.
  const [contact, setContact] = useState({
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    firstName: customer?.firstName ?? "",
    lastName: customer?.lastName ?? ""
  });
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">(() => {
    if (preferredFulfillment === "PICKUP" && location.pickupEnabled) return "PICKUP";
    if (preferredFulfillment === "DELIVERY" && location.deliveryEnabled) return "DELIVERY";
    return location.pickupEnabled ? "PICKUP" : "DELIVERY";
  });
  const defaults = addresses[0];
  const [addr, setAddr] = useState({
    line1: defaults?.line1 ?? "",
    line2: defaults?.line2 ?? "",
    city: defaults?.city ?? "",
    province: defaults?.province ?? "",
    postalCode: defaults?.postalCode ?? ""
  });
  const [rateId, setRateId] = useState("");
  const [dateKey, setDateKey] = useState(slotDays[0]?.dateKey ?? "");
  const [slotKey, setSlotKey] = useState("");
  const [chosenMethod, setChosenMethod] = useState<PaymentMethodId>(
    stripeEnabled ? "card" : location.pickupEnabled ? "cash_on_pickup" : "bank_transfer"
  );
  const [note, setNote] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [invoice, setInvoice] = useState({
    requested: false,
    name: "",
    vatNumber: "",
    taxCode: "",
    sdi: "",
    pec: "",
    address: ""
  });

  const isDelivery = fulfillment === "DELIVERY";
  const scopes = allowedShippingScopes({
    allItemsShippable,
    postalCode: addr.postalCode,
    localDeliveryPostalCodes: location.localDeliveryPostalCodes
  });
  const availableRates = rates.filter((rate) => scopes.has(rate.scope));
  const selectedRate = availableRates.find((rate) => rate.id === rateId) ?? availableRates[0] ?? null;
  const needsSlot = !isDelivery || selectedRate?.scope === "LOCAL";

  const currentDay = slotDays.find((day) => day.dateKey === dateKey) ?? slotDays[0] ?? null;
  const firstFreeSlot = currentDay?.slots.find((slot) => !slot.full) ?? null;
  const selectedSlot =
    currentDay?.slots.find((slot) => slot.key === slotKey && !slot.full) ?? firstFreeSlot;

  const shippingCents = isDelivery ? selectedRate?.effectiveCents ?? 0 : 0;
  const totalCents = subtotalCents - discountCents + shippingCents;
  const giftCardApplied = giftCard ? Math.min(giftCard.balanceCents, totalCents) : 0;
  const amountDue = totalCents - giftCardApplied;

  const methodAvailability: Record<PaymentMethodId, { ok: boolean; hint?: string }> = {
    card: stripeEnabled ? { ok: true } : { ok: false, hint: "Momentaneamente non disponibile." },
    cash_on_pickup:
      isDelivery
        ? { ok: false, hint: "Disponibile solo con il ritiro in sede." }
        : amountDue > payment.cashMaxCents
          ? { ok: false, hint: `Disponibile fino a ${formatCents(payment.cashMaxCents)}.` }
          : selectedSlot && selectedSlot.startMs - nowMs > payment.cashMaxAdvanceMs
            ? { ok: false, hint: `Disponibile per ritiri entro ${payment.cashMaxAdvanceDays} giorni.` }
            : { ok: true },
    bank_transfer:
      needsSlot && (selectedSlot ? selectedSlot.key.slice(0, 10) : dateKey) < payment.bankEarliestDateKey
        ? {
            ok: false,
            hint: `Serve una data ad almeno ${payment.bankMinBusinessDays} giorni lavorativi (tempi di accredito).`
          }
        : { ok: true }
  };
  const methodOrder: PaymentMethodId[] = ["card", "cash_on_pickup", "bank_transfer"];
  const paymentMethod: PaymentMethodId = methodAvailability[chosenMethod].ok
    ? chosenMethod
    : methodOrder.find((method) => methodAvailability[method].ok) ?? chosenMethod;
  const noPaymentNeeded = amountDue === 0 && giftCardApplied > 0;
  const phoneRequired = isDelivery || (!noPaymentNeeded && paymentMethod === "cash_on_pickup");

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

  // Totale cambiato lato server: si ricaricano i dati della pagina, lo stato del form resta.
  useEffect(() => {
    if (state.code === "TOTAL_CHANGED" || state.code === "SLOT_FULL" || state.code === "SLOT_UNAVAILABLE") {
      router.refresh();
    }
  }, [state, router]);

  function applySavedAddress(id: string) {
    const a = addresses.find((x) => x.id === id);
    if (a) {
      setAddr({ line1: a.line1, line2: a.line2 ?? "", city: a.city, province: a.province, postalCode: a.postalCode });
      if (a.phone && !contact.phone) setContact((current) => ({ ...current, phone: a.phone ?? "" }));
    }
  }

  function choosePaymentMethod(next: PaymentMethodId) {
    setChosenMethod(next);
    trackEcommerceEvent("add_payment_info", {
      value: centsToAnalyticsValue(amountDue),
      payment_type: next,
      coupon: discountCode ?? undefined,
      location_id: location.id,
      location_name: location.name,
      items: analyticsItems
    });
  }

  function choiceClass(active: boolean, disabled = false) {
    return `checkout-choice ${active ? "checkout-choice-active" : ""} ${disabled ? "opacity-55" : ""}`;
  }

  const deliveryUnavailable = isDelivery && availableRates.length === 0;
  const slotMissing = needsSlot && !selectedSlot;
  const submitDisabled = pending || deliveryUnavailable || slotMissing;
  const dispatch = submitWithoutReset(formAction);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        trackEcommerceEvent("checkout_submit", {
          value: centsToAnalyticsValue(amountDue),
          payment_type: paymentMethod,
          coupon: discountCode ?? undefined,
          location_id: location.id,
          location_name: location.name,
          items: analyticsItems
        });
        dispatch(event);
      }}
      className="grid gap-10 pb-28 lg:grid-cols-[1fr_360px] lg:pb-0"
      noValidate={false}
    >
      <input type="hidden" name="checkoutIdempotencyKey" value={checkoutKey} />
      <input type="hidden" name="expectedAmountDueCents" value={String(amountDue)} />
      <input type="hidden" name="fulfillmentType" value={fulfillment} />
      <input type="hidden" name="country" value="IT" />
      {needsSlot && selectedSlot && <input type="hidden" name="slot" value={selectedSlot.key} />}
      {noPaymentNeeded && <input type="hidden" name="paymentMethod" value={paymentMethod} />}

      <div className="space-y-8">
        <section className="checkout-section card space-y-4 p-6">
          <h2 className="font-serif text-2xl font-semibold">Contatti</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="email"
              label="Email"
              type="email"
              required
              value={contact.email}
              onChange={(email) => setContact({ ...contact, email })}
              error={errors.email}
              readOnly={Boolean(customer)}
              autoComplete="email"
            />
            <TextField
              name="phone"
              label={phoneRequired ? "Telefono" : "Telefono (consigliato)"}
              type="tel"
              required={phoneRequired}
              value={contact.phone}
              onChange={(phone) => setContact({ ...contact, phone })}
              error={errors.phone}
              autoComplete="tel"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="firstName"
              label="Nome"
              required
              value={contact.firstName}
              onChange={(firstName) => setContact({ ...contact, firstName })}
              error={errors.firstName}
              autoComplete="given-name"
            />
            <TextField
              name="lastName"
              label="Cognome"
              required
              value={contact.lastName}
              onChange={(lastName) => setContact({ ...contact, lastName })}
              error={errors.lastName}
              autoComplete="family-name"
            />
          </div>
          {!customer && (
            <p className="text-xs text-ink/50">
              Hai un account?{" "}
              <Link href="/account/login?next=/checkout" className="font-semibold text-terracotta hover:underline">
                Accedi
              </Link>{" "}
              per usare i tuoi indirizzi e ritrovare l&apos;ordine nello storico. Il carrello resta salvato.
            </p>
          )}
        </section>

        <section className="checkout-section card space-y-3 p-6">
          <h2 className="font-serif text-2xl font-semibold">Come vuoi ricevere l&apos;ordine?</h2>
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
                <span className="block text-xs text-ink/50">
                  {allItemsShippable
                    ? "Spedizione con corriere o consegna locale, in base al CAP."
                    : "Prodotti freschi: consegna locale solo nei CAP serviti dalla sede."}
                </span>
              </span>
            </label>
          )}
        </section>

        {isDelivery && (
          <section className="checkout-section card space-y-4 p-6">
            <h2 className="font-serif text-2xl font-semibold">Indirizzo di consegna</h2>
            {addresses.length > 0 && (
              <div>
                <label htmlFor="savedAddress" className="label-field">Usa un indirizzo salvato</label>
                <select
                  id="savedAddress"
                  className="input-field"
                  defaultValue={defaults?.id ?? ""}
                  onChange={(event) => applySavedAddress(event.target.value)}
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
            <TextField name="line1" label="Indirizzo" required value={addr.line1} onChange={(line1) => setAddr({ ...addr, line1 })} error={errors.line1} autoComplete="address-line1" />
            <TextField name="line2" label="Scala / interno / citofono (opzionale)" value={addr.line2} onChange={(line2) => setAddr({ ...addr, line2 })} error={errors.line2} autoComplete="address-line2" />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField name="city" label="Città" required value={addr.city} onChange={(city) => setAddr({ ...addr, city })} error={errors.city} autoComplete="address-level2" />
              <TextField name="province" label="Provincia (sigla)" required maxLength={2} value={addr.province} onChange={(province) => setAddr({ ...addr, province: province.toUpperCase() })} error={errors.province} autoComplete="address-level1" />
              <TextField name="postalCode" label="CAP" required inputMode="numeric" maxLength={5} value={addr.postalCode} onChange={(postalCode) => setAddr({ ...addr, postalCode: postalCode.replace(/\D/g, "") })} error={errors.postalCode} autoComplete="postal-code" />
            </div>
            <fieldset className="space-y-2 pt-2">
              <legend className="label-field">Metodo di consegna</legend>
              {availableRates.length === 0 && (
                <p className="rounded-xl bg-majolica/20 px-4 py-3 text-xs font-semibold text-ink/75">
                  {addr.postalCode.length < 5
                    ? "Inserisci il CAP per vedere le opzioni di consegna."
                    : allItemsShippable
                      ? "Nessuna consegna disponibile per questo CAP: scegli il ritiro in sede."
                      : `I prodotti freschi di ${location.name} non raggiungono il CAP ${addr.postalCode}: scegli il ritiro in sede.`}
                </p>
              )}
              {availableRates.map((rate) => (
                <label key={rate.id} className={`${choiceClass(selectedRate?.id === rate.id)} items-center justify-between`}>
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shippingRateId"
                      value={rate.id}
                      checked={selectedRate?.id === rate.id}
                      onChange={() => setRateId(rate.id)}
                      className="accent-terracotta"
                    />
                    <span>
                      {rate.name}
                      <span className="block text-xs text-ink/50">
                        {rate.scope === "LOCAL" ? "Consegna del fresco dalla sede nella fascia scelta" : "Corriere: consegna stimata indicata nel nome"}
                      </span>
                    </span>
                  </span>
                  <span className="font-bold">{rate.effectiveCents === 0 ? "Gratis" : formatCents(rate.effectiveCents)}</span>
                </label>
              ))}
              <FieldError id="shippingRateId-error" message={errors.shippingRateId} />
            </fieldset>
          </section>
        )}

        {needsSlot && (
          <section className="checkout-section card space-y-4 p-6" aria-labelledby="slot-title">
            <h2 id="slot-title" className="font-serif text-2xl font-semibold">
              {isDelivery ? "Quando consegnare" : "Quando ritirare"}
            </h2>
            {slotDays.length === 0 ? (
              <p className="rounded-xl bg-majolica/20 px-4 py-3 text-sm font-semibold text-ink/75">
                Nessuna fascia disponibile nei prossimi giorni per questa sede. Contatta la sede per un ordine su misura.
              </p>
            ) : (
              <>
                <div>
                  <label htmlFor="slotDay" className="label-field">Giorno</label>
                  <select
                    id="slotDay"
                    className="input-field"
                    value={currentDay?.dateKey ?? ""}
                    onChange={(event) => {
                      setDateKey(event.target.value);
                      setSlotKey("");
                    }}
                  >
                    {slotDays.map((day) => (
                      <option key={day.dateKey} value={day.dateKey} disabled={day.slots.every((slot) => slot.full)}>
                        {day.label}
                        {day.slots.every((slot) => slot.full) ? " — completo" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset>
                  <legend className="label-field">Fascia oraria</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {currentDay?.slots.map((slot) => {
                      const active = selectedSlot?.key === slot.key;
                      return (
                        <label
                          key={slot.key}
                          className={`flex cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                            slot.full
                              ? "cursor-not-allowed border-ink/10 bg-ink/5 text-ink/35 line-through"
                              : active
                                ? "border-terracotta bg-terracotta text-ivory"
                                : "border-ink/15 bg-white hover:border-terracotta"
                          }`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name="slotChoice"
                            value={slot.key}
                            checked={active}
                            disabled={slot.full}
                            onChange={() => setSlotKey(slot.key)}
                          />
                          {slot.label}
                        </label>
                      );
                    })}
                  </div>
                  <FieldError id="slot-error" message={errors.slot} />
                </fieldset>
                <p className="text-xs text-ink/45">
                  Le fasce rispettano orari, chiusure e tempi di preparazione della sede. Le fasce complete non sono selezionabili.
                </p>
              </>
            )}
          </section>
        )}

        <section className="checkout-section card space-y-2 p-6">
          <h2 className="font-serif text-2xl font-semibold">Pagamento</h2>
          {noPaymentNeeded ? (
            <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">
              La gift card copre l&apos;intero ordine. Non serve un altro metodo di pagamento.
            </p>
          ) : (
            <>
              {(
                [
                  { id: "card", title: "Carta e wallet (Apple Pay, Google Pay)", body: "Pagamento sicuro su Stripe: l'ordine è confermato subito." },
                  { id: "cash_on_pickup", title: "Pagamento in sede al ritiro", body: "Paghi in contanti o carta quando ritiri." },
                  { id: "bank_transfer", title: "Bonifico bancario", body: "Prepariamo l'ordine quando il bonifico risulta accreditato." }
                ] as Array<{ id: PaymentMethodId; title: string; body: string }>
              )
                .filter((option) => option.id !== "card" || stripeEnabled)
                .map((option) => {
                  const availability = methodAvailability[option.id];
                  return (
                    <label key={option.id} className={`${choiceClass(paymentMethod === option.id, !availability.ok)} items-center`}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={option.id}
                        checked={paymentMethod === option.id}
                        disabled={!availability.ok}
                        onChange={() => choosePaymentMethod(option.id)}
                        className="accent-terracotta"
                      />
                      <span>
                        <span className="font-semibold">{option.title}</span>
                        <span className="block text-xs text-ink/50">{availability.ok ? option.body : availability.hint}</span>
                      </span>
                    </label>
                  );
                })}
              <FieldError id="paymentMethod-error" message={errors.paymentMethod} />
            </>
          )}
        </section>

        <section className="checkout-section card space-y-4 p-6">
          <div>
            <label htmlFor="customerNote" className="label-field">
              Note per l&apos;ordine (opzionale)
            </label>
            <textarea
              id="customerNote"
              name="customerNote"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="input-field"
              placeholder="Es. dedica sulla torta, senza canditi…"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-ink/75">
            <input
              type="checkbox"
              name="invoiceRequested"
              checked={invoice.requested}
              onChange={(event) => setInvoice({ ...invoice, requested: event.target.checked })}
              className="mt-1 accent-terracotta"
            />
            <span>Richiedo la fattura (azienda o privato con codice fiscale)</span>
          </label>
          {invoice.requested && (
            <div className="grid gap-4 rounded-2xl border border-ink/10 bg-cream/60 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TextField name="invoiceName" label="Ragione sociale o nome e cognome" required value={invoice.name} onChange={(name) => setInvoice({ ...invoice, name })} error={errors.invoiceName} autoComplete="organization" />
              </div>
              <TextField name="invoiceVatNumber" label="Partita IVA (aziende)" inputMode="numeric" value={invoice.vatNumber} onChange={(vatNumber) => setInvoice({ ...invoice, vatNumber })} error={errors.invoiceVatNumber} />
              <TextField name="invoiceTaxCode" label="Codice fiscale" value={invoice.taxCode} onChange={(taxCode) => setInvoice({ ...invoice, taxCode: taxCode.toUpperCase() })} error={errors.invoiceTaxCode} />
              <TextField name="invoiceSdi" label="Codice destinatario SDI" maxLength={7} value={invoice.sdi} onChange={(sdi) => setInvoice({ ...invoice, sdi: sdi.toUpperCase() })} error={errors.invoiceSdi} />
              <TextField name="invoicePec" label="PEC" type="email" value={invoice.pec} onChange={(pec) => setInvoice({ ...invoice, pec })} error={errors.invoicePec} />
              <div className="sm:col-span-2">
                <TextField name="invoiceAddress" label="Indirizzo di fatturazione completo" required value={invoice.address} onChange={(address) => setInvoice({ ...invoice, address })} error={errors.invoiceAddress} autoComplete="street-address" />
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              name="marketingOptIn"
              checked={marketingOptIn}
              onChange={(event) => setMarketingOptIn(event.target.checked)}
              className="mt-1 accent-terracotta"
            />
            <span>
              Voglio ricevere novità e offerte da Sessa 1930 (facoltativo, revocabile in ogni momento). Vedi l&apos;
              <Link href="/privacy" className="text-terracotta underline" target="_blank">informativa privacy</Link>.
            </span>
          </label>
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
            <span>Sconto{discountCode ? ` (${discountCode})` : ""}</span>
            <span>−{formatCents(discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink/60">{isDelivery ? "Consegna" : "Ritiro in sede"}</span>
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
        <p className="text-xs text-ink/45">Prezzi IVA inclusa.</p>
        {needsSlot && selectedSlot && currentDay && (
          <p className="rounded-xl bg-cream px-3 py-2 text-xs font-semibold text-ink/70">
            {isDelivery ? "Consegna" : "Ritiro"}: {currentDay.label}, {selectedSlot.label}
          </p>
        )}

        <label className="flex items-start gap-2 text-xs leading-5 text-ink/70">
          <input
            type="checkbox"
            name="acceptTerms"
            required
            checked={acceptTerms}
            onChange={(event) => setAcceptTerms(event.target.checked)}
            className="mt-0.5 accent-terracotta"
            aria-describedby="acceptTerms-error"
          />
          <span>
            Ho letto e accetto le{" "}
            <Link href="/condizioni-di-vendita" className="font-semibold text-terracotta underline" target="_blank">
              condizioni di vendita
            </Link>{" "}
            e l&apos;
            <Link href="/privacy" className="font-semibold text-terracotta underline" target="_blank">
              informativa privacy
            </Link>
            . I prodotti freschi e deperibili sono esclusi dal diritto di recesso (art. 59 Codice del Consumo).
          </span>
        </label>
        <FieldError id="acceptTerms-error" message={errors.acceptTerms} />

        {state.error && (
          <div role="alert" className="rounded-xl bg-terracotta/10 px-4 py-3 text-xs font-semibold text-terracotta">
            <p>{state.error}</p>
            {state.code === "LOGIN_REQUIRED" && (
              <Link href="/account/login?next=/checkout" className="mt-2 inline-block underline">
                Accedi e completa l&apos;ordine
              </Link>
            )}
          </div>
        )}

        <button type="submit" disabled={submitDisabled} className="btn-primary w-full">
          {pending ? "Invio in corso…" : noPaymentNeeded ? "Conferma l'ordine" : "Ordina con obbligo di pagamento"}
        </button>
        {slotMissing && <p className="text-xs text-ink/50">Scegli una fascia oraria per continuare.</p>}
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
          {pending ? "Invio…" : noPaymentNeeded ? "Conferma" : "Ordina e paga"}
        </button>
      </div>
    </form>
  );
}
