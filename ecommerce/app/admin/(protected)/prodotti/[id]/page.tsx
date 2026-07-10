import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/admin/Flash";
import ProductFields from "@/components/admin/ProductFields";
import {
  createVariantAction,
  deleteProductAction,
  deleteVariantAction,
  updateProductAction,
  updateStoreVariantAction,
  updateVariantAction
} from "@/lib/actions/admin/products";
import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";
import { formatCents } from "@/lib/money";
import { effectivePrice } from "@/lib/services/catalog";

export const dynamic = "force-dynamic";

export const metadata = { title: "Modifica prodotto" };

const euro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export default async function EditProductPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireAdminCapability("catalog:manage");
  const [{ id }, { msg, err }] = await Promise.all([params, searchParams]);
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          orderBy: { position: "asc" },
          include: {
            storeVariants: {
              orderBy: { location: { position: "asc" } },
              include: { location: { select: { name: true } } }
            }
          }
        }
      }
    }),
    prisma.category.findMany({ orderBy: { position: "asc" } })
  ]);
  if (!product) notFound();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/prodotti" className="btn-ghost text-sm">
          ← Prodotti
        </Link>
        <h1 className="font-serif text-3xl font-semibold">{product.name}</h1>
      </div>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <form action={updateProductAction} className="card h-fit space-y-6 p-6">
          <input type="hidden" name="id" value={product.id} />
          <ProductFields product={product} categories={categories} />
          <button type="submit" className="btn-primary">
            Salva prodotto
          </button>
        </form>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-1 font-serif text-xl font-semibold">Varianti</h2>
            <p className="mb-4 text-xs text-ink/50">
              Il prezzo qui è quello <strong>base</strong>. Disponibilità, prezzo e stock per singola
              sede si gestiscono nell'assortimento di ogni variante.
            </p>
            {product.variants.length === 0 && (
              <p className="mb-4 text-sm text-ink/50">Nessuna variante: il prodotto non è acquistabile.</p>
            )}
            <div className="space-y-4">
              {product.variants.map((variant) => (
                <details key={variant.id} className="rounded-xl border border-ink/10 bg-cream/50">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="font-semibold">{variant.name}</span>
                    <span className="text-ink/50">SKU {variant.sku}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {!variant.isActive && <span className="badge bg-ink/10 text-ink/50">Disattivata</span>}
                      <span className="font-bold">{formatCents(variant.basePriceCents)}</span>
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-ink/10 p-4">
                    <form action={updateVariantAction} className="grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="variantId" value={variant.id} />
                      <input type="hidden" name="productId" value={product.id} />
                      <div>
                        <label className="label-field">Nome variante</label>
                        <input name="name" defaultValue={variant.name} required className="input-field" />
                      </div>
                      <div>
                        <label className="label-field">SKU</label>
                        <input name="sku" defaultValue={variant.sku} required className="input-field" />
                      </div>
                      <div>
                        <label className="label-field">Prezzo base (€)</label>
                        <input name="price" defaultValue={euro(variant.basePriceCents)} required className="input-field" />
                      </div>
                      <div>
                        <label className="label-field">Prezzo barrato base (€)</label>
                        <input name="compareAt" defaultValue={variant.compareAtCents ? euro(variant.compareAtCents) : ""} className="input-field" />
                      </div>
                      <div>
                        <label className="label-field">Posizione</label>
                        <input name="position" type="number" min={0} defaultValue={variant.position} className="input-field" />
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" name="isActive" defaultChecked={variant.isActive} className="accent-terracotta" />
                        Variante attiva
                      </label>
                      <div className="sm:col-span-2">
                        <button type="submit" className="btn-secondary w-full">
                          Salva variante
                        </button>
                      </div>
                    </form>

                    <div>
                      <p className="label-field">Assortimento per sede</p>
                      <div className="space-y-2">
                        {variant.storeVariants.map((sv) => (
                          <form
                            key={sv.id}
                            action={updateStoreVariantAction}
                            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-xs"
                          >
                            <input type="hidden" name="storeVariantId" value={sv.id} />
                            <input type="hidden" name="productId" value={product.id} />
                            <div>
                              <p className="font-semibold">{sv.location.name}</p>
                              <p className="text-ink/40">
                                stock {sv.stockQty} · {formatCents(effectivePrice(sv.priceCentsOverride, variant.basePriceCents))}
                              </p>
                            </div>
                            <label className="flex items-center gap-1">
                              <input type="checkbox" name="isAvailable" defaultChecked={sv.isAvailable} className="accent-terracotta" />
                              Disp.
                            </label>
                            <input
                              name="price"
                              defaultValue={sv.priceCentsOverride ? euro(sv.priceCentsOverride) : ""}
                              placeholder="base"
                              className="input-field !w-20 !py-1 text-xs"
                              aria-label="Prezzo sede"
                            />
                            <button type="submit" className="btn-ghost !px-2 !py-1 text-xs">
                              Salva
                            </button>
                          </form>
                        ))}
                      </div>
                      <p className="mt-1 text-[11px] text-ink/40">
                        Lo stock si modifica dal{" "}
                        <Link href="/admin/magazzino" className="font-semibold text-terracotta hover:underline">
                          magazzino
                        </Link>
                        . Prezzo vuoto = prezzo base.
                      </p>
                    </div>

                    <form action={deleteVariantAction}>
                      <input type="hidden" name="variantId" value={variant.id} />
                      <input type="hidden" name="productId" value={product.id} />
                      <button type="submit" className="w-full text-xs font-semibold text-terracotta hover:underline">
                        Elimina variante
                      </button>
                    </form>
                  </div>
                </details>
              ))}
            </div>

            <details className="mt-6 rounded-xl border border-dashed border-terracotta/40">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-terracotta">
                + Aggiungi variante
              </summary>
              <form action={createVariantAction} className="grid gap-3 border-t border-ink/10 p-4 sm:grid-cols-2">
                <input type="hidden" name="productId" value={product.id} />
                <div>
                  <label className="label-field">Nome variante</label>
                  <input name="name" required className="input-field" placeholder="es. Classico" />
                </div>
                <div>
                  <label className="label-field">SKU</label>
                  <input name="sku" required className="input-field" placeholder="es. PAN-1KG-CLA" />
                </div>
                <div>
                  <label className="label-field">Prezzo base (€)</label>
                  <input name="price" required className="input-field" placeholder="34,00" />
                </div>
                <div>
                  <label className="label-field">Posizione</label>
                  <input name="position" type="number" min={0} defaultValue={product.variants.length} className="input-field" />
                </div>
                <button type="submit" className="btn-primary sm:col-span-2">
                  Crea variante (pubblicata su tutte le sedi, stock 0)
                </button>
              </form>
            </details>
          </section>

          <section className="card border-terracotta/30 p-6">
            <h2 className="mb-2 font-serif text-xl font-semibold text-terracotta">Zona pericolosa</h2>
            <p className="mb-3 text-sm text-ink/60">
              Eliminabile solo se non presente in ordini storici; altrimenti usa lo stato "Archiviato".
            </p>
            <form action={deleteProductAction}>
              <input type="hidden" name="id" value={product.id} />
              <button type="submit" className="btn-secondary !border-terracotta !text-terracotta">
                Elimina prodotto
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
