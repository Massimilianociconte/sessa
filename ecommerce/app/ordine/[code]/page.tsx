import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import SubmitButton from "@/components/SubmitButton";
import AnalyticsBeacon from "@/components/storefront/AnalyticsBeacon";
import CartRefreshBeacon from "@/components/storefront/CartRefreshBeacon";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { retryOrderPaymentAction } from "@/lib/actions/order-payment";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type FulfillmentType,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus
} from "@/lib/domain";
import { formatRomeAppointment, formatRomeDateTime } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import { resolveOrderToken } from "@/lib/order-access";
import { isStripeConfigured } from "@/lib/payments";
import { getOrderForTracking } from "@/lib/services/orders";
import { reconcileStripeReturn } from "@/lib/services/payment-attempts";
import { getSetting } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Il tuo ordine", robots: { index: false, follow: false } };

function orderSteps(isPickup: boolean, isPayOnPickup: boolean): OrderStatus[] {
  if (isPayOnPickup) {
    return isPickup
      ? ["CONFIRMED", "PROCESSING", "READY", "DELIVERED"]
      : ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
  }
  return isPickup
    ? ["PENDING_PAYMENT", "PAID", "PROCESSING", "READY", "DELIVERED"]
    : ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
}

export default async function OrderTrackingPage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string; payment?: string; checkout?: string; session_id?: string; ripetuto?: string }>;
}) {
  const [{ code: rawCode }, { t, payment, checkout, session_id: sessionId, ripetuto }, cookieStore] = await Promise.all([
    params,
    searchParams,
    cookies()
  ]);
  const code = decodeURIComponent(rawCode);
  const token = resolveOrderToken(code, t, (name) => cookieStore.get(name)?.value);
  if (!token) notFound();
  let order = await getOrderForTracking(code, token);
  if (!order) notFound();

  // Ritorno da Stripe: verifica immediata lato server (il webhook resta la fonte autoritativa).
  if (checkout === "success" && sessionId && order.status === "PENDING_PAYMENT" && order.paymentProvider === "stripe") {
    await reconcileStripeReturn(order.id, sessionId);
    order = (await getOrderForTracking(code, token)) ?? order;
  }

  const isPickup = order.fulfillmentType === "PICKUP";
  const steps = orderSteps(isPickup, order.paymentMethod === "cash_on_pickup");
  const isCancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  const currentStep = steps.indexOf(order.status as OrderStatus);
  const amountDueCents = Math.max(0, order.totalCents - order.giftCardCents);
  const verifyingPayment = checkout === "success" && order.paymentStatus !== "PAID" && order.status === "PENDING_PAYMENT";
  const canRetryStripePayment =
    !verifyingPayment &&
    isStripeConfigured() &&
    order.status === "PENDING_PAYMENT" &&
    order.paymentProvider === "stripe" &&
    order.paymentMethod === "card" &&
    order.paymentStatus !== "PAID" &&
    amountDueCents > 0;
  const bankInstructions =
    order.status === "PENDING_PAYMENT" && order.paymentMethod === "bank_transfer"
      ? await getSetting("payments.bankTransferInstructions", "Riceverai via email i dati per il bonifico.")
      : null;
  const paymentNotice = verifyingPayment
    ? {
        title: "Stiamo verificando il pagamento",
        body: "Stripe ci sta confermando l'incasso: la pagina si aggiorna da sola tra pochi secondi. Non ripetere il pagamento.",
        className: "border-majolica/50 bg-majolica/15 text-ink"
      }
    : order.paymentStatus === "PAID" && checkout === "success"
      ? {
          title: "Pagamento ricevuto",
          body: "Grazie! Ti abbiamo inviato la conferma via email.",
          className: "border-brilliant/30 bg-brilliant/10 text-emerald-800"
        }
      : payment === "failed" || order.paymentStatus === "FAILED"
        ? {
            title: "Pagamento non completato",
            body: canRetryStripePayment
              ? "L'ordine è salvato ma il pagamento non risulta concluso. Puoi riprovare qui sotto senza creare un nuovo ordine."
              : "Il pagamento non risulta concluso. Contatta la sede indicando il codice ordine.",
            className: "border-terracotta/25 bg-terracotta/10 text-terracotta"
          }
        : payment === "cancelled"
          ? {
              title: "Pagamento annullato",
              body: canRetryStripePayment
                ? "Hai annullato la sessione di pagamento. Puoi riprovare in modo sicuro senza creare un nuovo ordine."
                : "Hai annullato la sessione di pagamento. L'ordine resta rintracciabile con questo codice.",
              className: "border-majolica/50 bg-majolica/15 text-ink"
            }
          : payment === "retry-unavailable"
            ? {
                title: "Nuovo tentativo non disponibile",
                body: "Questo ordine non può essere pagato di nuovo online. Contatta la sede indicando il codice ordine.",
                className: "border-terracotta/25 bg-terracotta/10 text-terracotta"
              }
            : ripetuto
              ? {
                  title: "Ordine già registrato",
                  body: "La tua richiesta era già stata ricevuta: questo è l'ordine creato, nessun duplicato.",
                  className: "border-majolica/50 bg-majolica/15 text-ink"
                }
              : null;
  const location = order.location;

  return (
    <>
      {verifyingPayment && <meta httpEquiv="refresh" content="5" />}
      <Header />
      <CartRefreshBeacon />
      {order.paymentStatus === "PAID" && (
        <AnalyticsBeacon
          event="purchase"
          onceKey={order.code}
          payload={{
            transaction_id: order.code,
            value: amountDueCents / 100,
            coupon: order.discountCodeSnapshot ?? undefined,
            location_id: order.locationId ?? undefined,
            location_name: order.locationName,
            items: order.items.map((item) => ({
              item_id: item.variantId ?? item.sku,
              item_name: item.productName,
              item_variant: item.variantName,
              price: item.unitCents / 100,
              quantity: item.qty,
              location_id: order.locationId ?? undefined,
              location_name: order.locationName
            }))
          }}
        />
      )}
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="font-script text-3xl text-terracotta">Grazie!</p>
        <h1 className="font-serif text-4xl font-semibold">Ordine {order.code}</h1>
        <p className="mt-2 text-ink/60">
          {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
          {order.locationName ? ` · ${order.locationName}` : ""}. Ti abbiamo inviato il riepilogo via email.
        </p>

        {paymentNotice && (
          <div className={`mt-6 rounded-2xl border px-5 py-4 text-sm ${paymentNotice.className}`} role="status">
            <p className="font-serif text-xl font-semibold">{paymentNotice.title}</p>
            <p className="mt-1 leading-6">{paymentNotice.body}</p>
          </div>
        )}

        {canRetryStripePayment && (
          <form action={retryOrderPaymentAction} className="mt-4 rounded-2xl border border-ink/10 bg-white p-4">
            <input type="hidden" name="code" value={order.code} />
            <input type="hidden" name="publicToken" value={order.publicToken} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-serif text-xl font-semibold">Completa il pagamento online</p>
                <p className="mt-1 text-sm text-ink/55">
                  Importo da pagare: <strong>{formatCents(amountDueCents)}</strong>. Il nuovo tentativo non duplica l&apos;ordine.
                </p>
              </div>
              <SubmitButton pendingLabel="Apro Stripe…" className="btn-primary shrink-0">
                Riprova pagamento
              </SubmitButton>
            </div>
          </form>
        )}

        <div className="card mt-8 p-6">
          {isCancelled ? (
            <p className="badge bg-ink/10 text-ink/70">{ORDER_STATUS_LABELS[order.status as OrderStatus]}</p>
          ) : (
            <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold" aria-label="Avanzamento ordine">
              {steps.map((step, i) => (
                <li
                  key={step}
                  aria-current={i === currentStep ? "step" : undefined}
                  className={`badge ${i <= currentStep ? "bg-terracotta text-ivory" : "bg-ink/5 text-ink/40"}`}
                >
                  {ORDER_STATUS_LABELS[step]}
                </li>
              ))}
            </ol>
          )}

          <div className="mt-5 grid gap-4 rounded-2xl bg-cream px-4 py-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">
                {isPickup ? "Ritiro" : "Consegna"}
              </p>
              <p className="mt-1 font-serif text-xl font-semibold">
                {order.fulfillmentAt ? formatRomeAppointment(order.fulfillmentAt) : order.shippingMethodName}
              </p>
              {order.fulfillmentAt && !isCancelled && (
                <a href={`/ordine/${encodeURIComponent(order.code)}/calendario`} className="mt-1 inline-block text-xs font-semibold text-terracotta hover:underline">
                  Aggiungi al calendario
                </a>
              )}
            </div>
            {isPickup && location ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Sede</p>
                <p className="mt-1 font-semibold">Sessa 1930 — {order.locationName}</p>
                <p className="text-ink/65">
                  {location.address}
                  {location.postalCode ? `, ${location.postalCode}` : ""} {location.city}
                </p>
                {location.phone && <p className="text-ink/65">Tel. {location.phone}</p>}
                {location.hours && <p className="text-ink/50">Orari: {location.hours}</p>}
              </div>
            ) : (
              !isPickup && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Indirizzo</p>
                  <p className="mt-1">{order.shipFullName}</p>
                  <p className="text-ink/65">
                    {order.shipLine1}
                    {order.shipLine2 ? `, ${order.shipLine2}` : ""}
                  </p>
                  <p className="text-ink/65">
                    {order.shipPostalCode} {order.shipCity} ({order.shipProvince})
                  </p>
                </div>
              )
            )}
          </div>

          {order.trackingCode && (
            <p className="mt-4 text-sm">
              Spedizione: <strong>{order.trackingCarrier}</strong> — codice <strong>{order.trackingCode}</strong>
            </p>
          )}

          {bankInstructions && (
            <div className="mt-4 rounded-xl bg-cream px-4 py-3 text-sm">
              <p className="font-semibold">Istruzioni per il bonifico</p>
              <p className="mt-1 whitespace-pre-line text-ink/70">{bankInstructions}</p>
              <p className="mt-1 font-semibold">Causale: {order.code}</p>
              {order.stockReservationExpiresAt && (
                <p className="mt-1 text-ink/60">
                  Il bonifico deve risultare accreditato entro {formatRomeDateTime(order.stockReservationExpiresAt)}, altrimenti
                  l&apos;ordine viene annullato.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card mt-6 p-6 text-sm">
          <h2 className="mb-3 font-serif text-2xl font-semibold">Riepilogo</h2>
          <ul className="divide-y divide-ink/10">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between py-2">
                <span>
                  {item.qty} × {item.productName} <span className="text-ink/50">({item.variantName})</span>
                </span>
                <span className="font-semibold">{formatCents(item.totalCents)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-ink/10 pt-3">
            <div className="flex justify-between">
              <span className="text-ink/60">Subtotale</span>
              <span>{formatCents(order.subtotalCents)}</span>
            </div>
            {order.discountCents > 0 && (
              <div className="flex justify-between text-brilliant">
                <span>Sconto {order.discountCodeSnapshot && `(${order.discountCodeSnapshot})`}</span>
                <span>−{formatCents(order.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-ink/60">{isPickup ? "Ritiro in sede" : `Consegna (${order.shippingMethodName})`}</span>
              <span>{order.shippingCents === 0 ? "Gratis" : formatCents(order.shippingCents)}</span>
            </div>
            {order.giftCardCents > 0 && (
              <div className="flex justify-between text-ceramic">
                <span>Gift card {order.giftCardCodeSnapshot}</span>
                <span>−{formatCents(order.giftCardCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <span>{order.giftCardCents > 0 ? "Da pagare" : "Totale"}</span>
              <span>{formatCents(amountDueCents)}</span>
            </div>
            {order.refundedCents > 0 && (
              <div className="flex justify-between text-terracotta">
                <span>Rimborsato</span>
                <span>−{formatCents(order.refundedCents)}</span>
              </div>
            )}
            <p className="text-xs text-ink/45">
              IVA inclusa ({formatCents(order.taxCents)}) ·{" "}
              {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod} ·{" "}
              {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
            </p>
            {order.invoiceRequested && <p className="text-xs text-ink/45">Fattura richiesta: la sede la emetterà con i dati indicati.</p>}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href={`/ordine/${encodeURIComponent(order.code)}/ricevuta`} className="btn-secondary">
            Ricevuta stampabile
          </a>
          <Link href="/" className="btn-ghost">
            Torna allo shop
          </Link>
        </div>
        <p className="mt-6 text-xs text-ink/45">
          Un problema con l&apos;ordine? Contatta la sede{location?.phone ? ` al ${location.phone}` : ""} indicando il codice {order.code}.
          Consulta le <Link href="/condizioni-di-vendita" className="underline">condizioni di vendita</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
