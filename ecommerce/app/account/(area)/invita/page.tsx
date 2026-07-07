import CopyField from "@/components/account/CopyField";
import { requireCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { getReferralConfig, getReferralStats, referralLink } from "@/lib/services/referral";

export const metadata = { title: "Invita amici" };

function rewardLabel(type: "PERCENT" | "FIXED", value: number): string {
  return type === "PERCENT" ? `${(value / 100).toLocaleString("it-IT")}%` : formatCents(value);
}

export default async function InvitePage() {
  const customer = await requireCustomer();
  const [config, stats] = await Promise.all([getReferralConfig(), getReferralStats(customer.id)]);
  const link = customer.referralCode ? referralLink(customer.referralCode) : null;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">Invita un amico</h1>
      <p className="text-sm text-ink/60">
        Il tuo amico riceve <strong>{rewardLabel(config.friendType, config.friendValue)}</strong> sul primo
        ordine (minimo {formatCents(config.minSubtotalCents)}). Quando ordina, tu ricevi{" "}
        <strong>{rewardLabel(config.referrerType, config.referrerValue)}</strong> sul prossimo ordine.
      </p>

      <section className="card p-6">
        <h2 className="mb-3 font-serif text-xl font-semibold">Il tuo link</h2>
        {link ? (
          <CopyField value={link} />
        ) : (
          <p className="text-sm text-ink/50">Codice referral non disponibile.</p>
        )}
      </section>

      <section className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">I tuoi inviti</h2>
          <span className="text-sm text-ink/60">
            {stats.redeemed}/{stats.total} convertiti
          </span>
        </div>
        {stats.referrals.length === 0 ? (
          <p className="text-sm text-ink/50">Non hai ancora invitato nessuno.</p>
        ) : (
          <ul className="divide-y divide-ink/10 text-sm">
            {stats.referrals.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <span>
                  {r.invitedCustomer?.firstName ?? "Amico"}
                  <span className="ml-2 text-xs text-ink/40">
                    {r.createdAt.toLocaleDateString("it-IT")}
                  </span>
                </span>
                <span
                  className={`badge ${r.status === "REDEEMED" ? "bg-brilliant/15 text-emerald-800" : "bg-majolica/25 text-yellow-900"}`}
                >
                  {r.status === "REDEEMED" ? "Ha ordinato" : "Registrato"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
