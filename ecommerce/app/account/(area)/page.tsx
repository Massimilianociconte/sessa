import Link from "next/link";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { requireCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { getAccountOverview } from "@/lib/services/customer-account";

export const metadata = { title: "Il mio account" };

export default async function AccountOverviewPage() {
  const customer = await requireCustomer();
  const { orderCount, lastOrders, defaultAddress } = await getAccountOverview(customer.id);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Ordini totali</p>
          <p className="mt-1 font-serif text-3xl font-semibold">{orderCount}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Il tuo codice referral</p>
          <p className="mt-1 font-mono text-lg font-bold">{customer.referralCode ?? "—"}</p>
          <p className="mt-1 text-xs text-ink/40">Presto potrai invitare amici e ottenere sconti.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">Indirizzo predefinito</p>
          {defaultAddress ? (
            <p className="mt-1 text-sm">
              {defaultAddress.line1}, {defaultAddress.postalCode} {defaultAddress.city}
            </p>
          ) : (
            <Link href="/account/indirizzi" className="mt-1 inline-block text-sm font-semibold text-terracotta hover:underline">
              Aggiungi un indirizzo →
            </Link>
          )}
        </div>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">Ultimi ordini</h2>
          <Link href="/account/ordini" className="text-sm font-semibold text-terracotta hover:underline">
            Tutti →
          </Link>
        </div>
        {lastOrders.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink/50">
            Non hai ancora ordini.{" "}
            <Link href="/" className="font-semibold text-terracotta hover:underline">
              Scegli una sede
            </Link>
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {lastOrders.map((order) => (
                <tr key={order.id} className="border-t border-ink/5">
                  <td className="py-2">
                    <Link href={`/account/ordini/${order.code}`} className="font-semibold hover:text-terracotta">
                      {order.code}
                    </Link>
                  </td>
                  <td className="py-2 text-xs text-ink/50">{order.placedAt.toLocaleDateString("it-IT")}</td>
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
    </div>
  );
}
