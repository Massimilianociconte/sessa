import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/lib/domain";
import { formatRomeDate, formatRomeDateTime } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import {
  DASHBOARD_RANGE_LABELS,
  DASHBOARD_RANGES,
  type DashboardRange,
  getDashboardData
} from "@/lib/services/dashboard";

export const metadata = { title: "Dashboard" };

function trendLabel(current: number, previous: number): string | undefined {
  if (previous <= 0) return current > 0 ? "nuovo" : undefined;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "stabile";
  return pct > 0 ? `+${pct}% sul periodo prima` : `${pct}% sul periodo prima`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-1 font-serif text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  );
}

function formatFulfillmentAt(date: Date | null): string {
  if (!date) return "Da concordare";
  return formatRomeDateTime(date);
}

export default async function AdminDashboardPage({
  searchParams
}: {
  searchParams: Promise<{ sede?: string; periodo?: string; denied?: string }>;
}) {
  const sp = await searchParams;
  const range = DASHBOARD_RANGES.includes(sp.periodo as DashboardRange)
    ? (sp.periodo as DashboardRange)
    : "today";
  const data = await getDashboardData({ locationId: sp.sede || undefined, range });
  const activeLocation = data.locations.find((l) => l.id === data.locationId);

  return (
    <>
      {sp.denied && (
        <p className="mb-4 rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta" role="alert">
          {sp.denied}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-ink/50">
            {activeLocation ? `Sede: ${activeLocation.name}` : "Tutte le sedi"} ·{" "}
            {DASHBOARD_RANGE_LABELS[data.range]}
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label-field">Sede</label>
            <select name="sede" defaultValue={data.locationId ?? ""} className="input-field">
              <option value="">Tutte le sedi</option>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.isActive ? "" : " (disattivata)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">Periodo</label>
            <select name="periodo" defaultValue={data.range} className="input-field">
              {DASHBOARD_RANGES.map((r) => (
                <option key={r} value={r}>
                  {DASHBOARD_RANGE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Applica
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Ordini"
          value={String(data.ordersInRange)}
          hint={trendLabel(data.ordersInRange, data.prevOrders)}
        />
        <Kpi
          label="Incasso"
          value={formatCents(data.revenueCents)}
          hint={trendLabel(data.revenueCents, data.prevRevenueCents)}
        />
        <Kpi
          label="Scontrino medio"
          value={data.avgOrderCents > 0 ? formatCents(data.avgOrderCents) : "—"}
          hint="su ordini pagati nel periodo"
        />
        <Kpi
          label="Da gestire"
          value={String(data.pendingCount + data.processingCount + data.readyCount)}
          hint={`${data.pendingCount} da pagare · ${data.processingCount} da evadere · ${data.readyCount} pronti`}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold">Coda di preparazione</h2>
              <Link
                href={`/admin/ordini?stato=PAID${data.locationId ? `&sede=${data.locationId}` : ""}`}
                className="text-sm font-semibold text-terracotta hover:underline"
              >
                Gestisci ordini →
              </Link>
            </div>
            {data.fulfillmentQueue.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink/50">
                Nessun ordine in preparazione: laboratorio libero.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="py-2 pr-3">Ordine</th>
                    <th className="py-2 pr-3">Ritiro / consegna</th>
                    <th className="py-2 pr-3">Contenuto</th>
                    <th className="py-2 text-right">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fulfillmentQueue.map((order) => (
                    <tr key={order.id} className="border-t border-ink/5 align-top">
                      <td className="py-2 pr-3">
                        <Link href={`/admin/ordini/${order.id}`} className="font-semibold hover:text-terracotta">
                          {order.code}
                        </Link>
                        {!data.locationId && (
                          <p className="text-xs text-ink/50">{order.location?.name ?? order.locationName}</p>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-semibold">{formatFulfillmentAt(order.fulfillmentAt)}</p>
                        <p className="text-xs text-ink/50">
                          {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType] ?? order.fulfillmentType}
                        </p>
                      </td>
                      <td className="py-2 pr-3 text-xs text-ink/60">
                        {order.items
                          .slice(0, 3)
                          .map((item) => `${item.qty}× ${item.productName}`)
                          .join(", ")}
                        {order.items.length > 3 ? "…" : ""}
                      </td>
                      <td className="py-2 text-right">
                        <OrderStatusBadge status={order.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold">Ultimi ordini</h2>
              <Link href="/admin/ordini" className="text-sm font-semibold text-terracotta hover:underline">
                Tutti gli ordini →
              </Link>
            </div>
            {data.recentOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink/50">Ancora nessun ordine.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {data.recentOrders.map((order) => (
                    <tr key={order.id} className="border-t border-ink/5">
                      <td className="py-2">
                        <Link href={`/admin/ordini/${order.id}`} className="font-semibold hover:text-terracotta">
                          {order.code}
                        </Link>
                        <p className="text-xs text-ink/50">{order.email}</p>
                      </td>
                      {!data.locationId && (
                        <td className="py-2 text-xs text-ink/50">{order.location?.name ?? order.locationName}</td>
                      )}
                      <td className="py-2 text-xs text-ink/50">{formatRomeDate(order.placedAt)}</td>
                      <td className="py-2">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="py-2 text-right font-semibold">{formatCents(order.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">
              Confronto sedi · {DASHBOARD_RANGE_LABELS[data.range]}
            </h2>
            {data.byLocation.length === 0 ? (
              <p className="text-sm text-ink/50">Nessun incasso nel periodo.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="py-2 pr-3">Sede</th>
                    <th className="py-2 pr-3 text-right">Ordini</th>
                    <th className="py-2 pr-3 text-right">Incasso</th>
                    <th className="py-2 text-right">Scontrino medio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byLocation.map((row) => (
                    <tr
                      key={row.locationId ?? row.locationName}
                      className={`border-t border-ink/5 ${row.locationId === data.locationId ? "bg-cream/60" : ""}`}
                    >
                      <td className="py-2 pr-3">
                        {row.locationId ? (
                          <Link
                            href={`/admin?sede=${row.locationId}&periodo=${data.range}`}
                            className="font-semibold hover:text-terracotta"
                          >
                            {row.locationName}
                          </Link>
                        ) : (
                          <span className="font-semibold">{row.locationName}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{row.orders}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{formatCents(row.revenueCents)}</td>
                      <td className="py-2 text-right text-ink/60">
                        {row.orders > 0 ? formatCents(Math.round(row.revenueCents / row.orders)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Scorte basse</h2>
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-ink/50">Tutto ok: nessuna variante sotto soglia.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.lowStock.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      {v.variant.product.name} <span className="text-ink/50">· {v.variant.name}</span>
                      <span className="block text-xs text-ink/40">{v.location.name}</span>
                    </span>
                    <span
                      className={`badge shrink-0 ${v.stockQty === 0 ? "bg-terracotta/15 text-terracotta" : "bg-majolica/30 text-yellow-900"}`}
                    >
                      {v.stockQty} pz
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/admin/magazzino${data.locationId ? `?sede=${data.locationId}` : ""}`}
              className="mt-3 inline-block text-sm font-semibold text-terracotta hover:underline"
            >
              Vai al magazzino →
            </Link>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">
              Più venduti · {DASHBOARD_RANGE_LABELS[data.range]}
            </h2>
            {data.topItems.length === 0 ? (
              <p className="text-sm text-ink/50">Nessuna vendita registrata.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.topItems.map((item) => (
                  <li key={item.productName} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">{item.productName}</span>
                    <span className="shrink-0 text-right">
                      <span className="font-semibold">{item._sum.qty} pz</span>
                      <span className="block text-xs text-ink/40">{formatCents(item._sum.totalCents ?? 0)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
