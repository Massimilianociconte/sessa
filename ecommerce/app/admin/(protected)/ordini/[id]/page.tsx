import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/admin/Flash";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import {
  saveAdminNoteAction,
  setTrackingAction,
  transitionOrderAction
} from "@/lib/actions/admin/orders";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  type FulfillmentType,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus
} from "@/lib/domain";
import { formatCents } from "@/lib/money";
import { getOrder } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dettaglio ordine" };

export default async function AdminOrderDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [{ id }, { msg, err }] = await Promise.all([params, searchParams]);
  const order = await getOrder(id);
  if (!order) notFound();

  const nextStatuses = ORDER_TRANSITIONS[order.status as OrderStatus] ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/ordini" className="btn-ghost text-sm">
          ← Ordini
        </Link>
        <h1 className="font-serif text-3xl font-semibold">{order.code}</h1>
        <OrderStatusBadge status={order.status} />
        <span className="badge bg-cream text-ink/60">
          {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
        </span>
        {order.locationName && <span className="badge bg-ceramic/10 text-ceramic">{order.locationName}</span>}
      </div>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Articoli</h2>
            <table className="w-full text-sm">
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-t border-ink/5">
                    <td className="py-2">
                      <p className="font-semibold">{item.productName}</p>
                      <p className="text-xs text-ink/50">
                        {item.variantName} · SKU {item.sku}
                      </p>
                    </td>
                    <td className="py-2 text-ink/60">
                      {item.qty} × {formatCents(item.unitCents)}
                    </td>
                    <td className="py-2 text-right font-semibold">{formatCents(item.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 space-y-1 border-t border-ink/10 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink/60">Subtotale</span>
                <span>{formatCents(order.subtotalCents)}</span>
              </div>
              {order.discountCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-ink/60">
                    Sconto {order.discountCodeSnapshot && `(${order.discountCodeSnapshot})`}
                  </span>
                  <span>−{formatCents(order.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ink/60">Spedizione ({order.shippingMethodName})</span>
                <span>{formatCents(order.shippingCents)}</span>
              </div>
              {order.giftCardCents > 0 && (
                <div className="flex justify-between text-ceramic">
                  <span>Gift card {order.giftCardCodeSnapshot}</span>
                  <span>−{formatCents(order.giftCardCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>{order.giftCardCents > 0 ? "Da pagare" : "Totale"}</span>
                <span>{formatCents(order.totalCents - order.giftCardCents)}</span>
              </div>
              <p className="text-xs text-ink/40">
                di cui IVA {formatCents(order.taxCents)} · totale ordine {formatCents(order.totalCents)}
              </p>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Cronologia</h2>
            <ul className="space-y-3 text-sm">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta" />
                  <div>
                    <p>{event.message}</p>
                    <p className="text-xs text-ink/40">
                      {event.createdAt.toLocaleString("it-IT")} · {event.actor}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Azioni</h2>
            {nextStatuses.length === 0 ? (
              <p className="text-sm text-ink/50">Ordine in stato finale: nessuna azione disponibile.</p>
            ) : (
              <div className="space-y-3">
                {nextStatuses.map((to) => (
                  <form key={to} action={transitionOrderAction} className="space-y-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="to" value={to} />
                    {to === "PAID" && (
                      <input
                        name="paymentRef"
                        placeholder="Riferimento pagamento (opzionale)"
                        className="input-field"
                      />
                    )}
                    {(to === "CANCELLED" || to === "REFUNDED") && (
                      <input name="note" placeholder="Motivo (opzionale)" className="input-field" />
                    )}
                    <button
                      type="submit"
                      className={
                        to === "CANCELLED" || to === "REFUNDED" ? "btn-secondary w-full" : "btn-primary w-full"
                      }
                    >
                      Segna come {ORDER_STATUS_LABELS[to].toLowerCase()}
                    </button>
                  </form>
                ))}
                {nextStatuses.includes("CANCELLED") && (
                  <p className="text-xs text-ink/40">
                    L'annullamento da questo stato ricarica automaticamente il magazzino.
                  </p>
                )}
              </div>
            )}
          </section>

          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-serif text-xl font-semibold">Cliente</h2>
            <p className="font-semibold">{order.shipFullName}</p>
            <p className="text-ink/60">{order.email}</p>
            {order.phone && <p className="text-ink/60">{order.phone}</p>}
            <p className="mt-3 font-semibold text-ink">Indirizzo di spedizione</p>
            <p className="text-ink/60">
              {order.shipLine1}
              {order.shipLine2 ? `, ${order.shipLine2}` : ""}
              <br />
              {order.shipPostalCode} {order.shipCity} ({order.shipProvince}) {order.shipCountry}
            </p>
            {order.customer && (
              <Link
                href={`/admin/clienti/${order.customer.id}`}
                className="mt-3 inline-block font-semibold text-terracotta hover:underline"
              >
                Scheda cliente →
              </Link>
            )}
            {order.fulfillmentAt && (
              <>
                <p className="mt-3 font-semibold text-ink">
                  {order.fulfillmentType === "PICKUP" ? "Ritiro richiesto" : "Consegna richiesta"}
                </p>
                <p className="text-ink/60">{order.fulfillmentAt.toLocaleString("it-IT")}</p>
              </>
            )}
            <p className="mt-3 font-semibold text-ink">Pagamento</p>
            <p className="text-ink/60">
              {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod} ·{" "}
              {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
            </p>
            {order.paymentRef && <p className="text-xs text-ink/40">Rif: {order.paymentRef}</p>}
            {order.customerNote && (
              <>
                <p className="mt-3 font-semibold text-ink">Nota del cliente</p>
                <p className="text-ink/60">{order.customerNote}</p>
              </>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Spedizione</h2>
            <form action={setTrackingAction} className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <input
                name="carrier"
                defaultValue={order.trackingCarrier ?? ""}
                placeholder="Corriere (es. BRT)"
                className="input-field"
                required
              />
              <input
                name="code"
                defaultValue={order.trackingCode ?? ""}
                placeholder="Codice tracking"
                className="input-field"
                required
              />
              <button type="submit" className="btn-secondary w-full">
                Salva tracking
              </button>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Nota interna</h2>
            <form action={saveAdminNoteAction} className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <textarea
                name="note"
                rows={3}
                defaultValue={order.adminNote ?? ""}
                className="input-field"
                placeholder="Visibile solo al team"
              />
              <button type="submit" className="btn-secondary w-full">
                Salva nota
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
