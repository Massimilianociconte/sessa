import Link from "next/link";
import Flash from "@/components/admin/Flash";
import { adjustStockAction } from "@/lib/actions/admin/inventory";
import { STOCK_REASON_LABELS, type StockReason } from "@/lib/domain";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { effectivePrice } from "@/lib/services/catalog";
import { listInventory, listRecentMovements } from "@/lib/services/inventory";

export const dynamic = "force-dynamic";

export const metadata = { title: "Magazzino" };

export default async function AdminInventoryPage({
  searchParams
}: {
  searchParams: Promise<{ sede?: string; q?: string; soglia?: string; msg?: string; err?: string }>;
}) {
  const { sede, q, soglia, msg, err } = await searchParams;
  const locations = await prisma.location.findMany({ orderBy: { position: "asc" } });
  const locationId = locations.find((l) => l.id === sede)?.id;
  const lowOnly = soglia === "1";
  const [variants, movements] = await Promise.all([
    listInventory({ locationId, query: q, lowOnly }),
    listRecentMovements(40, locationId)
  ]);
  const backParams = new URLSearchParams();
  if (locationId) backParams.set("sede", locationId);
  if (q) backParams.set("q", q);
  if (lowOnly) backParams.set("soglia", "1");
  const backParam = backParams.size ? `?${backParams.toString()}` : "";
  const exportHref = `/admin/magazzino/export${backParam}`;

  function sedeHref(id?: string) {
    const params = new URLSearchParams(backParams);
    if (id) params.set("sede", id);
    else params.delete("sede");
    return `/admin/magazzino${params.size ? `?${params.toString()}` : ""}`;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Magazzino</h1>
          <p className="mt-1 text-sm text-ink/50">Stock per sede. Ogni variazione genera un movimento tracciato.</p>
        </div>
        <a href={exportHref} className="btn-secondary" download>
          Esporta CSV ({variants.length})
        </a>
      </div>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link href={sedeHref()} className={`badge ${!locationId ? "bg-terracotta text-ivory" : "bg-white text-ink/60"}`}>
          Tutte le sedi
        </Link>
        {locations.map((l) => (
          <Link
            key={l.id}
            href={sedeHref(l.id)}
            className={`badge ${locationId === l.id ? "bg-terracotta text-ivory" : "bg-white text-ink/60"}`}
          >
            {l.name}
          </Link>
        ))}
      </div>

      <form className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        {locationId && <input type="hidden" name="sede" value={locationId} />}
        <div className="min-w-56 flex-1">
          <label className="label-field">Cerca prodotto</label>
          <input name="q" defaultValue={q} className="input-field" placeholder="Nome, variante o SKU" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-ink/70">
          <input type="checkbox" name="soglia" value="1" defaultChecked={lowOnly} className="h-4 w-4" />
          Solo sotto soglia
        </label>
        <button type="submit" className="btn-primary">
          Filtra
        </button>
        {(q || lowOnly) && (
          <Link href={`/admin/magazzino${locationId ? `?sede=${locationId}` : ""}`} className="btn-ghost text-sm">
            Azzera
          </Link>
        )}
      </form>

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Sede</th>
              <th className="px-4 py-3">Prodotto / Variante</th>
              <th className="px-4 py-3">Prezzo</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Rettifica</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((sv) => (
              <tr key={sv.id} className={`border-b border-ink/5 ${!sv.isAvailable ? "opacity-50" : ""}`}>
                <td className="px-4 py-3 text-ink/60">{sv.location.name}</td>
                <td className="px-4 py-3">
                  <p className="font-semibold">{sv.variant.product.name}</p>
                  <p className="text-xs text-ink/50">{sv.variant.name} · {sv.variant.sku}</p>
                </td>
                <td className="px-4 py-3">{formatCents(effectivePrice(sv.priceCentsOverride, sv.variant.basePriceCents))}</td>
                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      sv.stockQty === 0
                        ? "bg-terracotta/15 text-terracotta"
                        : sv.stockQty <= sv.lowStockThreshold
                          ? "bg-majolica/30 text-yellow-900"
                          : "bg-brilliant/15 text-emerald-800"
                    }`}
                  >
                    {sv.stockQty} pz
                  </span>
                </td>
                <td className="px-4 py-3">
                  <form action={adjustStockAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="storeVariantId" value={sv.id} />
                    <input type="hidden" name="back" value={`/admin/magazzino${backParam}`} />
                    <select name="direction" className="input-field !w-auto !py-1.5 text-xs">
                      <option value="add">+ Carico</option>
                      <option value="remove">− Scarico</option>
                    </select>
                    <input type="number" name="qty" min={1} placeholder="Qtà" required className="input-field !w-20 !py-1.5 text-xs" />
                    <select name="reason" className="input-field !w-auto !py-1.5 text-xs">
                      <option value="RESTOCK">Riassortimento</option>
                      <option value="ADJUSTMENT">Rettifica</option>
                    </select>
                    <button type="submit" className="btn-secondary !px-4 !py-1.5 text-xs">
                      Applica
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card mt-8 p-5">
        <h2 className="mb-3 font-serif text-xl font-semibold">Ultimi movimenti</h2>
        <table className="w-full text-sm">
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-t border-ink/5">
                <td className="py-2 text-xs text-ink/50">
                  {m.createdAt.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="py-2 text-xs text-ink/60">{m.storeVariant.location.name}</td>
                <td className="py-2">
                  {m.storeVariant.variant.product.name} <span className="text-ink/50">· {m.storeVariant.variant.name}</span>
                </td>
                <td className="py-2">
                  <span className={`font-bold ${m.delta > 0 ? "text-emerald-700" : "text-terracotta"}`}>
                    {m.delta > 0 ? `+${m.delta}` : m.delta}
                  </span>
                </td>
                <td className="py-2 text-xs text-ink/60">
                  {STOCK_REASON_LABELS[m.reason as StockReason] ?? m.reason}
                  {m.reference && ` · ${m.reference}`}
                  {m.note && ` · ${m.note}`}
                </td>
                <td className="py-2 text-right text-xs text-ink/40">{m.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
