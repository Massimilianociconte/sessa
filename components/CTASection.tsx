import { brandFacts } from "@/data/site-content";

export function CTASection() {
  return (
    <section
      id="contatti"
      className="relative overflow-hidden bg-terracotta px-5 py-20 text-ivory sm:px-8 sm:py-28 lg:px-12"
    >
      <div className="relative z-30 mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[1fr_0.7fr] lg:items-end">
        <div>
          <p className="font-script text-[clamp(5.5rem,12vw,13rem)] leading-[0.68] text-cream/[0.78]">
            Sessa
          </p>
          <h2 className="mt-8 max-w-4xl font-serif text-[clamp(3.4rem,7vw,7.6rem)] font-medium leading-[0.9] text-white">
            Porta a casa un pezzo di Napoli
          </h2>
        </div>
        <div className="relative z-40 flex flex-col gap-4 sm:flex-row lg:flex-col lg:justify-self-end">
          <a
            href="#dolci"
            className="inline-flex min-h-14 items-center justify-center rounded-full bg-ivory px-8 text-base font-bold text-terracotta transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-terracotta motion-reduce:transition-none"
          >
            Scopri il menu
          </a>
          <a
            href={`mailto:${brandFacts.email}`}
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-ivory/70 px-8 text-base font-bold text-ivory transition-colors hover:bg-ivory hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-terracotta"
          >
            Contattaci
          </a>
        </div>
      </div>
    </section>
  );
}
