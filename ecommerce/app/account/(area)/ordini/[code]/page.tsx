import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountInfoGrid, AccountInfoTile, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import { cancelCustomerOrderAction, requestReturnAction } from "@/lib/actions/account/orders";
import { reorderAction } from "@/lib/actions/account/reorder";
import {
  FULFILLMENT_LABELS,
  PAYMENT_METHOD_LABELS,
  type FulfillmentType,
  type PaymentMethod
} from "@/lib/domain";
import { requireCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { getCustomerOrderByCode } from "@/lib/services/customer-account";
import { formatRomeAppointment, formatRomeDateTime } from "@/lib/datetime";
import { customerCancellation } from "@/lib/commerce/customer-cancellation";
import { getCustomerCancelHours } from "@/lib/services/commerce-settings";
import { prisma } from "@/lib/db";

export const metadata = { title: "Dettaglio ordine" };

const TIMELINE = [
  { key: "received", label: "Ordine ricevuto" },
  { key: "paid", label: "Pagamento confermato" },
  { key: "preparing", label: "In preparazione" },
  { key: "ready", label: "Pronto o in consegna" },
  { key: "completed", label: "Completato" }
];

function completedSteps(status: string, paymentStatus: string) {
  const paid = paymentStatus === "PAID" || paymentStatus === "AUTHORIZED";
  return {
    received: true,
    paid,
    preparing: ["PROCESSING", "READY", "SHIPPED", "DELIVERED"].includes(status),
    ready: ["READY", "SHIPPED", "DELIVERED"].includes(status),
    completed: status === "DELIVERED"
  };
}

export default async function AccountOrderDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ msg?: string; err?: string; confirmReorder?: string }>;
}) {
  const [{ code }, { msg, err, confirmReorder }, customer] = await Promise.all([params, searchParams, requireCustomer()]);
  const order = await getCustomerOrderByCode(customer.id, decodeURIComponent(code));
  if (!order) notFound();
  const returnRequests = await prisma.returnRequest.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, reason: true, adminNote: true, createdAt: true, refundCents: true }
  });

  const isPickup = order.fulfillmentType === "PICKUP";
  const cancelHours = await getCustomerCancelHours();
  const cancellation = customerCancellation(order, new Date(), cancelHours);
  const cancellable = cancellation.allowed;
  const steps = completedSteps(order.status, order.paymentStatus);
  const shippingAddress = [order.shipLine1, order.shipLine2, `${order.shipPostalCode} ${order.shipCity}`.trim(), order.shipProvince]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="account-page-stack">
      <div>
        <Link href="/account/ordini" className="btn-ghost text-sm">
          ← I miei ordini
        </Link>
      </div>

      <AccountPageIntro
        kicker="Dettaglio ordine"
        title={order.code}
        description={`Creato il ${formatRomeDateTime(order.placedAt)} per ${order.locationName || "Sessa 1930"}.`}
      >
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.paymentStatus} />
      </AccountPageIntro>

      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{msg}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{err}</p>}

      <AccountInfoGrid>
        <AccountInfoTile
          label="Sede"
          value={order.locationName || order.location?.name || "Sessa 1930"}
          description={FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
          tone="terracotta"
        />
        <AccountInfoTile
          label={isPickup ? "Ritiro" : "Consegna"}
          value={order.fulfillmentAt ? formatRomeAppointment(order.fulfillmentAt) : "Da confermare"}
          description={isPickup ? "La sede ti aggiornerà quando l'ordine sarà pronto." : shippingAddress || order.shippingMethodName}
          tone="ceramic"
        />
        <AccountInfoTile
          label="Pagamento"
          value={PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod ?? "Da confermare"}
          description={order.paymentRef ? `Rif. ${order.paymentRef}` : `Stato: ${order.paymentStatus.toLowerCase()}`}
          tone="brilliant"
        />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Timeline"
        title="Avanzamento ordine"
        description="Una lettura rapida degli step principali, dall'invio al completamento."
      >
        <ol className="account-timeline">
          {TIMELINE.map((step) => (
            <li key={step.key} data-complete={steps[step.key as keyof typeof steps] ? "true" : "false"}>
              <span aria-hidden="true" />
              <p>{step.label}</p>
            </li>
          ))}
        </ol>
      </AccountPanel>

      <div className="account-detail-grid">
        <AccountPanel eyebrow="Prodotti" title="Articoli acquistati">
          <ul className="account-item-list">
            {order.items.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.productName}</strong>
                  <span>
                    {item.variantName} · {item.qty} pz · {formatCents(item.unitCents)} cad.
                  </span>
                </div>
                <strong>{formatCents(item.totalCents)}</strong>
              </li>
            ))}
          </ul>
        </AccountPanel>

        <AccountPanel eyebrow="Totali" title="Riepilogo pagamento">
          <div className="account-total-list">
            <div>
              <span>Subtotale</span>
              <strong>{formatCents(order.subtotalCents)}</strong>
            </div>
            {order.discountCents > 0 && (
              <div className="is-positive">
                <span>Sconto {order.discountCodeSnapshot && `(${order.discountCodeSnapshot})`}</span>
                <strong>-{formatCents(order.discountCents)}</strong>
              </div>
            )}
            <div>
              <span>{isPickup ? "Ritiro in sede" : `Spedizione (${order.shippingMethodName})`}</span>
              <strong>{order.shippingCents === 0 ? "Gratis" : formatCents(order.shippingCents)}</strong>
            </div>
            {order.giftCardCents > 0 && (
              <div className="is-positive">
                <span>Gift card {order.giftCardCodeSnapshot}</span>
                <strong>-{formatCents(order.giftCardCents)}</strong>
              </div>
            )}
            <div className="account-total-final">
              <span>{order.giftCardCents > 0 ? "Da pagare" : "Totale"}</span>
              <strong>{formatCents(order.totalCents - order.giftCardCents)}</strong>
            </div>
            <p>IVA inclusa: {formatCents(order.taxCents)}</p>
          </div>
        </AccountPanel>
      </div>

      {(order.customerNote || order.trackingCode || !isPickup) && (
        <AccountPanel eyebrow="Dettagli" title="Consegna e note">
          <div className="account-note-grid">
            {!isPickup && (
              <div>
                <span>Indirizzo</span>
                <strong>{shippingAddress || "Indirizzo non disponibile"}</strong>
              </div>
            )}
            {order.customerNote && (
              <div>
                <span>Nota cliente</span>
                <strong>{order.customerNote}</strong>
              </div>
            )}
            {order.trackingCode && (
              <div>
                <span>Tracking</span>
                <strong>
                  {order.trackingCarrier} · {order.trackingCode}
                </strong>
              </div>
            )}
          </div>
        </AccountPanel>
      )}

      {confirmReorder && (
        <form action={reorderAction} className="rounded-2xl border border-terracotta/30 bg-terracotta/5 p-4 text-sm">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="confirmSwitch" value="1" />
          <p className="font-semibold text-terracotta">
            Il carrello contiene prodotti di un&apos;altra sede. Riordinando da {order.locationName} quel carrello verrà svuotato.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="btn-primary">Svuota e riordina</button>
            <Link href="/carrello" className="btn-ghost">Vai al carrello attuale</Link>
          </div>
        </form>
      )}
      <div className="account-actions-row">
        <form action={reorderAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="btn-primary">
            Riordina questi prodotti
          </button>
        </form>
        <Link href={`/ordine/${encodeURIComponent(order.code)}?t=${order.publicToken}`} className="btn-secondary">
          Apri ricevuta
        </Link>
        {cancellable && (
          <form action={cancelCustomerOrderAction}>
            <input type="hidden" name="code" value={order.code} />
            <button type="submit" className="btn-ghost !text-terracotta">
              Annulla ordine
            </button>
          </form>
        )}
      </div>
      <p className="text-xs text-ink/45">
        {cancellable
          ? `Puoi annullare fino a ${cancelHours} ore prima del ritiro o della consegna, finché la sede non inizia la preparazione.${
              order.paymentProvider === "stripe" && order.paymentStatus === "PAID" ? " Il pagamento con carta viene rimborsato automaticamente." : ""
            }`
          : !["CANCELLED", "REFUNDED", "DELIVERED"].includes(order.status)
            ? cancellation.allowed
              ? null
              : cancellation.reason
            : null}
      </p>
      {returnRequests.length > 0 && (
        <AccountPanel title="Segnalazioni">
          <ul className="space-y-2 text-sm">
            {returnRequests.map((request) => (
              <li key={request.id} className="rounded-xl bg-cream px-3 py-2">
                <p className="font-semibold">
                  {request.status === "REQUESTED"
                    ? "In valutazione"
                    : request.status === "APPROVED"
                      ? "Accolta: rimborso in corso"
                      : request.status === "REFUNDED"
                        ? `Accolta e rimborsata${request.refundCents ? ` (${formatCents(request.refundCents)})` : ""}`
                        : "Non accolta"}{" "}
                  · {formatRomeDateTime(request.createdAt)}
                </p>
                <p className="text-ink/60">{request.reason}</p>
                {request.adminNote && request.status !== "REQUESTED" && <p className="text-ink/50">Risposta: {request.adminNote}</p>}
              </li>
            ))}
          </ul>
        </AccountPanel>
      )}
      {order.status === "DELIVERED" && !returnRequests.some((request) => ["REQUESTED", "APPROVED"].includes(request.status)) && (
        <form action={requestReturnAction} className="space-y-3 rounded-2xl border border-ink/10 p-4">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="code" value={order.code} />
          <label htmlFor="returnReason" className="label-field">Segnala un problema con l&apos;ordine</label>
          <p className="text-xs text-ink/50">
            I prodotti freschi non sono soggetti al diritto di recesso, ma ogni difetto di conformità viene valutato dalla sede
            (entro 14 giorni dalla consegna). Descrivi cosa non va.
          </p>
          <textarea id="returnReason" name="reason" required maxLength={500} className="input-field" rows={3} />
          <button type="submit" className="btn-secondary">Invia segnalazione</button>
        </form>
      )}
    </div>
  );
}
