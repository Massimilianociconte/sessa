import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";
import { formatRomeDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export const metadata = { title: "Referral" };

export default async function AdminReferralPage() {
  await requireAdminCapability("customers:manage");
  const referrals = await prisma.referral.findMany({
    include: {
      referrer: { select: { firstName: true, lastName: true, email: true } },
      invitedCustomer: { select: { firstName: true, lastName: true, email: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  const redeemed = referrals.filter((r) => r.status === "REDEEMED").length;

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Referral & inviti</h1>
      <p className="mt-1 text-sm text-ink/50">
        {referrals.length} inviti totali · {redeemed} convertiti in ordine.
      </p>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
              <th className="px-4 py-3">Chi ha invitato</th>
              <th className="px-4 py-3">Invitato</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Stato</th>
            </tr>
          </thead>
          <tbody>
            {referrals.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink/50">
                  Nessun invito registrato.
                </td>
              </tr>
            )}
            {referrals.map((r) => (
              <tr key={r.id} className="border-b border-ink/5">
                <td className="px-4 py-3">
                  {r.referrer.firstName} {r.referrer.lastName}
                  <span className="block text-xs text-ink/50">{r.referrer.email}</span>
                </td>
                <td className="px-4 py-3">
                  {r.invitedCustomer ? `${r.invitedCustomer.firstName} ${r.invitedCustomer.lastName}` : "—"}
                  {r.invitedCustomer && <span className="block text-xs text-ink/50">{r.invitedCustomer.email}</span>}
                </td>
                <td className="px-4 py-3 text-xs text-ink/60">{formatRomeDate(r.createdAt)}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${r.status === "REDEEMED" ? "bg-brilliant/15 text-emerald-800" : "bg-majolica/25 text-yellow-900"}`}>
                    {r.status === "REDEEMED" ? "Convertito" : "Registrato"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
