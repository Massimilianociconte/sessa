import type { Category, Product } from "@prisma/client";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUSES } from "@/lib/domain";

/** Campi condivisi tra creazione e modifica prodotto. */
export default function ProductFields({
  product,
  categories
}: {
  product?: Product;
  categories: Category[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label-field" htmlFor="name">
          Nome
        </label>
        <input id="name" name="name" defaultValue={product?.name} required className="input-field" />
      </div>
      <div>
        <label className="label-field" htmlFor="slug">
          Slug (URL)
        </label>
        <input
          id="slug"
          name="slug"
          defaultValue={product?.slug}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          className="input-field"
          placeholder="es. panettone-classico"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field" htmlFor="shortDescription">
          Descrizione breve (card catalogo)
        </label>
        <input
          id="shortDescription"
          name="shortDescription"
          defaultValue={product?.shortDescription ?? ""}
          className="input-field"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field" htmlFor="description">
          Descrizione completa
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={product?.description}
          className="input-field"
        />
      </div>
      <div>
        <label className="label-field" htmlFor="image">
          Immagine principale (percorso o URL)
        </label>
        <input
          id="image"
          name="image"
          defaultValue={product?.image ?? ""}
          className="input-field"
          placeholder="/images/products/…"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field" htmlFor="tags">
          Tag (separati da virgola, per ricerca e filtri)
        </label>
        <input
          id="tags"
          name="tags"
          defaultValue={product?.tags ?? ""}
          className="input-field"
          placeholder="lievitati, natale, regalo"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field" htmlFor="ingredients">
          Ingredienti
        </label>
        <input
          id="ingredients"
          name="ingredients"
          defaultValue={product?.ingredients ?? ""}
          className="input-field"
          placeholder="Farina, uova, burro, zucchero…"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field" htmlFor="allergens">
          Allergeni (obbligo per alimenti)
        </label>
        <input
          id="allergens"
          name="allergens"
          defaultValue={product?.allergens ?? ""}
          className="input-field"
          placeholder="Glutine, uova, latte, frutta a guscio"
        />
      </div>
      <div>
        <label className="label-field" htmlFor="categoryId">
          Categoria
        </label>
        <select
          id="categoryId"
          name="categoryId"
          defaultValue={product?.categoryId ?? ""}
          className="input-field"
        >
          <option value="">Nessuna</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-field" htmlFor="status">
          Stato
        </label>
        <select id="status" name="status" defaultValue={product?.status ?? "DRAFT"} className="input-field">
          {PRODUCT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PRODUCT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-field" htmlFor="taxRateBps">
          IVA inclusa (basis points, 1000 = 10%)
        </label>
        <input
          id="taxRateBps"
          name="taxRateBps"
          type="number"
          min={0}
          max={10000}
          defaultValue={product?.taxRateBps ?? 1000}
          className="input-field"
        />
      </div>
      <div>
        <label className="label-field" htmlFor="position">
          Posizione (ordinamento)
        </label>
        <input
          id="position"
          name="position"
          type="number"
          min={0}
          defaultValue={product?.position ?? 0}
          className="input-field"
        />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
        <input
          type="checkbox"
          name="featured"
          defaultChecked={product?.featured ?? false}
          className="accent-terracotta"
        />
        In evidenza nel catalogo
      </label>
      <section className="rounded-2xl border border-ceramic/20 bg-ceramic/5 p-4 sm:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">Google Merchant Center</p><p className="text-xs text-ink/50">Campi editoriali opzionali; in assenza vengono usati nome e descrizione del catalogo.</p></div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="merchantEnabled" defaultChecked={product?.merchantEnabled ?? true} className="accent-terracotta" />Pubblica nei feed</label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="label-field" htmlFor="merchantTitle">Titolo Merchant</label><input id="merchantTitle" name="merchantTitle" maxLength={150} defaultValue={product?.merchantTitle ?? ""} className="input-field" /></div>
          <div><label className="label-field" htmlFor="googleProductCategory">Categoria Google</label><input id="googleProductCategory" name="googleProductCategory" defaultValue={product?.googleProductCategory ?? ""} className="input-field" placeholder="Food, Beverages & Tobacco > Food Items" /></div>
          <div className="sm:col-span-2"><label className="label-field" htmlFor="merchantDescription">Descrizione Merchant</label><textarea id="merchantDescription" name="merchantDescription" rows={3} maxLength={5000} defaultValue={product?.merchantDescription ?? ""} className="input-field" /></div>
        </div>
      </section>
    </div>
  );
}
