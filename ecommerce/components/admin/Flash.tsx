/** Messaggi di esito passati via query string dalle server actions (?msg / ?err). */
export default function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div className="mb-4 space-y-2">
      {msg && (
        <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">
          {decodeURIComponent(msg)}
        </p>
      )}
      {err && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
          {decodeURIComponent(err)}
        </p>
      )}
    </div>
  );
}
