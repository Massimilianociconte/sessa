/** Skeleton del carrello. */
export default function CartLoading() {
  return (
    <div className="segment-loading">
      <div className="segment-loading-ribbon" />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="loading-title" style={{ maxWidth: "16rem" }} />
        <div className="mt-8 grid gap-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="loading-card" style={{ height: "6.5rem" }} />
          ))}
          <div className="loading-card" style={{ height: "10rem" }} />
        </div>
      </main>
    </div>
  );
}
