import Link from "next/link";
import { formatCents } from "@/lib/money";
import { listCustomers } from "@/lib/services/customers";
import { requireAdminCapability } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clienti" };

export default async function AdminCustomersPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdminCapability("customers:manage");
  const { q, page } = await searchParams;
  const currentPage = /^\d+$/.test(page ?? "") ? Math.max(1, Number(page)) : 1;
  const result = await listCustomers(q, currentPage);
  const customers = result.items;

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
      {result.pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagine clienti">
          <Link
            href={`/admin/clienti?page=${Math.max(1, result.page - 1)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-disabled={result.page <= 1}
            className={result.page <= 1 ? "pointer-events-none text-ink/30" : "btn-ghost"}
          >
            ← Precedenti
          </Link>
          <span className="text-ink/50">Pagina {result.page} di {result.pageCount} · {result.total} clienti</span>
          <Link
            href={`/admin/clienti?page=${Math.min(result.pageCount, result.page + 1)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-disabled={result.page >= result.pageCount}
            className={result.page >= result.pageCount ? "pointer-events-none text-ink/30" : "btn-ghost"}
          >
            Successivi →
          </Link>
        </nav>
      )}
    </>
  );
}
