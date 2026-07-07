import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { reorderAction } from "@/lib/actions/account/reorder";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/lib/domain";
import { requireCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { listCustomerOrders } from "@/lib/services/customer-account";

export const metadata = { title: "I miei ordini" };

export default async function AccountOrdersPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const [{ err }, customer] = await Promise.all([searchParams, requireCustomer()]);
  const orders = await listCustomerOrders(customer.id);

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl font-semibold">I miei ordini</h1>
      {err && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
          {decodeURIComponent(err)}
        </p>
      )}
      {orders.length === 0 ? (
        <p className="card p-8 text-center text-sm text-ink/50">Non hai ancora effettuato ordini.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="card flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/account/ordini/${order.code}`} className="font-serif text-lg font-semibold hover:text-terracotta">
                  {order.code}
                </Link>
                <p className="text-xs text-ink/50">
                  {order.placedAt.toLocaleDateString("it-IT")} ·{" "}
                  {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
                  {order.location ? ` · ${order.location.name}` : ""} ·{" "}
                  {order.items.reduce((s, i) => s + i.qty, 0)} pz
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
              <span className="font-bold">{formatCents(order.totalCents)}</span>
              <form action={reorderAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" className="btn-secondary !py-2 text-xs">
                  Riordina
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
