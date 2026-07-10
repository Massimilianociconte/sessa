import Link from "next/link";
import {
  AccountEmptyState,
  AccountInfoGrid,
  AccountInfoTile,
  AccountPageIntro,
  AccountPanel
} from "@/components/account/AccountUi";
import { updatePreferencesAction } from "@/lib/actions/account/preferences";
import { requireCustomer } from "@/lib/auth/customer-session";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/lib/domain";
import { getCustomerPreferenceSnapshot } from "@/lib/services/customer-account";

export const dynamic = "force-dynamic";

export const metadata = { title: "Preferenze" };

function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function AccountPreferencesPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [{ msg, err }, customer] = await Promise.all([searchParams, requireCustomer()]);
  const snapshot = await getCustomerPreferenceSnapshot(customer.id);
  const effectiveFulfillment = snapshot.effectiveFulfillment
    ? FULFILLMENT_LABELS[snapshot.effectiveFulfillment as FulfillmentType]
    : "Da scegliere";
  const isSavedLocation = Boolean(snapshot.savedLocation);
  const isSavedFulfillment = Boolean(snapshot.customer?.preferredFulfillment);

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Esperienza"
        title="Preferenze"
        description="Sede, modalità e ricorrenze salvate qui guidano checkout, suggerimenti e promozioni locali."
      >
        <Link href="/account/profilo" className="btn-secondary">Aggiorna dati</Link>
      </AccountPageIntro>

      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{msg}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{err}</p>}

      <AccountInfoGrid>
        <AccountInfoTile
          label="Sede preferita"
          value={snapshot.effectiveLocation?.name ?? "Da scegliere"}
          description={
            isSavedLocation
              ? "Scelta da te: guida catalogo e suggerimenti."
              : snapshot.effectiveLocation
                ? "Derivata dal tuo ultimo ordine. Salvala per fissarla."
                : "Scegli una sede per catalogo e stock locali."
          }
          tone="terracotta"
        />
        <AccountInfoTile
          label="Modalità preferita"
          value={effectiveFulfillment}
          description={
            isSavedFulfillment
              ? "Scelta da te: preimpostata al checkout."
              : "Dedotta dagli ordini; salvala per fissarla."
          }
          tone="ceramic"
        />
        <AccountInfoTile
          label="Compleanno"
          value={snapshot.customer?.birthday ? toDateInput(snapshot.customer.birthday).split("-").reverse().join("/") : "Non indicato"}
          description="Ci permette di riservarti attenzioni e promo di compleanno."
          tone="brilliant"
        />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Le tue scelte"
        title="Imposta le preferenze"
        description="Valgono su tutto l'ecommerce: catalogo suggerito, checkout precompilato e comunicazioni locali."
      >
        <form action={updatePreferencesAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="preferredLocationId" className="label-field">Sede preferita</label>
              <select
                id="preferredLocationId"
                name="preferredLocationId"
                defaultValue={snapshot.customer?.preferredLocationId ?? ""}
                className="input-field"
              >
                <option value="">Nessuna preferenza</option>
                {snapshot.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} — {location.city}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="preferredFulfillment" className="label-field">Modalità preferita</label>
              <select
                id="preferredFulfillment"
                name="preferredFulfillment"
                defaultValue={snapshot.customer?.preferredFulfillment ?? ""}
                className="input-field"
              >
                <option value="">Nessuna preferenza</option>
                <option value="PICKUP">{FULFILLMENT_LABELS.PICKUP}</option>
                <option value="DELIVERY">{FULFILLMENT_LABELS.DELIVERY}</option>
              </select>
            </div>
          </div>
          <div className="sm:max-w-xs">
            <label htmlFor="birthday" className="label-field">Compleanno</label>
            <input
              id="birthday"
              name="birthday"
              type="date"
              defaultValue={toDateInput(snapshot.customer?.birthday)}
              className="input-field"
            />
          </div>
          <button type="submit" className="btn-primary">Salva preferenze</button>
        </form>
      </AccountPanel>

      <AccountPanel
        eyebrow="Checkout"
        title="Come le usiamo"
        description="Questi dati riducono i passaggi nei flussi d'acquisto."
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
            <strong>{snapshot.effectiveLocation?.name ?? "Sessa 1930"}</strong>
            <span>
              {snapshot.effectiveLocation
                ? `Catalogo locale di ${snapshot.effectiveLocation.city}.`
                : "Scegli la sede da cui vuoi ordinare più spesso."}
            </span>
            <Link
              href={snapshot.effectiveLocation?.slug ? `/sede/${snapshot.effectiveLocation.slug}` : "/"}
              className="btn-ghost"
            >
              Apri catalogo
            </Link>
          </div>
          <div>
            <p>Modalità al checkout</p>
            <strong>{effectiveFulfillment}</strong>
            <span>Preimpostata quando arrivi al checkout: la puoi sempre cambiare lì.</span>
            <Link href="/account/gift-card" className="btn-ghost">Vedi crediti</Link>
          </div>
        </div>
      </AccountPanel>

      <AccountPanel
        eyebrow="Sedi"
        title="Cataloghi locali"
        description="Le preferenze di sede permettono di mostrare disponibilità, ritiro e consegna corretti."
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
