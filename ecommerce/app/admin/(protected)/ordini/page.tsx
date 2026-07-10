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
  type FulfillmentType,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus
} from "@/lib/domain";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { listOrders, orderFilterStats, type OrderFilter } from "@/lib/services/orders";
import { formatRomeDateTime, romeDayRange } from "@/lib/datetime";
import { requireAdminCapability } from "@/lib/auth/session";
import { hasAdminCapability } from "@/lib/auth/admin-authorization";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ordini" };

function parseDay(value?: string): Date | undefined {
  return value ? romeDayRange(value)?.start : undefined;
}

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
    da?: string;
    a?: string;
    giorno?: string;
    pagina?: string;
    msg?: string;
    err?: string;
  }>;
}) {
  const [sp, user] = await Promise.all([searchParams, requireAdminCapability("orders:manage")]);
  const canExport = hasAdminCapability(user.role, "exports:download");
  const locations = await prisma.location.findMany({ orderBy: { position: "asc" } });

  const status = ORDER_STATUSES.includes(sp.stato as OrderStatus) ? (sp.stato as OrderStatus) : undefined;
  const paymentStatus = PAYMENT_STATUSES.includes(sp.pagamento as PaymentStatus) ? sp.pagamento : undefined;
  const paymentMethod = PAYMENT_METHODS.includes(sp.metodo as PaymentMethod) ? sp.metodo : undefined;
  const fulfillmentType = sp.evasione === "PICKUP" || sp.evasione === "DELIVERY" ? sp.evasione : undefined;
  const locationId = locations.find((l) => l.id === sp.sede)?.id;
  const placedFrom = parseDay(sp.da);
  const placedTo = sp.a ? romeDayRange(sp.a)?.end : undefined;
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);

  const filter: OrderFilter = {
    status,
    query: sp.q,
    locationId,
    paymentStatus,
    paymentMethod,
    fulfillmentType,
    discountCode: sp.codice,
    placedFrom,
    placedTo,
    fulfillmentOn: parseDay(sp.giorno),
    page
  };
  const [{ orders, total, pageCount }, stats] = await Promise.all([
    listOrders(filter),
    orderFilterStats(filter)
  ]);

  // Query string corrente (senza pagina) riusata per export e paginazione.
  const currentParams = new URLSearchParams();
  for (const [key, value] of Object.entries({
    stato: sp.stato,
    q: sp.q,
    sede: sp.sede,
    pagamento: sp.pagamento,
    metodo: sp.metodo,
    evasione: sp.evasione,
    codice: sp.codice,
    da: sp.da,
    a: sp.a,
    giorno: sp.giorno
  })) {
    if (value) currentParams.set(key, value);
  }
  const exportHref = `/admin/ordini/export${currentParams.size ? `?${currentParams.toString()}` : ""}`;
  function pageHref(next: number) {
    const params = new URLSearchParams(currentParams);
    if (next > 1) params.set("pagina", String(next));
    return `/admin/ordini${params.size ? `?${params.toString()}` : ""}`;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold">Ordini</h1>
        {canExport && (
          <a href={exportHref} className="btn-secondary" download>
            Esporta CSV ({stats.total})
          </a>
        )}
      </div>
      <div className="mt-4">
        <Flash msg={sp.msg} err={sp.err} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Ordini filtrati</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Incasso pagato</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{formatCents(stats.revenueCents)}</p>
          <p className="text-xs text-ink/40">{stats.paidCount} ordini pagati</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Da verificare</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{stats.failedCount}</p>
          <p className="text-xs text-ink/40">pagamenti falliti</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Ritiro / consegna</p>
          <p className="mt-1 font-serif text-3xl font-semibold">
            {stats.pickupCount} / {stats.deliveryCount}
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
        <div>
          <label className="label-field">Ritiro/consegna del</label>
          <input type="date" name="giorno" defaultValue={sp.giorno} className="input-field" />
        </div>
        <div>
          <label className="label-field">Ordinato dal</label>
          <input type="date" name="da" defaultValue={sp.da} className="input-field" />
        </div>
        <div>
          <label className="label-field">Ordinato fino al</label>
          <input type="date" name="a" defaultValue={sp.a} className="input-field" />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
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
              <th className="px-4 py-3">Evasione</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3 text-right">Totale</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink/50">
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
                  {formatRomeDateTime(order.placedAt)}
                </td>
                <td className="px-4 py-3 text-ink/60">{order.location?.name ?? order.locationName ?? "—"}</td>
                <td className="px-4 py-3">
                  <p>{order.shipFullName || order.email}</p>
                  <p className="text-xs text-ink/50">{order.email}</p>
                </td>
                <td className="px-4 py-3 text-xs text-ink/60">
                  <p className="font-semibold text-ink">
                    {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType] ?? order.fulfillmentType}
                  </p>
                  <p>
                    {order.fulfillmentAt
                      ? formatRomeDateTime(order.fulfillmentAt)
                      : "Da concordare"}
                  </p>
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

      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginazione ordini">
          <p className="text-ink/50">
            Pagina {page} di {pageCount} · {total} ordini
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="btn-ghost">
                ← Precedente
              </Link>
            ) : (
              <span className="btn-ghost opacity-40">← Precedente</span>
            )}
            {page < pageCount ? (
              <Link href={pageHref(page + 1)} className="btn-ghost">
                Successiva →
              </Link>
            ) : (
              <span className="btn-ghost opacity-40">Successiva →</span>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
