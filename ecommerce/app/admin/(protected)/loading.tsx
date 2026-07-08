/** Skeleton del gestionale: appare dentro il layout (sidebar già visibile). */
export default function AdminLoading() {
  return (
    <div className="grid gap-4">
      <div className="loading-title" style={{ maxWidth: "18rem" }} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="loading-card" />
        ))}
      </div>
      <div className="loading-card" style={{ height: "22rem" }} />
    </div>
  );
}
