import Link from "next/link";
import { AccountEmptyState, AccountPageIntro } from "@/components/account/AccountUi";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import { reorderAction } from "@/lib/actions/account/reorder";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/lib/domain";
import { requireCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { listCustomerOrders } from "@/lib/services/customer-account";
import { formatRomeDate } from "@/lib/datetime";

export const metadata = { title: "I miei ordini" };

export default async function AccountOrdersPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string; q?: string }>;
}) {
  const [{ err, q }, customer] = await Promise.all([searchParams, requireCustomer()]);
  const orders = await listCustomerOrders(customer.id);
  const query = (q ?? "").trim().toLowerCase();
  const filteredOrders = query
    ? orders.filter((order) => {
        const haystack = [
          order.code,
          order.location?.name,
          order.locationName,
          order.paymentStatus,
          order.status,
          ...order.items.map((item) => `${item.productName} ${item.variantName}`)
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : orders;

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Storico ordini"
        title="I miei ordini"
        description="Consulta stato, pagamento, sede e prodotti acquistati. Da qui puoi aprire il dettaglio o riordinare rapidamente."
      />

      {err && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
          {err}
        </p>
      )}

      <form className="account-filter-bar">
        <label className="sr-only" htmlFor="order-search">Cerca ordine</label>
        <input
          id="order-search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Cerca codice, sede, prodotto..."
          className="input-field"
        />
        <button type="submit" className="btn-primary">Cerca</button>
        {query && (
          <Link href="/account/ordini" className="btn-ghost">
            Azzera
          </Link>
        )}
      </form>

      {orders.length === 0 ? (
        <AccountEmptyState
          title="Il tuo primo momento Sessa ti aspetta."
          description="Quando acquisterai online troverai qui stato, ricevuta, prodotti e riordino rapido."
          primary={{ href: "/", label: "Scegli una sede" }}
          secondary={{ href: "/account/indirizzi", label: "Prepara il checkout" }}
        />
      ) : filteredOrders.length === 0 ? (
        <AccountEmptyState
          title="Nessun ordine trovato."
          description="Prova con un codice ordine, una sede o il nome di un prodotto acquistato."
          primary={{ href: "/account/ordini", label: "Mostra tutti" }}
        />
      ) : (
        <div className="account-order-list">
          {filteredOrders.map((order) => {
            const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
            const preview = order.items
              .slice(0, 2)
              .map((item) => `${item.qty}x ${item.productName}`)
              .join(", ");
            return (
              <article key={order.id} className="account-order-card account-order-card-large">
                <div className="account-order-card-main">
                  <div className="account-order-topline">
                    <Link href={`/account/ordini/${order.code}`} className="account-order-code">
                      {order.code}
                    </Link>
                    <span>{formatRomeDate(order.placedAt)}</span>
                  </div>
                  <p>
                    {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
                    {order.location ? ` · ${order.location.name}` : ""} · {itemCount} pz
                  </p>
                  <span className="account-order-products">
                    {preview}
                    {order.items.length > 2 ? ` e altri ${order.items.length - 2}` : ""}
                  </span>
                </div>
                <div className="account-order-statuses">
                  <OrderStatusBadge status={order.status} />
                  <PaymentStatusBadge status={order.paymentStatus} />
                </div>
                <div className="account-order-total">
                  <span>Totale</span>
                  <strong>{formatCents(order.totalCents)}</strong>
                </div>
                <div className="account-order-actions">
                  <Link href={`/account/ordini/${order.code}`} className="btn-secondary !py-2 text-xs">
                    Dettaglio
                  </Link>
                  <form action={reorderAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button type="submit" className="btn-primary !py-2 text-xs">
                      Riordina
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
