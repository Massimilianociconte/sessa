import Link from "next/link";
import Flash from "@/components/admin/Flash";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUSES,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus
} from "@/lib/domain";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { listOrders } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ordini" };

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams: Promise<{
    stato?: string;
    q?: string;
    sede?: string;
    pagamento?: string;
    metodo?: string;
    evasione?: string;
    codice?: string;
    msg?: string;
    err?: string;
  }>;
}) {
  const sp = await searchParams;
  const locations = await prisma.location.findMany({ orderBy: { position: "asc" } });

  const status = ORDER_STATUSES.includes(sp.stato as OrderStatus) ? (sp.stato as OrderStatus) : undefined;
  const paymentStatus = PAYMENT_STATUSES.includes(sp.pagamento as PaymentStatus) ? sp.pagamento : undefined;
  const paymentMethod = PAYMENT_METHODS.includes(sp.metodo as PaymentMethod) ? sp.metodo : undefined;
  const fulfillmentType = sp.evasione === "PICKUP" || sp.evasione === "DELIVERY" ? sp.evasione : undefined;
  const locationId = locations.find((l) => l.id === sp.sede)?.id;

  const orders = await listOrders({
    status,
    query: sp.q,
    locationId,
    paymentStatus,
    paymentMethod,
    fulfillmentType,
    discountCode: sp.codice
  });
  const paidOrders = orders.filter((order) => order.paymentStatus === "PAID");
  const failedOrders = orders.filter((order) => order.paymentStatus === "FAILED");
  const pickupOrders = orders.filter((order) => order.fulfillmentType === "PICKUP");
  const revenueCents = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Ordini</h1>
      <div className="mt-4">
        <Flash msg={sp.msg} err={sp.err} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Ordini filtrati</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Incasso pagato</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{formatCents(revenueCents)}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Da verificare</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{failedOrders.length}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Ritiro / consegna</p>
          <p className="mt-1 font-serif text-3xl font-semibold">
            {pickupOrders.length} / {orders.length - pickupOrders.length}
          </p>
        </div>
      </div>

      <form className="card mt-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label-field">Ricerca operativa</label>
          <input name="q" defaultValue={sp.q} className="input-field" placeholder="Ordine, email, telefono, pagamento" />
        </div>
        <div>
          <label className="label-field">Codice sconto</label>
          <input name="codice" defaultValue={sp.codice} className="input-field uppercase" placeholder="BENVENUTO10" />
        </div>
        <div>
          <label className="label-field">Sede</label>
          <select name="sede" defaultValue={sp.sede ?? ""} className="input-field">
            <option value="">Tutte</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Stato evasione</label>
          <select name="stato" defaultValue={status ?? ""} className="input-field">
            <option value="">Tutti</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Stato pagamento</label>
          <select name="pagamento" defaultValue={paymentStatus ?? ""} className="input-field">
            <option value="">Tutti</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PAYMENT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Metodo pagamento</label>
          <select name="metodo" defaultValue={paymentMethod ?? ""} className="input-field">
            <option value="">Tutti</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-field">Modalità</label>
          <select name="evasione" defaultValue={fulfillmentType ?? ""} className="input-field">
            <option value="">Tutte</option>
            <option value="PICKUP">{FULFILLMENT_LABELS.PICKUP}</option>
            <option value="DELIVERY">{FULFILLMENT_LABELS.DELIVERY}</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="btn-primary">
            Filtra
          </button>
          <Link href="/admin/ordini" className="btn-ghost text-sm">
            Azzera
          </Link>
        </div>
      </form>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Ordine</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Sede</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3 text-right">Totale</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink/50">
                  Nessun ordine trovato.
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-ink/5 hover:bg-cream/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/ordini/${order.id}`} className="font-semibold hover:text-terracotta">
                    {order.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink/60">
                  {order.placedAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3 text-ink/60">{order.location?.name ?? order.locationName ?? "—"}</td>
                <td className="px-4 py-3">
                  <p>{order.shipFullName || order.email}</p>
                  <p className="text-xs text-ink/50">{order.email}</p>
                </td>
                <td className="px-4 py-3 text-xs text-ink/60">
                  <p className="font-semibold text-ink">
                    {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod ?? "—"}
                  </p>
                  <p>{PAYMENT_STATUS_LABELS[order.paymentStatus as PaymentStatus] ?? order.paymentStatus}</p>
                  {order.paymentRef && <p className="mt-1 max-w-[180px] truncate text-ink/35">{order.paymentRef}</p>}
                </td>
                <td className="px-4 py-3">
                  <OrderStatusBadge status={order.status} />
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatCents(order.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
