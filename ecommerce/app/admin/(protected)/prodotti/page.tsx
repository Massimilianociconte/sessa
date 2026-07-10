import Link from "next/link";
import Flash from "@/components/admin/Flash";
import { ProductStatusBadge } from "@/components/admin/StatusBadge";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requireAdminCapability } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Prodotti" };

export default async function AdminProductsPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string; q?: string; page?: string }>;
}) {
  await requireAdminCapability("catalog:manage");
  const { msg, err, q, page } = await searchParams;
  const currentPage = /^\d+$/.test(page ?? "") ? Math.max(1, Number(page)) : 1;
  const pageSize = 50;
  const query = q?.trim().slice(0, 100);
  const where: Prisma.ProductWhereInput | undefined = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
          { tags: { contains: query, mode: "insensitive" } }
        ]
      }
    : undefined;
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: true,
        variants: { include: { storeVariants: { select: { stockQty: true } } } }
      },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize
    }),
    prisma.product.count({ where })
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl font-semibold">Prodotti</h1>
        <div className="flex items-center gap-3">
          <form>
            <input name="q" defaultValue={q} placeholder="Cerca nome, slug, tag…" className="input-field w-56" />
          </form>
          <Link href="/admin/prodotti/nuovo" className="btn-primary">
            + Nuovo prodotto
          </Link>
        </div>
      </div>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Prodotto</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Varianti</th>
              <th className="px-4 py-3">Stock (tutte le sedi)</th>
              <th className="px-4 py-3 text-right">Prezzo base</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const prices = product.variants.map((v) => v.basePriceCents);
              const stock = product.variants.reduce(
                (sum, v) => sum + v.storeVariants.reduce((s, sv) => s + sv.stockQty, 0),
                0
              );
              return (
                <tr key={product.id} className="border-b border-ink/5 hover:bg-cream/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/prodotti/${product.id}`} className="flex items-center gap-3 font-semibold hover:text-terracotta">
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-cream">
                        {product.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.image} alt="" className="h-full w-full object-contain p-0.5" />
                        )}
                      </span>
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{product.category?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <ProductStatusBadge status={product.status} />
                  </td>
                  <td className="px-4 py-3 text-ink/60">{product.variants.length}</td>
                  <td className="px-4 py-3">
                    <span className={stock === 0 ? "font-semibold text-terracotta" : ""}>{stock} pz</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {prices.length === 0
                      ? "—"
                      : Math.min(...prices) === Math.max(...prices)
                        ? formatCents(prices[0])
                        : `${formatCents(Math.min(...prices))} – ${formatCents(Math.max(...prices))}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagine prodotti">
          <Link
            href={`/admin/prodotti?page=${Math.max(1, currentPage - 1)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-disabled={currentPage <= 1}
            className={currentPage <= 1 ? "pointer-events-none text-ink/30" : "btn-ghost"}
          >
            ← Precedenti
          </Link>
          <span className="text-ink/50">Pagina {currentPage} di {pageCount} · {total} prodotti</span>
          <Link
            href={`/admin/prodotti?page=${Math.min(pageCount, currentPage + 1)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            aria-disabled={currentPage >= pageCount}
            className={currentPage >= pageCount ? "pointer-events-none text-ink/30" : "btn-ghost"}
          >
            Successivi →
          </Link>
        </nav>
      )}
    </>
  );
}
