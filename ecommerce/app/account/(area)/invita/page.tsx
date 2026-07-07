import CopyField from "@/components/account/CopyField";
import {
  AccountEmptyState,
  AccountInfoGrid,
  AccountInfoTile,
  AccountPageIntro,
  AccountPanel
} from "@/components/account/AccountUi";
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
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Referral"
        title="Invita amici"
        description={`Il tuo amico riceve ${rewardLabel(config.friendType, config.friendValue)} sul primo ordine. Quando ordina, tu ricevi ${rewardLabel(config.referrerType, config.referrerValue)} sul prossimo acquisto.`}
      />

      <AccountInfoGrid>
        <AccountInfoTile label="Inviti totali" value={String(stats.total)} description="Persone registrate dal tuo invito." tone="terracotta" />
        <AccountInfoTile label="Convertiti" value={String(stats.redeemed)} description="Amici che hanno completato un ordine." tone="brilliant" />
        <AccountInfoTile label="Minimo ordine" value={formatCents(config.minSubtotalCents)} description="Soglia richiesta per riscattare la promo." tone="ceramic" />
      </AccountInfoGrid>

      <div className="account-detail-grid">
        <AccountPanel
          eyebrow="Condividi"
          title="Codice referral"
          description="Utile se vuoi inviarlo in un messaggio breve o comunicarlo a voce."
        >
          {customer.referralCode ? <CopyField value={customer.referralCode} /> : <p className="text-sm text-ink/55">Codice referral non disponibile.</p>}
        </AccountPanel>

        <AccountPanel
          eyebrow="Link personale"
          title="Invito diretto"
          description="Chi apre questo link viene collegato al tuo invito in modo tracciato."
        >
          {link ? <CopyField value={link} /> : <p className="text-sm text-ink/55">Link referral non disponibile.</p>}
        </AccountPanel>
      </div>

      <AccountPanel
        eyebrow="Come funziona"
        title="Regole semplici, sconto chiaro"
        description="Il sistema evita auto-inviti e doppi utilizzi: ogni amico puo essere associato a un solo referral."
      >
        <div className="account-rule-grid">
          {[
            ["1", "Condividi", "Invia link o codice a un amico."],
            ["2", "Registrazione", "L'amico crea o accede al suo account Sessa."],
            ["3", "Primo ordine", `Lo sconto si applica sopra ${formatCents(config.minSubtotalCents)}.`],
            ["4", "Ricompensa", "Quando l'amico ordina, ricevi un codice personale."]
          ].map(([step, title, copy]) => (
            <div key={step}>
              <span>{step}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </AccountPanel>

      <AccountPanel
        eyebrow="Storico"
        title="I tuoi inviti"
        description={`${stats.redeemed}/${stats.total} inviti convertiti in ordine.`}
      >
        {stats.referrals.length === 0 ? (
          <AccountEmptyState
            title="Invita un amico e condividi un assaggio di Sessa."
            description="Appena qualcuno usera il tuo link, vedrai qui registrazione, stato e ricompensa."
            primary={link ? { href: link, label: "Apri link" } : undefined}
          />
        ) : (
          <ul className="account-referral-list">
            {stats.referrals.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.invitedCustomer?.firstName ?? "Amico invitato"}</strong>
                  <span>
                    {r.createdAt.toLocaleDateString("it-IT")}
                  </span>
                </div>
                <span
                  className={`badge ${r.status === "REDEEMED" ? "bg-brilliant/15 text-emerald-800" : "bg-majolica/25 text-yellow-900"}`}
                >
                  {r.status === "REDEEMED" ? "Convertito" : "Registrato"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AccountPanel>
    </div>
  );
}
