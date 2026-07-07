import { requireCustomer } from "@/lib/auth/customer-session";
import { AccountEmptyState, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import {
  createAddressAction,
  deleteAddressAction,
  setDefaultAddressAction,
  updateAddressAction
} from "@/lib/actions/account/addresses";
import { listAddresses } from "@/lib/services/customer-account";

export const dynamic = "force-dynamic";

export const metadata = { title: "I miei indirizzi" };

type AddressDefaults = {
  label: string | null;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string | null;
};

function AddressFields({ d }: { d?: AddressDefaults }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label-field">Etichetta (Casa, Ufficio…)</label>
        <input name="label" defaultValue={d?.label ?? ""} autoComplete="address-level4" className="input-field" />
      </div>
      <div>
        <label className="label-field">Nome e cognome</label>
        <input name="fullName" defaultValue={d?.fullName} required autoComplete="name" className="input-field" />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Indirizzo</label>
        <input name="line1" defaultValue={d?.line1} required autoComplete="address-line1" className="input-field" />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Scala / interno (opzionale)</label>
        <input name="line2" defaultValue={d?.line2 ?? ""} autoComplete="address-line2" className="input-field" />
      </div>
      <div>
        <label className="label-field">Città</label>
        <input name="city" defaultValue={d?.city} required autoComplete="address-level2" className="input-field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-field">Provincia</label>
          <input name="province" defaultValue={d?.province} maxLength={4} required autoComplete="address-level1" className="input-field" />
        </div>
        <div>
          <label className="label-field">CAP</label>
          <input name="postalCode" defaultValue={d?.postalCode} inputMode="numeric" maxLength={5} required autoComplete="postal-code" className="input-field" />
        </div>
      </div>
      <div>
        <label className="label-field">Telefono</label>
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={d?.phone ?? ""} className="input-field" />
      </div>
    </div>
  );
}

export default async function AccountAddressesPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [{ msg, err }, customer] = await Promise.all([searchParams, requireCustomer()]);
  const addresses = await listAddresses(customer.id);

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Checkout più veloce"
        title="Indirizzi salvati"
        description="Gestisci casa, lavoro o altri recapiti: il checkout li usera per ridurre campi e passaggi."
      />
      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{decodeURIComponent(msg)}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{decodeURIComponent(err)}</p>}

      <AccountPanel
        eyebrow="Rubrica"
        title="I tuoi recapiti"
        description="Tocca una card per modificarla, impostarla come predefinita o rimuoverla."
      >
        <div className="account-address-grid">
          {addresses.map((address) => (
            <details key={address.id} className="account-address-card">
              <summary>
                <div>
                  <p>{address.label || "Indirizzo"}</p>
                  <h2>{address.fullName}</h2>
                  <span>
                    {address.line1}, {address.postalCode} {address.city}
                  </span>
                </div>
                {address.isDefault && <span className="badge bg-brilliant/15 text-emerald-800">Predefinito</span>}
              </summary>
              <div className="account-address-editor">
                <form action={updateAddressAction} className="space-y-4">
                  <input type="hidden" name="id" value={address.id} />
                  <AddressFields d={address} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isDefault" defaultChecked={address.isDefault} className="accent-terracotta" />
                    Usa come predefinito
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" className="btn-primary">Salva modifiche</button>
                  </div>
                </form>
                <div className="mt-4 flex flex-wrap gap-3">
                  {!address.isDefault && (
                    <form action={setDefaultAddressAction}>
                      <input type="hidden" name="id" value={address.id} />
                      <button type="submit" className="btn-secondary !py-2 text-xs">
                        Imposta predefinito
                      </button>
                    </form>
                  )}
                  <form action={deleteAddressAction}>
                    <input type="hidden" name="id" value={address.id} />
                    <button type="submit" className="btn-ghost !py-2 text-xs text-terracotta">
                      Elimina
                    </button>
                  </form>
                </div>
              </div>
            </details>
          ))}
          {addresses.length === 0 && (
            <AccountEmptyState
              title="Salva un indirizzo per rendere il checkout più veloce."
              description="Potrai scegliere il recapito in un tap e ridurre gli errori su telefono, CAP e citofono."
              primary={{ href: "#nuovo-indirizzo", label: "Aggiungi indirizzo" }}
            />
          )}
        </div>
      </AccountPanel>

      <AccountPanel
        eyebrow="Nuovo recapito"
        title="Aggiungi indirizzo"
        description="Usa un'etichetta chiara come Casa, Ufficio o Famiglia per riconoscerlo al checkout."
      >
        <form action={createAddressAction} className="space-y-4">
          <div id="nuovo-indirizzo" />
          <AddressFields />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" className="accent-terracotta" />
            Usa come predefinito
          </label>
          <button type="submit" className="btn-primary">Aggiungi indirizzo</button>
        </form>
      </AccountPanel>
    </div>
  );
}
