import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/admin/Flash";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { saveCustomerNotesAction } from "@/lib/actions/admin/customers";
import { formatCents } from "@/lib/money";
import { getCustomer } from "@/lib/services/customers";
import { requireAdminCapability } from "@/lib/auth/session";
import { formatRomeDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export const metadata = { title: "Scheda cliente" };

export default async function AdminCustomerDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireAdminCapability("customers:manage");
  const [{ id }, { msg, err }] = await Promise.all([params, searchParams]);
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <>
      <div className="flex items-center gap-3">
        <Link href="/admin/clienti" className="btn-ghost text-sm">
          ← Clienti
        </Link>
        <h1 className="font-serif text-3xl font-semibold">
          {customer.firstName} {customer.lastName}
        </h1>
      </div>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="card p-5">
          <h2 className="mb-3 font-serif text-xl font-semibold">Ordini</h2>
          {customer.orders.length === 0 ? (
            <p className="text-sm text-ink/50">Nessun ordine.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {customer.orders.map((order) => (
                  <tr key={order.id} className="border-t border-ink/5">
                    <td className="py-2">
                      <Link
                        href={`/admin/ordini/${order.id}`}
                        className="font-semibold hover:text-terracotta"
                      >
                        {order.code}
                      </Link>
                    </td>
                    <td className="py-2 text-xs text-ink/50">
                      {formatRomeDate(order.placedAt)}
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
          <section className="card p-5 text-sm">
            <h2 className="mb-3 font-serif text-xl font-semibold">Contatti</h2>
            <p>{customer.email}</p>
            {customer.phone && <p>{customer.phone}</p>}
            <p className="mt-2 text-xs text-ink/50">
              Iscritto il {formatRomeDate(customer.createdAt)} · Marketing:{" "}
              {customer.marketingOptIn ? "sì" : "no"}
            </p>
            {customer.addresses.length > 0 && (
              <>
                <p className="mt-3 font-semibold">Ultimo indirizzo</p>
                <p className="text-ink/60">
                  {customer.addresses[0].line1}, {customer.addresses[0].postalCode}{" "}
                  {customer.addresses[0].city} ({customer.addresses[0].province})
                </p>
              </>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Note interne</h2>
            <form action={saveCustomerNotesAction} className="space-y-2">
              <input type="hidden" name="id" value={customer.id} />
              <textarea
                name="notes"
                maxLength={2000}
                rows={4}
                defaultValue={customer.notes ?? ""}
                className="input-field"
                placeholder="Preferenze, richieste particolari…"
              />
              <button type="submit" className="btn-secondary w-full">
                Salva note
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
