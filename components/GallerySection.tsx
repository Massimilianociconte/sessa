import Image from "next/image";
import { galleryImages } from "@/data/site-content";

export function GallerySection() {
  return (
    <section
      id="galleria"
      className="relative bg-white px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-36"
    >
      <div className="mx-auto grid max-w-[1380px] gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="relative min-h-[440px] overflow-hidden bg-ink shadow-editorial sm:min-h-[560px] lg:col-span-7 lg:min-h-[760px]">
          <Image
            src={galleryImages[0].image}
            alt={galleryImages[0].alt}
            fill
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="object-cover contrast-[1.04] saturate-[1.04]"
          />
        </div>
        <div className="relative grid gap-8 lg:col-span-5">
          <div className="relative z-30 flex min-h-[320px] items-end bg-terracotta p-8 text-ivory sm:min-h-[360px] sm:p-10">
            <div>
              <p className="font-script text-7xl leading-none text-cream">Sessa</p>
              <h2 className="mt-6 font-serif text-[clamp(3rem,5vw,5.7rem)] font-medium leading-[0.9]">
                Un ritmo fatto di mani, calore e attese
              </h2>
            </div>
          </div>
          <div className="relative min-h-[340px] overflow-hidden bg-ivory lg:ml-16">
            <Image
              src={galleryImages[1].image}
              alt={galleryImages[1].alt}
              fill
              sizes="(min-width: 1024px) 38vw, 100vw"
              className="object-cover contrast-[1.03] saturate-[1.04]"
            />
          </div>
        </div>
        <div className="relative min-h-[360px] overflow-hidden bg-cream lg:col-span-5 lg:col-start-2 lg:min-h-[480px]">
          <Image
            src={galleryImages[2].image}
            alt={galleryImages[2].alt}
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-contain p-8"
          />
        </div>
        <div className="relative z-30 flex items-center lg:col-span-5 lg:col-start-8">
          <p className="max-w-xl font-serif text-[clamp(2.7rem,5vw,5.2rem)] font-medium leading-[0.95] text-ink">
            Il carattere resta nei colori caldi, nella cura degli impasti e nelle immagini che
            lasciano parlare il prodotto.
          </p>
        </div>
        <div className="relative min-h-[420px] overflow-hidden bg-white shadow-editorial lg:col-span-6 lg:col-start-4 lg:min-h-[560px]">
          <Image
            src={galleryImages[3].image}
            alt={galleryImages[3].alt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover object-center contrast-[1.03] saturate-[1.03]"
          />
        </div>
      </div>
    </section>
  );
}
