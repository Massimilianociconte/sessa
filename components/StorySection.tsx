import Image from "next/image";
import { storyMilestones } from "@/data/site-content";
import { assetPath } from "@/lib/paths";

export function StorySection() {
  return (
    <section className="relative bg-ivory px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
      <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="relative z-30 order-2 lg:order-1">
          <p className="font-serif text-[clamp(3.2rem,6vw,6.8rem)] font-medium leading-[0.9] text-ink">
            Una storia di famiglia, portata avanti con mano contemporanea.
          </p>
          <div className="mt-9 grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
            {storyMilestones.map((item) => (
              <article key={item.year} className="border-t border-ink/14 pt-5">
                <p className="font-serif text-4xl font-medium leading-none text-terracotta">
                  {item.year}
                </p>
                <h3 className="mt-3 text-sm font-bold uppercase tracking-[0.16em] text-ink">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-ink/[0.68]">{item.copy}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="relative order-1 min-h-[430px] overflow-hidden bg-white shadow-editorial lg:order-2 lg:min-h-[620px]">
          <Image
            src={assetPath("/images/official/processed/about-gaetano.png")}
            alt="Gaetano Sessa, immagine dal sito ufficiale Sessa 1930"
            fill
            sizes="(min-width: 1024px) 44vw, 100vw"
            className="object-contain p-8 contrast-[1.03] saturate-[1.03]"
          />
        </div>
      </div>
    </section>
  );
}
