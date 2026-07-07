import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountInfoGrid, AccountInfoTile, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
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
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const [{ code }, customer] = await Promise.all([params, requireCustomer()]);
  const order = await getCustomerOrderByCode(customer.id, code);
  if (!order) notFound();

  const isPickup = order.fulfillmentType === "PICKUP";
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
        description={`Creato il ${order.placedAt.toLocaleString("it-IT")} per ${order.locationName || "Sessa 1930"}.`}
      >
        <OrderStatusBadge status={order.status} />
        <PaymentStatusBadge status={order.paymentStatus} />
      </AccountPageIntro>

      <AccountInfoGrid>
        <AccountInfoTile
          label="Sede"
          value={order.locationName || order.location?.name || "Sessa 1930"}
          description={FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
          tone="terracotta"
        />
        <AccountInfoTile
          label={isPickup ? "Ritiro" : "Consegna"}
          value={order.fulfillmentAt ? order.fulfillmentAt.toLocaleString("it-IT") : "Da confermare"}
          description={isPickup ? "La sede ti aggiornera quando l'ordine sara pronto." : shippingAddress || order.shippingMethodName}
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

      <div className="account-actions-row">
        <form action={reorderAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="btn-primary">
            Riordina questi prodotti
          </button>
        </form>
        <Link href={`/ordine/${order.code}?t=${order.publicToken}`} className="btn-secondary">
          Apri ricevuta
        </Link>
      </div>
    </div>
  );
}
