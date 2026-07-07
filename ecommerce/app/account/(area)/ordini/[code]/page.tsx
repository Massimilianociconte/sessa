import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
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

export default async function AccountOrderDetailPage({
  params
}: {
  params: Promise<{ code: string }>;
}) {
  const [{ code }, customer] = await Promise.all([params, requireCustomer()]);
  const order = await getCustomerOrderByCode(customer.id, code);
  if (!order) notFound();

  const isPickup = order.fulfillmentType === "PICKUP";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/account/ordini" className="btn-ghost text-sm">
          ← I miei ordini
        </Link>
        <h1 className="font-serif text-2xl font-semibold">{order.code}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <section className="card p-5 text-sm">
        <p className="text-ink/60">
          {order.placedAt.toLocaleString("it-IT")} ·{" "}
          {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
          {order.locationName ? ` · ${order.locationName}` : ""}
        </p>
        {order.fulfillmentAt && (
          <p className="mt-1 font-semibold">
            {isPickup ? "Ritiro" : "Consegna"} desiderato: {order.fulfillmentAt.toLocaleString("it-IT")}
          </p>
        )}
        {order.trackingCode && (
          <p className="mt-1">
            Spedizione: <strong>{order.trackingCarrier}</strong> — {order.trackingCode}
          </p>
        )}
      </section>

      <section className="card p-5 text-sm">
        <h2 className="mb-3 font-serif text-xl font-semibold">Articoli</h2>
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
            <span>{formatCents(order.totalCents - order.giftCardCents)}</span>
          </div>
          <p className="text-xs text-ink/40">
            di cui IVA {formatCents(order.taxCents)} ·{" "}
            {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}
          </p>
        </div>
      </section>

      <form action={reorderAction}>
        <input type="hidden" name="orderId" value={order.id} />
        <button type="submit" className="btn-primary">
          Riordina questi prodotti
        </button>
      </form>
    </div>
  );
}
