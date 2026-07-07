import Link from "next/link";
import { notFound } from "next/navigation";
import AnalyticsBeacon from "@/components/storefront/AnalyticsBeacon";
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
import { formatCents } from "@/lib/money";
import { isStripeConfigured } from "@/lib/payments";
import { getOrderForTracking } from "@/lib/services/orders";
import { getSetting } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Il tuo ordine", robots: { index: false, follow: false } };

const STEPS_DELIVERY: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
const STEPS_PICKUP: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "PROCESSING", "READY", "DELIVERED"];

export default async function OrderTrackingPage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string; payment?: string; checkout?: string; session_id?: string }>;
}) {
  const [{ code }, { t, payment, checkout }] = await Promise.all([params, searchParams]);
  if (!t) notFound();
  const order = await getOrderForTracking(code, t);
  if (!order) notFound();

  const isPickup = order.fulfillmentType === "PICKUP";
  const steps = isPickup ? STEPS_PICKUP : STEPS_DELIVERY;
  const isCancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  const currentStep = steps.indexOf(order.status as OrderStatus);
  const amountDueCents = Math.max(0, order.totalCents - order.giftCardCents);
  const canRetryStripePayment =
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
  const paymentNotice =
    payment === "failed" || order.paymentStatus === "FAILED"
      ? {
          title: "Pagamento non completato",
          body: "L'ordine e stato salvato, ma il pagamento non risulta concluso. Puoi contattare la sede indicando il codice ordine o scegliere un metodo alternativo se richiesto dal team.",
          className: "border-terracotta/25 bg-terracotta/10 text-terracotta"
        }
        : payment === "cancelled"
          ? {
              title: "Pagamento annullato",
              body: canRetryStripePayment
                ? "Hai annullato la sessione di pagamento. Puoi riprovare in modo sicuro senza creare un nuovo ordine."
                : "Hai annullato la sessione di pagamento. L'ordine resta rintracciabile: usa questo codice se vuoi completarlo con assistenza della sede.",
              className: "border-majolica/50 bg-majolica/15 text-ink"
            }
          : payment === "retry-unavailable"
            ? {
                title: "Nuovo tentativo non disponibile",
                body: "Questo ordine non puo essere pagato di nuovo online in autonomia. Contatta la sede indicando il codice ordine.",
                className: "border-terracotta/25 bg-terracotta/10 text-terracotta"
              }
            : checkout === "success"
              ? {
                  title: "Pagamento ricevuto",
                  body: "Stiamo aggiornando lo stato del pagamento. Se non lo vedi subito come pagato, il webhook Stripe lo allineera a breve.",
                  className: "border-brilliant/30 bg-brilliant/10 text-emerald-800"
                }
              : null;

  return (
    <>
      <Header />
      {order.paymentStatus === "PAID" && (
        <AnalyticsBeacon
          event="purchase"
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
          {order.locationName ? ` · ${order.locationName}` : ""}. Conserva questo link per seguire lo stato.
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
                  Importo da pagare: <strong>{formatCents(amountDueCents)}</strong>. Il nuovo tentativo non duplica l'ordine.
                </p>
              </div>
              <button type="submit" className="btn-primary shrink-0">
                Riprova pagamento
              </button>
            </div>
          </form>
        )}

        <div className="card mt-8 p-6">
          {isCancelled ? (
            <p className="badge bg-ink/10 text-ink/70">{ORDER_STATUS_LABELS[order.status as OrderStatus]}</p>
          ) : (
            <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {steps.map((step, i) => (
                <li
                  key={step}
                  className={`badge ${i <= currentStep ? "bg-terracotta text-ivory" : "bg-ink/5 text-ink/40"}`}
                >
                  {ORDER_STATUS_LABELS[step]}
                </li>
              ))}
            </ol>
          )}

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
            </div>
          )}

          {isPickup && order.status !== "PENDING_PAYMENT" && !isCancelled && (
            <p className="mt-4 rounded-xl bg-cream px-4 py-3 text-sm">
              Ritiro presso <strong>{order.locationName}</strong>. Ti avviseremo quando l'ordine è pronto.
            </p>
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
              <span className="text-ink/60">{isPickup ? "Ritiro in sede" : `Spedizione (${order.shippingMethodName})`}</span>
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
            <p className="text-xs text-ink/40">
              di cui IVA {formatCents(order.taxCents)} ·{" "}
              {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod} ·{" "}
              {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
            </p>
            {order.paymentRef && (
              <p className="text-xs text-ink/40">Riferimento pagamento: {order.paymentRef}</p>
            )}
          </div>
          {!isPickup && order.shipLine1 && (
            <div className="mt-4 border-t border-ink/10 pt-3 text-ink/60">
              <p className="font-semibold text-ink">Spedizione a</p>
              <p>{order.shipFullName}</p>
              <p>
                {order.shipLine1}
                {order.shipLine2 ? `, ${order.shipLine2}` : ""}
              </p>
              <p>
                {order.shipPostalCode} {order.shipCity} ({order.shipProvince})
              </p>
            </div>
          )}
        </div>

        <Link href="/" className="btn-secondary mt-8">
          Torna allo shop
        </Link>
      </main>
      <Footer />
    </>
  );
}
