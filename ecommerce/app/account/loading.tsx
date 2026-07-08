/** Skeleton istantaneo per tutte le rotte /account/*: appare al click, prima dei dati. */
export default function AccountLoading() {
  return (
    <div className="segment-loading">
      <div className="segment-loading-ribbon" />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="loading-pill" />
        <div className="loading-title mt-4" style={{ maxWidth: "22rem" }} />
        <div className="loading-copy mt-3" style={{ maxWidth: "30rem" }} />
        <div className="mt-8 grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="hidden flex-col gap-2 lg:flex">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="loading-card" style={{ height: "2.6rem" }} />
            ))}
          </div>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="loading-card" />
              ))}
            </div>
            <div className="loading-card" style={{ height: "16rem" }} />
            <div className="loading-card" style={{ height: "12rem" }} />
          </div>
        </div>
      </main>
    </div>
  );
}
