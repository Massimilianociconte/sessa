import Link from "next/link";
import {
  AccountEmptyState,
  AccountInfoGrid,
  AccountInfoTile,
  AccountPageIntro,
  AccountPanel
} from "@/components/account/AccountUi";
import { requireCustomer } from "@/lib/auth/customer-session";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/lib/domain";
import { getCustomerPreferenceSnapshot } from "@/lib/services/customer-account";

export const metadata = { title: "Preferenze" };

export default async function AccountPreferencesPage() {
  const customer = await requireCustomer();
  const snapshot = await getCustomerPreferenceSnapshot(customer.id);
  const preferredFulfillment = snapshot.inferredFulfillmentType
    ? FULFILLMENT_LABELS[snapshot.inferredFulfillmentType as FulfillmentType]
    : "Da scegliere";

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Esperienza"
        title="Preferenze"
        description="Una base pronta per checkout piu rapido, promo locali, riordino intelligente e comunicazioni piu pertinenti."
      >
        <Link href="/account/profilo" className="btn-secondary">Aggiorna dati</Link>
      </AccountPageIntro>

      <AccountInfoGrid>
        <AccountInfoTile
          label="Sede preferita"
          value={snapshot.inferredLocation?.name ?? "Da scegliere"}
          description={snapshot.inferredLocation ? "Derivata dal tuo ultimo ordine." : "Scegli una sede per catalogo e stock locali."}
          tone="terracotta"
        />
        <AccountInfoTile
          label="Modalita preferita"
          value={preferredFulfillment}
          description="Usata per suggerire il percorso piu rapido al checkout."
          tone="ceramic"
        />
        <AccountInfoTile
          label="Newsletter"
          value={snapshot.customer?.marketingOptIn ? "Attiva" : "Non attiva"}
          description="Novita, promo locali e ricorrenze Sessa."
          tone="brilliant"
        />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Checkout"
        title="Preferenze operative"
        description="Questi dati migliorano velocita e precisione nei flussi futuri."
      >
        <div className="account-preference-grid">
          <div>
            <p>Indirizzo preferito</p>
            <strong>
              {snapshot.defaultAddress
                ? `${snapshot.defaultAddress.line1}, ${snapshot.defaultAddress.city}`
                : "Nessun indirizzo salvato"}
            </strong>
            <span>
              {snapshot.defaultAddress
                ? `${snapshot.defaultAddress.postalCode} ${snapshot.defaultAddress.province}`
                : "Salva un indirizzo per compilare meno campi."}
            </span>
            <Link href="/account/indirizzi" className="btn-ghost">Gestisci indirizzi</Link>
          </div>
          <div>
            <p>Sede suggerita</p>
            <strong>{snapshot.inferredLocation?.name ?? "Sessa 1930"}</strong>
            <span>
              {snapshot.inferredLocation
                ? `Catalogo locale di ${snapshot.inferredLocation.city}.`
                : "Scegli la sede da cui vuoi ordinare piu spesso."}
            </span>
            <Link href={snapshot.inferredLocation?.slug ? `/sede/${snapshot.inferredLocation.slug}` : "/"} className="btn-ghost">
              Apri catalogo
            </Link>
          </div>
          <div>
            <p>Regali e ricorrenze</p>
            <strong>Predisposto</strong>
            <span>Spazio pronto per compleanni, note regalo, preferenze packaging e reminder stagionali.</span>
            <Link href="/account/gift-card" className="btn-ghost">Vedi crediti</Link>
          </div>
        </div>
      </AccountPanel>

      <AccountPanel
        eyebrow="Sedi"
        title="Cataloghi locali"
        description="Le preferenze di sede permettono di mostrare disponibilita, ritiro e consegna corretti."
      >
        {snapshot.locations.length === 0 ? (
          <AccountEmptyState
            title="Nessuna sede disponibile."
            description="Quando le sedi saranno attive, potrai impostare la preferenza locale da questa sezione."
          />
        ) : (
          <div className="account-location-grid">
            {snapshot.locations.map((location) => (
              <Link key={location.id} href={`/sede/${location.slug}`} className="account-location-card">
                <span>{location.city}</span>
                <strong>{location.name}</strong>
                <p>
                  {location.pickupEnabled ? "Ritiro" : ""}
                  {location.pickupEnabled && location.deliveryEnabled ? " + " : ""}
                  {location.deliveryEnabled ? "Consegna" : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </AccountPanel>
    </div>
  );
}
