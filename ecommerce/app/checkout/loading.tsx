/** Skeleton del checkout. */
export default function CheckoutLoading() {
  return (
    <div className="segment-loading">
      <div className="segment-loading-ribbon" />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="loading-title" style={{ maxWidth: "18rem" }} />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-4">
            <div className="loading-card" style={{ height: "11rem" }} />
            <div className="loading-card" style={{ height: "14rem" }} />
            <div className="loading-card" style={{ height: "9rem" }} />
          </div>
          <div className="loading-card" style={{ height: "20rem" }} />
        </div>
      </main>
    </div>
  );
}
