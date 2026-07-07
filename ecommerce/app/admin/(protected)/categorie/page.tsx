import Flash from "@/components/admin/Flash";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction
} from "@/lib/actions/admin/categories";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Categorie" };

const ACCENTS = [
  { value: "terracotta", label: "Terracotta" },
  { value: "blue", label: "Blu ceramica" },
  { value: "green", label: "Verde brillante" }
];

function CategoryFormFields({
  defaults
}: {
  defaults?: { name: string; slug: string; description: string | null; accent: string; position: number; image: string | null };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label-field">Nome</label>
        <input name="name" defaultValue={defaults?.name} required className="input-field" />
      </div>
      <div>
        <label className="label-field">Slug</label>
        <input
          name="slug"
          defaultValue={defaults?.slug}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          className="input-field"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Descrizione</label>
        <input name="description" defaultValue={defaults?.description ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">Accento brand</label>
        <select name="accent" defaultValue={defaults?.accent ?? "terracotta"} className="input-field">
          {ACCENTS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-field">Posizione</label>
        <input name="position" type="number" min={0} defaultValue={defaults?.position ?? 0} className="input-field" />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Immagine (percorso o URL)</label>
        <input name="image" defaultValue={defaults?.image ?? ""} className="input-field" />
      </div>
    </div>
  );
}

export default async function AdminCategoriesPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { msg, err } = await searchParams;
  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { position: "asc" }
  });

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Categorie</h1>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          {categories.map((category) => (
            <details key={category.id} className="card">
              <summary className="flex cursor-pointer items-center gap-3 px-5 py-4">
                <span className="font-serif text-lg font-semibold">{category.name}</span>
                <span className="text-sm text-ink/50">/{category.slug}</span>
                <span className="ml-auto flex items-center gap-2">
                  {!category.isActive && <span className="badge bg-ink/10 text-ink/50">Disattivata</span>}
                  <span className="badge bg-cream text-ink/60">{category._count.products} prodotti</span>
                </span>
              </summary>
              <div className="border-t border-ink/10 p-5">
                <form action={updateCategoryAction} className="space-y-4">
                  <input type="hidden" name="id" value={category.id} />
                  <CategoryFormFields defaults={category} />
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={category.isActive}
                      className="accent-terracotta"
                    />
                    Categoria attiva
                  </label>
                  <button type="submit" className="btn-secondary">
                    Salva
                  </button>
                </form>
                <form action={deleteCategoryAction} className="mt-3">
                  <input type="hidden" name="id" value={category.id} />
                  <button type="submit" className="text-xs font-semibold text-terracotta hover:underline">
                    Elimina categoria
                  </button>
                </form>
              </div>
            </details>
          ))}
        </div>

        <section className="card h-fit p-6">
          <h2 className="mb-4 font-serif text-xl font-semibold">Nuova categoria</h2>
          <form action={createCategoryAction} className="space-y-4">
            <CategoryFormFields />
            <button type="submit" className="btn-primary">
              Crea categoria
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
