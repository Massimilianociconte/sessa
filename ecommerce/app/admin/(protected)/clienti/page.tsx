import Link from "next/link";
import { formatCents } from "@/lib/money";
import { listCustomers } from "@/lib/services/customers";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clienti" };

export default async function AdminCustomersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const customers = await listCustomers(q);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold">Clienti</h1>
        <form>
          <input name="q" defaultValue={q} placeholder="Cerca nome o email…" className="input-field w-64" />
        </form>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Telefono</th>
              <th className="px-4 py-3">Ordini</th>
              <th className="px-4 py-3">Marketing</th>
              <th className="px-4 py-3 text-right">Valore totale</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink/50">
                  Nessun cliente trovato.
                </td>
              </tr>
            )}
            {customers.map((customer) => (
              <tr key={customer.id} className="border-b border-ink/5 hover:bg-cream/50">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/clienti/${customer.id}`}
                    className="font-semibold hover:text-terracotta"
                  >
                    {customer.firstName} {customer.lastName}
                  </Link>
                  <p className="text-xs text-ink/50">{customer.email}</p>
                </td>
                <td className="px-4 py-3 text-ink/60">{customer.phone ?? "—"}</td>
                <td className="px-4 py-3 text-ink/60">{customer.orderCount}</td>
                <td className="px-4 py-3">
                  {customer.marketingOptIn ? (
                    <span className="badge bg-brilliant/15 text-emerald-800">Sì</span>
                  ) : (
                    <span className="badge bg-ink/5 text-ink/40">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold">
                  {formatCents(customer.lifetimeCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
