import Link from "next/link";
import { requireAdminAnyCapability } from "@/lib/auth/session";
import { getLaunchReadiness, type ReadinessLevel } from "@/lib/services/launch-readiness";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checklist di lancio" };

const STYLES: Record<ReadinessLevel, { badge: string; label: string }> = {
  ok: { badge: "bg-brilliant/15 text-emerald-800", label: "OK" },
  warning: { badge: "bg-majolica/40 text-ink", label: "Da verificare" },
  blocker: { badge: "bg-terracotta text-ivory", label: "Bloccante" }
};

export default async function ReadinessPage() {
  await requireAdminAnyCapability(["settings:manage", "operations:view"]);
  const items = await getLaunchReadiness();
  const blockers = items.filter((item) => item.level === "blocker").length;
  const order: ReadinessLevel[] = ["blocker", "warning", "ok"];
  const sorted = [...items].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Checklist di lancio</h1>
      <p className="mt-1 text-sm text-ink/55">
        {blockers === 0
          ? "Nessun punto bloccante: il negozio può accettare ordini reali."
          : `${blockers} punt${blockers === 1 ? "o bloccante" : "i bloccanti"} da risolvere prima di accettare ordini reali.`}
      </p>
      <ul className="mt-6 space-y-3">
        {sorted.map((item) => (
          <li key={item.id} className="card flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm text-ink/65">{item.detail}</p>
              {item.href && (
                <Link href={item.href} className="mt-1 inline-block text-sm font-semibold text-terracotta hover:underline">
                  Vai alla sezione →
                </Link>
              )}
            </div>
            <span className={`badge shrink-0 ${STYLES[item.level].badge}`}>{STYLES[item.level].label}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
