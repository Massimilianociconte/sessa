import Link from "next/link";
import {
  AccountEmptyState,
  AccountInfoGrid,
  AccountInfoTile,
  AccountMetricCard,
  AccountPageIntro,
  AccountPanel
} from "@/components/account/AccountUi";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import CopyField from "@/components/account/CopyField";
import { requireCustomer } from "@/lib/auth/customer-session";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/lib/domain";
import { formatCents } from "@/lib/money";
import { getAccountOverview } from "@/lib/services/customer-account";
import { referralLink } from "@/lib/services/referral";

export const metadata = { title: "Il mio account" };

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default async function AccountOverviewPage() {
  const session = await requireCustomer();
  const {
    customer,
    orderCount,
    lastOrders,
    latestOrder,
    defaultAddress,
    addressCount,
    totalSpentCents,
    activeGiftCards,
    totalGiftCardCents,
    availableDiscounts
  } = await getAccountOverview(session.id);
  const profileCustomer = customer ?? session;
  const referral = profileCustomer.referralCode ? referralLink(profileCustomer.referralCode) : null;
  const profileCompletion = [
    profileCustomer.phone ? "Telefono" : null,
    defaultAddress ? "Indirizzo" : null,
    customer?.marketingOptIn ? "Preferenze" : null
  ].filter(Boolean).length;

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Panoramica"
        title={`Bentornato, ${profileCustomer.firstName}`}
        description="Tieni sotto controllo ordini, sede, crediti e preferenze per acquistare in meno passaggi."
      >
        <Link href={latestOrder?.location?.slug ? `/sede/${latestOrder.location.slug}` : "/"} className="btn-primary">
          {latestOrder ? "Ordina di nuovo" : "Scegli una sede"}
        </Link>
      </AccountPageIntro>

      <div className="account-metric-grid">
        <AccountMetricCard
          label="Ordini totali"
          value={orderCount}
          description={totalSpentCents > 0 ? `${formatCents(totalSpentCents)} di acquisti confermati` : "Il tuo storico iniziera dal primo ordine."}
          href="/account/ordini"
          action="Vedi storico"
          tone="terracotta"
        />
        <AccountMetricCard
          label="Sede recente"
          value={latestOrder?.location?.name ?? "Da scegliere"}
          description={latestOrder ? `Ultimo ordine ${formatDate(latestOrder.placedAt)}` : "Seleziona la sede più comoda per catalogo e disponibilità."}
          href={latestOrder?.location?.slug ? `/sede/${latestOrder.location.slug}` : "/"}
          action={latestOrder ? "Vai al catalogo" : "Scopri le sedi"}
          tone="ceramic"
        />
        <AccountMetricCard
          label="Crediti attivi"
          value={activeGiftCards.length > 0 ? formatCents(totalGiftCardCents) : "0"}
          description={activeGiftCards.length > 0 ? `${activeGiftCards.length} gift card utilizzabili al checkout` : "Gift card e crediti compariranno qui."}
          href="/account/gift-card"
          action="Gestisci crediti"
          tone="brilliant"
        />
        <AccountMetricCard
          label="Profilo"
          value={`${profileCompletion}/3`}
          description={profileCompletion >= 3 ? "Dati essenziali completi per checkout più rapido." : "Completa telefono, indirizzo e preferenze."}
          href="/account/profilo"
          action="Completa profilo"
          tone="majolica"
        />
      </div>

      <AccountInfoGrid>
        <AccountInfoTile
          label="Indirizzo predefinito"
          value={defaultAddress ? `${defaultAddress.line1}, ${defaultAddress.city}` : "Non salvato"}
          description={defaultAddress ? `${defaultAddress.postalCode} ${defaultAddress.province} · ${addressCount} indirizz${addressCount === 1 ? "o" : "i"}` : "Salvalo per rendere il checkout più veloce."}
          tone="terracotta"
        />
        <AccountInfoTile
          label="Codici disponibili"
          value={availableDiscounts.length > 0 ? String(availableDiscounts.length) : "Nessuno"}
          description={availableDiscounts.length > 0 ? `${availableDiscounts[0].code} pronto per il checkout` : "I codici personali appariranno nella sezione dedicata."}
          tone="ceramic"
        />
        <AccountInfoTile
          label="Referral"
          value={profileCustomer.referralCode ?? "In preparazione"}
          description="Invita amici e ricevi ricompense tracciate sul tuo account."
          tone="brilliant"
        />
      </AccountInfoGrid>

      {referral && (
        <AccountPanel
          eyebrow="Invita amici"
          title="Il tuo link personale"
          description="Copialo e condividilo: lo sconto viene associato all'account dell'amico quando si registra."
          action={<Link href="/account/invita" className="btn-ghost">Regole referral</Link>}
        >
          <CopyField value={referral} />
        </AccountPanel>
      )}

      <AccountPanel
        eyebrow="Storico"
        title="Ultimi ordini"
        description="Le informazioni più importanti per riordinare, seguire lo stato e recuperare una ricevuta."
        action={<Link href="/account/ordini" className="btn-secondary">Tutti gli ordini</Link>}
      >
        {lastOrders.length === 0 ? (
          <AccountEmptyState
            title="Il tuo primo momento Sessa ti aspetta."
            description="Scegli la sede più vicina e crea il tuo primo ordine: qui troverai storico, riordino rapido e ricevute."
            primary={{ href: "/", label: "Scegli una sede" }}
            secondary={{ href: "/account/indirizzi", label: "Salva indirizzo" }}
          />
        ) : (
          <div className="account-order-list">
            {lastOrders.map((order) => (
              <article key={order.id} className="account-order-card">
                <div className="account-order-card-main">
                  <Link href={`/account/ordini/${order.code}`} className="account-order-code">
                    {order.code}
                  </Link>
                  <p>
                    {formatDate(order.placedAt)} · {FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}
                    {order.location ? ` · ${order.location.name}` : ""} · {order.items.reduce((s, i) => s + i.qty, 0)} pz
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
                <strong>{formatCents(order.totalCents)}</strong>
              </article>
            ))}
          </div>
        )}
      </AccountPanel>
    </div>
  );
}
