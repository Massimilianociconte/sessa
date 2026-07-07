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
import { DISCOUNT_SCOPE_LABELS, type DiscountScope } from "@/lib/domain";
import { formatCents } from "@/lib/money";
import { listCustomerDiscountCodes } from "@/lib/services/customer-account";

export const metadata = { title: "Codici sconto" };

type DiscountForAccount = Awaited<ReturnType<typeof listCustomerDiscountCodes>>[number];

function discountValue(code: DiscountForAccount) {
  return code.type === "PERCENT" ? `${(code.value / 100).toLocaleString("it-IT")}%` : formatCents(code.value);
}

function discountStatus(code: DiscountForAccount) {
  const now = new Date();
  const usedByCustomer = code.perUserLimit !== null && code.redemptions.length >= code.perUserLimit;
  const globallyUsed = code.maxUses !== null && code.usedCount >= code.maxUses;

  if (!code.isActive) return { label: "Non attivo", tone: "neutral" };
  if (code.startsAt && code.startsAt > now) return { label: "Non ancora valido", tone: "waiting" };
  if (code.endsAt && code.endsAt < now) return { label: "Scaduto", tone: "expired" };
  if (usedByCustomer || globallyUsed) return { label: "Usato", tone: "used" };
  return { label: "Attivo", tone: "active" };
}

function statusClass(tone: string) {
  switch (tone) {
    case "active":
      return "bg-brilliant/15 text-emerald-800";
    case "waiting":
      return "bg-majolica/30 text-yellow-900";
    case "expired":
      return "bg-terracotta/15 text-terracotta";
    case "used":
      return "bg-ink/10 text-ink/60";
    default:
      return "bg-ink/10 text-ink/60";
  }
}

function scopeDetails(code: DiscountForAccount) {
  const parts: string[] = [DISCOUNT_SCOPE_LABELS[code.scope as DiscountScope] ?? code.scope];
  if (code.locations.length > 0) {
    parts.push(`Sedi: ${code.locations.map((link) => link.location.name).join(", ")}`);
  }
  if (code.categories.length > 0) {
    parts.push(`Categorie: ${code.categories.map((link) => link.category.name).join(", ")}`);
  }
  if (code.products.length > 0) {
    parts.push(`Prodotti: ${code.products.map((link) => link.product.name).join(", ")}`);
  }
  return parts;
}

export default async function AccountDiscountCodesPage() {
  const customer = await requireCustomer();
  const codes = await listCustomerDiscountCodes(customer.id);
  const activeCodes = codes.filter((code) => discountStatus(code).tone === "active");
  const usedCodes = codes.filter((code) => discountStatus(code).tone === "used");
  const expiredCodes = codes.filter((code) => ["expired", "neutral"].includes(discountStatus(code).tone));

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Promozioni"
        title="Codici sconto"
        description="Tutti i codici personali collegati al tuo account, con condizioni, stato e utilizzi rimasti."
      >
        <Link href="/" className="btn-primary">Usa nello shop</Link>
      </AccountPageIntro>

      <AccountInfoGrid>
        <AccountInfoTile label="Attivi" value={String(activeCodes.length)} description="Pronti per il prossimo checkout." tone="brilliant" />
        <AccountInfoTile label="Usati" value={String(usedCodes.length)} description="Storico dei codici gia riscattati." tone="terracotta" />
        <AccountInfoTile label="Scaduti/non attivi" value={String(expiredCodes.length)} description="Codici non più applicabili." tone="ceramic" />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Wallet promozioni"
        title="I tuoi codici"
        description="Copia un codice attivo e inseriscilo nel carrello o nel checkout. Le condizioni vengono verificate server-side."
      >
        {codes.length === 0 ? (
          <AccountEmptyState
            title="Non hai ancora codici personali."
            description="Qui appariranno referral, promo locali, codici monouso e sconti riservati al tuo account."
            primary={{ href: "/account/invita", label: "Invita un amico" }}
            secondary={{ href: "/", label: "Torna allo shop" }}
          />
        ) : (
          <div className="account-discount-list">
            {codes.map((code) => {
              const status = discountStatus(code);
              const remainingUses =
                code.perUserLimit !== null ? Math.max(0, code.perUserLimit - code.redemptions.length) : null;
              return (
                <article key={code.id} className="account-discount-card">
                  <div className="account-discount-card-top">
                    <div>
                      <p>{code.description ?? "Codice personale Sessa"}</p>
                      <h2>{discountValue(code)}</h2>
                    </div>
                    <span className={`badge ${statusClass(status.tone)}`}>{status.label}</span>
                  </div>

                  <CopyField value={code.code} />

                  <div className="account-discount-conditions">
                    {scopeDetails(code).map((part) => (
                      <span key={part}>{part}</span>
                    ))}
                    {code.minSubtotalCents !== null && <span>Minimo ordine {formatCents(code.minSubtotalCents)}</span>}
                    {code.startsAt && <span>Dal {code.startsAt.toLocaleDateString("it-IT")}</span>}
                    {code.endsAt && <span>Scade il {code.endsAt.toLocaleDateString("it-IT")}</span>}
                    {remainingUses !== null && <span>Utilizzi rimasti: {remainingUses}</span>}
                    {code.firstOrderOnly && <span>Valido sul primo ordine</span>}
                    {!code.stackable && <span>Non cumulabile</span>}
                  </div>

                  {code.redemptions.length > 0 && (
                    <ul className="account-transaction-list">
                      {code.redemptions.map((redemption) => (
                        <li key={redemption.id}>
                          <span>
                            Usato {redemption.createdAt.toLocaleDateString("it-IT")}
                            {redemption.order?.code ? ` · ${redemption.order.code}` : ""}
                          </span>
                          <strong>-{formatCents(redemption.amountCents)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="account-discount-actions">
                    <Link href={status.tone === "active" ? "/checkout" : "/"} className="btn-secondary">
                      {status.tone === "active" ? "Usa al checkout" : "Vai allo shop"}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AccountPanel>
    </div>
  );
}
