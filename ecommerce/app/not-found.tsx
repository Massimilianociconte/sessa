import Link from "next/link";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="not-found-page">
        <section className="not-found-shell mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[0.92fr_1.08fr] md:py-16">
          <div className="not-found-copy">
            <p className="font-script text-6xl leading-none text-terracotta sm:text-7xl">Sessa</p>
            <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.34em] text-terracotta/85">Errore 404</p>
            <h1 className="mt-3 font-serif text-5xl font-semibold leading-[0.92] text-ink sm:text-6xl">
              Ti sei perso?
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-ink/66 sm:text-lg">
              Questa pagina non è più sul banco. Torna nello shop, scegli una sede Sessa e ritrova sfogliatelle,
              box regalo e specialità appena pronte.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/" className="btn-primary">
                Torna allo shop
              </Link>
              <Link href="/account" className="btn-secondary">
                Area personale
              </Link>
            </div>
            <div className="not-found-trust mt-7 grid gap-2 sm:grid-cols-3">
              <span>Cataloghi per sede</span>
              <span>Ritiro e consegna</span>
              <span>Pasticceria dal 1930</span>
            </div>
          </div>

          <div className="not-found-art" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/404/sessa-ti-sei-perso.webp" alt="" />
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
