import Image from "next/image";
import { CategoryCards } from "@/components/CategoryCards";
import { categories, shopProducts, specialties } from "@/data/site-content";

export function ProductsSection() {
  return (
    <section
      id="dolci"
      className="relative scroll-mt-[72px] bg-cream px-5 py-20 sm:scroll-mt-[86px] sm:px-8 sm:py-28 lg:px-12"
    >
      <div className="relative z-30 mx-auto max-w-[1380px]">
        <div className="grid gap-7 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <h2 className="max-w-3xl font-serif text-[clamp(3.4rem,7vw,7.4rem)] font-medium leading-[0.9] text-ink">
            Specialità ufficiali, ritmo da laboratorio
          </h2>
          <p className="max-w-2xl text-base leading-8 text-ink/70 sm:text-lg lg:justify-self-end">
            La selezione riprende categorie, prodotti e immagini presenti sul sito Sessa 1930,
            riorganizzati in una lettura più editoriale e contemporanea.
          </p>
        </div>

        <CategoryCards categories={categories} />

        <div className="mt-16 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
          {specialties.map((product, index) => (
            <article
              key={product.name}
              className={`group relative border-t border-ink/[0.18] pt-5 ${
                index % 2 === 1 ? "xl:mt-16" : ""
              }`}
            >
              <div className="relative aspect-square overflow-hidden bg-white">
                <Image
                  src={product.image}
                  alt={product.alt}
                  fill
                  sizes="(min-width: 1280px) 24vw, (min-width: 768px) 48vw, 100vw"
                  className="object-contain p-6 transition-transform duration-700 motion-safe:group-hover:scale-[1.04]"
                />
              </div>
              <div className="relative z-30 pt-6">
                <div className="mb-5 h-1 w-16 bg-terracotta" />
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-ceramic">
                  {product.category}
                </p>
                <h3 className="mt-3 font-serif text-5xl font-medium leading-none text-ink">
                  {product.name}
                </h3>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-20 border-t border-ink/12 pt-10">
          <div className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr] lg:items-start">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-terracotta">
                Catalogo online
              </p>
              <h3 className="mt-3 font-serif text-[clamp(2.7rem,5vw,5rem)] font-medium leading-[0.92] text-ink">
                Prezzi e varianti reali
              </h3>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {shopProducts.map((product) => (
                <a
                  key={product.href}
                  href={product.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group block bg-white p-4 shadow-[0_20px_50px_rgba(23,20,18,0.08)] outline-none transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-terracotta motion-reduce:transition-none"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-ivory">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      sizes="(min-width: 1024px) 28vw, (min-width: 768px) 33vw, 100vw"
                      className="object-contain p-4 transition-transform duration-700 motion-safe:group-hover:scale-[1.035]"
                    />
                  </div>
                  <div className="pt-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-terracotta">
                      {product.availability}
                    </p>
                    <h4 className="mt-2 font-serif text-4xl font-medium leading-none text-ink">
                      {product.name}
                    </h4>
                    <p className="mt-3 text-lg font-bold text-ceramic">{product.price}</p>
                    <p className="mt-3 text-sm leading-6 text-ink/65">{product.description}</p>
                    <p className="mt-4 line-clamp-3 text-xs leading-5 text-ink/48">
                      Varianti: {product.variants.join(", ")}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
