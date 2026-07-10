import Flash from "@/components/admin/Flash";
import {
  createDiscountAction,
  deleteDiscountAction,
  toggleDiscountAction
} from "@/lib/actions/admin/discounts";
import { DISCOUNT_SCOPE_LABELS, type DiscountScope } from "@/lib/domain";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { requireAdminCapability } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sconti" };

export default async function AdminDiscountsPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireAdminCapability("promotions:manage");
  const { msg, err } = await searchParams;
  const [discounts, locations, categories, products] = await Promise.all([
    prisma.discountCode.findMany({
      include: {
        locations: { include: { location: { select: { name: true } } } },
        categories: { include: { category: { select: { name: true } } } },
        products: { include: { product: { select: { name: true } } } }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.location.findMany({ orderBy: { position: "asc" } }),
    prisma.category.findMany({ orderBy: { position: "asc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Codici sconto & promo</h1>
      <p className="mt-1 text-sm text-ink/50">
        Sconti granulari: universali o limitati a sedi, categorie, prodotti, primo ordine, uso per utente.
      </p>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Valore</th>
                <th className="px-4 py-3">Ambito</th>
                <th className="px-4 py-3">Usi</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {discounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink/50">
                    Nessun codice sconto.
                  </td>
                </tr>
              )}
              {discounts.map((d) => {
                const scopeBits: string[] = [DISCOUNT_SCOPE_LABELS[d.scope as DiscountScope] ?? d.scope];
                if (d.locations.length) scopeBits.push("Sedi: " + d.locations.map((l) => l.location.name).join(", "));
                if (d.categories.length) scopeBits.push("Cat: " + d.categories.map((c) => c.category.name).join(", "));
                if (d.products.length) scopeBits.push("Prod: " + d.products.map((p) => p.product.name).join(", "));
                if (d.firstOrderOnly) scopeBits.push("Solo 1° ordine");
                if (d.perUserLimit) scopeBits.push(`Max ${d.perUserLimit}/utente`);
                if (d.minSubtotalCents) scopeBits.push(`Min ${formatCents(d.minSubtotalCents)}`);
                return (
                  <tr key={d.id} className="border-b border-ink/5 align-top">
                    <td className="px-4 py-3">
                      <p className="font-mono font-bold">{d.code}</p>
                      {d.description && <p className="text-xs text-ink/50">{d.description}</p>}
                      {!d.isActive && <span className="badge mt-1 bg-ink/10 text-ink/50">Disattivato</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {d.type === "PERCENT" ? `${(d.value / 100).toLocaleString("it-IT")}%` : formatCents(d.value)}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink/60">{scopeBits.join(" · ")}</td>
                    <td className="px-4 py-3 text-ink/60">
                      {d.usedCount}
                      {d.maxUses ? ` / ${d.maxUses}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <form action={toggleDiscountAction}>
                          <input type="hidden" name="id" value={d.id} />
                          <button type="submit" className="text-xs font-semibold text-ceramic hover:underline">
                            {d.isActive ? "Disattiva" : "Attiva"}
                          </button>
                        </form>
                        <form action={deleteDiscountAction}>
                          <input type="hidden" name="id" value={d.id} />
                          <button type="submit" className="text-xs font-semibold text-terracotta hover:underline">
                            Elimina
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <section className="card h-fit p-6">
          <h2 className="mb-4 font-serif text-xl font-semibold">Nuovo codice</h2>
          <form action={createDiscountAction} className="space-y-3">
            <div>
              <label className="label-field">Codice</label>
              <input name="code" required className="input-field uppercase" placeholder="ES. NATALE25" />
            </div>
            <div>
              <label className="label-field">Descrizione</label>
              <input name="description" className="input-field" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-field">Tipo</label>
                <select name="type" className="input-field">
                  <option value="PERCENT">Percentuale</option>
                  <option value="FIXED">Importo fisso</option>
                </select>
              </div>
              <div>
                <label className="label-field">Valore (% o €)</label>
                <input name="value" required className="input-field" placeholder="10 oppure 5,00" />
              </div>
            </div>
            <div>
              <label className="label-field">Ambito</label>
              <select name="scope" className="input-field" defaultValue="ALL">
                <option value="ALL">Tutta la piattaforma</option>
                <option value="LOCATIONS">Sedi selezionate</option>
                <option value="CATEGORIES">Categorie selezionate</option>
                <option value="PRODUCTS">Prodotti selezionati</option>
              </select>
              <p className="mt-1 text-[11px] text-ink/40">
                Puoi combinare i filtri sotto (es. sede + prodotto = "babà solo a Merlata").
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field">Limita a sedi</label>
                <select name="locationIds" multiple className="input-field h-24">
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label-field">Limita a categorie</label>
                <select name="categoryIds" multiple className="input-field h-24">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label-field">Limita a prodotti</label>
              <select name="productIds" multiple className="input-field h-24">
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-field">Ordine minimo (€)</label>
                <input name="minSubtotal" className="input-field" placeholder="20,00" />
              </div>
              <div>
                <label className="label-field">Usi max totali</label>
                <input name="maxUses" type="number" min={1} className="input-field" />
              </div>
              <div>
                <label className="label-field">Usi max per utente</label>
                <input name="perUserLimit" type="number" min={1} className="input-field" />
              </div>
              <div className="flex flex-col justify-end gap-1 pb-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="firstOrderOnly" className="accent-terracotta" />
                  Solo primo ordine
                </label>
                <span className="text-xs text-ink/55">Un solo codice per ordine (non cumulabile).</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-field">Valido dal</label>
                <input name="startsAt" type="date" className="input-field" />
              </div>
              <div>
                <label className="label-field">Fino al</label>
                <input name="endsAt" type="date" className="input-field" />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full">
              Crea codice
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
