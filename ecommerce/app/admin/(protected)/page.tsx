import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { formatCents } from "@/lib/money";
import { getDashboardData } from "@/lib/services/dashboard";

export const metadata = { title: "Dashboard" };

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</p>
      <p className="mt-1 font-serif text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink/40">{hint}</p>}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const data = await getDashboardData();

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Ordini oggi" value={String(data.ordersToday)} />
        <Kpi label="Incasso oggi" value={formatCents(data.revenueTodayCents)} hint="ordini pagati" />
        <Kpi label="Incasso mese" value={formatCents(data.revenueMonthCents)} hint="ordini pagati" />
        <Kpi
          label="Da gestire"
          value={String(data.pendingCount + data.processingCount)}
          hint={`${data.pendingCount} da pagare · ${data.processingCount} da evadere`}
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[2fr_1fr]">
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
                      <Link
                        href={`/admin/ordini/${order.id}`}
                        className="font-semibold hover:text-terracotta"
                      >
                        {order.code}
                      </Link>
                      <p className="text-xs text-ink/50">{order.email}</p>
                    </td>
                    <td className="py-2 text-xs text-ink/50">
                      {order.placedAt.toLocaleDateString("it-IT")}
                    </td>
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
              href="/admin/magazzino"
              className="mt-3 inline-block text-sm font-semibold text-terracotta hover:underline"
            >
              Vai al magazzino →
            </Link>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Più venduti (30 gg)</h2>
            {data.topItems.length === 0 ? (
              <p className="text-sm text-ink/50">Nessuna vendita registrata.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.topItems.map((item) => (
                  <li key={item.productName} className="flex items-center justify-between">
                    <span>{item.productName}</span>
                    <span className="font-semibold">{item._sum.qty} pz</span>
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
