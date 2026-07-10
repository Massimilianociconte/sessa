import Link from "next/link";
import {
  AccountEmptyState,
  AccountInfoGrid,
  AccountInfoTile,
  AccountPageIntro,
  AccountPanel
} from "@/components/account/AccountUi";
import CopyField from "@/components/account/CopyField";
import { requireCustomer } from "@/lib/auth/customer-session";
import { formatCents } from "@/lib/money";
import { listCustomerGiftCards } from "@/lib/services/customer-account";
import { formatRomeDate } from "@/lib/datetime";

export const metadata = { title: "Gift card e crediti" };

function cardStatus(card: { isActive: boolean; balanceCents: number; expiresAt: Date | null }) {
  if (!card.isActive) return { label: "Disattivata", className: "bg-ink/10 text-ink/60" };
  if (card.expiresAt && card.expiresAt < new Date()) return { label: "Scaduta", className: "bg-terracotta/15 text-terracotta" };
  if (card.balanceCents <= 0) return { label: "Usata", className: "bg-ink/10 text-ink/60" };
  return { label: "Attiva", className: "bg-brilliant/15 text-emerald-800" };
}

export default async function AccountGiftCardsPage() {
  const customer = await requireCustomer();
  const cards = await listCustomerGiftCards(customer.id);
  const activeCards = cards.filter((card) => card.isActive && card.balanceCents > 0 && (!card.expiresAt || card.expiresAt > new Date()));
  const totalBalance = activeCards.reduce((sum, card) => sum + card.balanceCents, 0);

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Crediti"
        title="Gift card e crediti"
        description="Controlla saldo residuo, scadenze e movimenti dei crediti collegati al tuo account."
      >
        <Link href="/" className="btn-primary">Usa al checkout</Link>
      </AccountPageIntro>

      <AccountInfoGrid>
        <AccountInfoTile label="Saldo disponibile" value={formatCents(totalBalance)} description={`${activeCards.length} card attiv${activeCards.length === 1 ? "a" : "e"}`} tone="brilliant" />
        <AccountInfoTile label="Gift card totali" value={String(cards.length)} description="Incluse usate, scadute o disattivate." tone="terracotta" />
        <AccountInfoTile label="Card abbonamento" value="Predisposta" description="Spazio pronto per futuri piani e crediti ricorrenti." tone="ceramic" />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Portafoglio"
        title="Le tue gift card"
        description="Copia il codice e inseriscilo nel checkout: il saldo viene scalato in modo tracciato."
      >
        {cards.length === 0 ? (
          <AccountEmptyState
            title="Quando riceverai una gift card, la troverai qui."
            description="Il portafoglio crediti e gia pronto per saldo residuo, scadenze e storico utilizzi."
            primary={{ href: "/", label: "Scopri i prodotti" }}
          />
        ) : (
          <div className="account-credit-grid">
            {cards.map((card) => {
              const status = cardStatus(card);
              return (
                <article key={card.id} className="account-credit-card">
                  <div className="account-credit-card-top">
                    <div>
                      <p>Gift card Sessa</p>
                      <h2>{formatCents(card.balanceCents)}</h2>
                      <span>Valore iniziale {formatCents(card.initialCents)}</span>
                    </div>
                    <span className={`badge ${status.className}`}>{status.label}</span>
                  </div>
                  <CopyField value={card.code} />
                  <div className="account-credit-meta">
                    <span>Scadenza: {card.expiresAt ? formatRomeDate(card.expiresAt) : "Nessuna"}</span>
                    <span>{card.transactions.length} moviment{card.transactions.length === 1 ? "o" : "i"}</span>
                  </div>
                  {card.transactions.length > 0 && (
                    <ul className="account-transaction-list">
                      {card.transactions.map((tx) => (
                        <li key={tx.id}>
                          <span>{tx.reason}</span>
                          <strong className={tx.delta < 0 ? "text-terracotta" : "text-emerald-800"}>
                            {tx.delta < 0 ? "-" : "+"}
                            {formatCents(Math.abs(tx.delta))}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </AccountPanel>
    </div>
  );
}
