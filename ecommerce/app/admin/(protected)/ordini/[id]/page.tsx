import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/admin/Flash";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import {
  resolveReturnAction,
  saveAdminNoteAction,
  setTrackingAction,
  transitionOrderAction
} from "@/lib/actions/admin/orders";
import { hasAdminCapability } from "@/lib/auth/admin-authorization";
import { prisma } from "@/lib/db";
import type { InvoiceData } from "@/lib/commerce/italian-tax-ids";
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
import { formatRomeDateTime, formatRomeSlotShort } from "@/lib/datetime";
import { getOrder } from "@/lib/services/orders";
import { adminLocationScope, requireAdminCapability } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dettaglio ordine" };

export default async function AdminOrderDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [{ id }, { msg, err }, user] = await Promise.all([
    params,
    searchParams,
    requireAdminCapability("orders:manage")
  ]);
  const order = await getOrder(id, adminLocationScope(user));
  if (!order) notFound();
  const canRefund = hasAdminCapability(user.role, "orders:refund");
  const returnRequests = await prisma.returnRequest.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" }
  });
  let invoice: InvoiceData | null = null;
  try {
    invoice = order.invoiceData ? (JSON.parse(order.invoiceData) as InvoiceData) : null;
  } catch {
    invoice = null;
  }
  const isCashOnPickup = order.paymentMethod === "cash_on_pickup" && order.paymentStatus !== "PAID";

  const nextStatuses = (ORDER_TRANSITIONS[order.status as OrderStatus] ?? []).filter((status) => {
    if (status === "READY") return order.fulfillmentType === "PICKUP";
    if (status === "SHIPPED") return order.fulfillmentType === "DELIVERY";
    if (status === "CANCELLED") return order.paymentStatus !== "PAID" && order.paymentStatus !== "PARTIALLY_REFUNDED";
    if (status === "REFUNDED") return canRefund && (order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED");
    if (status === "PAID") return order.paymentProvider === "manual";
    return true;
  });
  const canRecordManualPayment =
    order.paymentProvider === "manual" &&
    order.paymentStatus !== "PAID" &&
    order.status !== "CANCELLED" &&
    order.status !== "REFUNDED" &&
    order.status !== "PENDING_PAYMENT";

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

          {returnRequests.length > 0 && (
            <section className="card border-terracotta/30 p-5">
              <h2 className="mb-3 font-serif text-xl font-semibold">Segnalazioni del cliente</h2>
              <ul className="space-y-4 text-sm">
                {returnRequests.map((request) => (
                  <li key={request.id} className="rounded-xl border border-ink/10 p-3">
                    <p className="font-semibold">
                      {request.status === "REQUESTED"
                        ? "Da valutare"
                        : request.status === "APPROVED"
                          ? "Accolta, rimborso in corso"
                          : request.status === "REFUNDED"
                            ? "Accolta e rimborsata"
                            : "Respinta"}{" "}
                      · {formatRomeDateTime(request.createdAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-ink/70">{request.reason}</p>
                    {request.adminNote && <p className="mt-1 text-xs text-ink/50">Nota: {request.adminNote}</p>}
                    {(request.status === "REQUESTED" || request.status === "APPROVED") && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {canRefund && (
                          <form action={resolveReturnAction} className="space-y-2">
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="decision" value="APPROVED" />
                            <label className="label-field" htmlFor={`refund-${request.id}`}>Rimborso (EUR, vuoto = totale)</label>
                            <input id={`refund-${request.id}`} name="refundAmount" className="input-field" placeholder="es. 12,00" />
                            <input name="note" maxLength={500} className="input-field" placeholder="Messaggio al cliente (opzionale)" />
                            <button type="submit" className="btn-primary w-full">Accogli e rimborsa</button>
                          </form>
                        )}
                        {request.status === "REQUESTED" && (
                          <form action={resolveReturnAction} className="space-y-2">
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="decision" value="REJECTED" />
                            <label className="label-field" htmlFor={`reject-${request.id}`}>Motivazione</label>
                            <input id={`reject-${request.id}`} name="note" maxLength={500} required className="input-field" placeholder="Visibile al cliente" />
                            <button type="submit" className="btn-secondary w-full">Respingi</button>
                          </form>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Cronologia</h2>
            <ul className="space-y-3 text-sm">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-terracotta" />
                  <div>
                    <p>{event.message}</p>
                    <p className="text-xs text-ink/40">
                      {formatRomeDateTime(event.createdAt)} · {event.actor}
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
            {canRecordManualPayment && (
              <form action={transitionOrderAction} className="mb-4 space-y-2 border-b border-ink/10 pb-4">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="to" value="PAID" />
                <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
                  Riferimento incasso
                </label>
                <input
                  name="paymentRef"
                  maxLength={120}
                  placeholder="Scontrino, bonifico o riferimento interno"
                  className="input-field"
                />
                <button type="submit" className="btn-primary w-full">
                  Registra pagamento
                </button>
                <p className="text-xs leading-5 text-ink/45">
                  L'incasso viene registrato senza riportare indietro lo stato di preparazione.
                </p>
              </form>
            )}
            {nextStatuses.length === 0 && !canRecordManualPayment ? (
              <p className="text-sm text-ink/50">Ordine in stato finale: nessuna azione disponibile.</p>
            ) : nextStatuses.length > 0 ? (
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
                      <input name="note" maxLength={500} placeholder="Motivo (opzionale)" className="input-field" />
                    )}
                    <button
                      type="submit"
                      className={
                        to === "CANCELLED" || to === "REFUNDED" ? "btn-secondary w-full" : "btn-primary w-full"
                      }
                    >
                      {to === "DELIVERED" && isCashOnPickup
                        ? "Consegnato e incassato in sede"
                        : `Segna come ${ORDER_STATUS_LABELS[to].toLowerCase()}`}
                    </button>
                  </form>
                ))}
                {nextStatuses.includes("CANCELLED") && (
                  <p className="text-xs text-ink/40">
                    L&apos;annullamento ricarica il magazzino e avvisa il cliente via email.
                  </p>
                )}
                {(nextStatuses.includes("READY") || nextStatuses.includes("SHIPPED") || nextStatuses.includes("DELIVERED")) && (
                  <p className="text-xs text-ink/40">Pronto, spedito e consegnato inviano un&apos;email al cliente.</p>
                )}
              </div>
            ) : null}
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
                <p className="text-ink/60">{formatRomeSlotShort(order.fulfillmentAt)}</p>
              </>
            )}
            <p className="mt-3 font-semibold text-ink">Pagamento</p>
            <p className="text-ink/60">
              {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod} ·{" "}
              {PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}
            </p>
            {order.paymentRef && <p className="text-xs text-ink/40">Rif: {order.paymentRef}</p>}
            {canRefund && (order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_REFUNDED") && (
              <form action={transitionOrderAction} className="mt-3 space-y-2">
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="to" value="REFUNDED" />
                <label className="label-field" htmlFor="refundAmount">Rimborso (EUR, vuoto = totale)</label>
                <input id="refundAmount" name="refundAmount" className="input-field" placeholder="es. 10,00" />
                <button type="submit" className="btn-secondary w-full">Emetti rimborso</button>
                <p className="text-xs text-ink/45">
                  {order.paymentProvider === "stripe"
                    ? "Rimborso automatico sulla carta del cliente tramite Stripe."
                    : "Pagamento manuale: il sistema registra il rimborso, il bonifico o la restituzione in contanti vanno eseguiti dalla sede."}
                </p>
              </form>
            )}
            {invoice && (
              <>
                <p className="mt-3 font-semibold text-ink">Fattura richiesta</p>
                <p className="text-ink/60">{invoice.name}</p>
                {invoice.vatNumber && <p className="text-ink/60">P.IVA {invoice.vatNumber}</p>}
                {invoice.taxCode && <p className="text-ink/60">C.F. {invoice.taxCode}</p>}
                {invoice.sdiCode && <p className="text-ink/60">SDI {invoice.sdiCode}</p>}
                {invoice.pec && <p className="text-ink/60">PEC {invoice.pec}</p>}
                <p className="text-ink/60">{invoice.address}</p>
              </>
            )}
            {order.termsAcceptedAt && (
              <p className="mt-3 text-xs text-ink/40">
                Condizioni {order.termsVersion} accettate il {formatRomeDateTime(order.termsAcceptedAt)}
              </p>
            )}
            {order.customerNote && (
              <>
                <p className="mt-3 font-semibold text-ink">Nota del cliente</p>
                <p className="text-ink/60">{order.customerNote}</p>
              </>
            )}
          </section>

          {order.fulfillmentType === "DELIVERY" && (
          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Spedizione</h2>
            <form action={setTrackingAction} className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <input
                name="carrier"
                maxLength={80}
                defaultValue={order.trackingCarrier ?? ""}
                placeholder="Corriere (es. BRT)"
                className="input-field"
                required
              />
              <input
                name="code"
                maxLength={120}
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
          )}

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Nota interna</h2>
            <form action={saveAdminNoteAction} className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <textarea
                name="note"
                maxLength={2000}
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
