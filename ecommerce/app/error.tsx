"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="not-found-page error-recovery-page">
      <section className="not-found-shell mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[0.92fr_1.08fr] md:py-16">
        <div className="not-found-copy">
          <p className="font-script text-6xl leading-none text-terracotta sm:text-7xl">Sessa</p>
          <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.34em] text-terracotta/85">Errore temporaneo</p>
          <h1 className="mt-3 font-serif text-5xl font-semibold leading-[0.92] text-ink sm:text-6xl">
            Qualcosa è andato storto
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-ink/66 sm:text-lg">
            La pagina esiste, ma in questo momento non è riuscita a caricare tutti i dati.
            Riprova: se il problema era un picco del server o del database, tornerà subito.
          </p>
          {error.digest && (
            <p className="mt-3 rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-xs font-semibold text-ink/45">
              Codice tecnico: {error.digest}
            </p>
          )}
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={reset} className="btn-primary">
              Riprova
            </button>
            <Link href="/" className="btn-secondary">
              Torna allo shop
            </Link>
          </div>
          <div className="not-found-trust mt-7 grid gap-2 sm:grid-cols-3">
            <span>Carrello protetto</span>
            <span>Cataloghi per sede</span>
            <span>Assistenza Sessa</span>
          </div>
        </div>

        <div className="not-found-art" aria-hidden="true">
          <div className="not-found-art-img" role="img" />
        </div>
      </section>
    </main>
  );
}
