export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <section className="catalog-loading-hero">
        <div className="loading-pill" />
        <div className="loading-title" />
        <div className="loading-copy" />
      </section>
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Caricamento filtri">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="loading-card" />
        ))}
      </section>
      <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Caricamento prodotti">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="loading-product-card">
            <div className="loading-product-image" />
            <div className="loading-product-body">
              <span />
              <strong />
              <p />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
