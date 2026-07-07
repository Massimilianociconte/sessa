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
    </div>
  );
}
