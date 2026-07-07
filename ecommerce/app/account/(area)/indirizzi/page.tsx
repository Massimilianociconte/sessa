import { requireCustomer } from "@/lib/auth/customer-session";
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
        <input name="label" defaultValue={d?.label ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">Nome e cognome</label>
        <input name="fullName" defaultValue={d?.fullName} required className="input-field" />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Indirizzo</label>
        <input name="line1" defaultValue={d?.line1} required className="input-field" />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Scala / interno (opzionale)</label>
        <input name="line2" defaultValue={d?.line2 ?? ""} className="input-field" />
      </div>
      <div>
        <label className="label-field">Città</label>
        <input name="city" defaultValue={d?.city} required className="input-field" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-field">Provincia</label>
          <input name="province" defaultValue={d?.province} maxLength={4} required className="input-field" />
        </div>
        <div>
          <label className="label-field">CAP</label>
          <input name="postalCode" defaultValue={d?.postalCode} inputMode="numeric" maxLength={5} required className="input-field" />
        </div>
      </div>
      <div>
        <label className="label-field">Telefono</label>
        <input name="phone" defaultValue={d?.phone ?? ""} className="input-field" />
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
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">I miei indirizzi</h1>
      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{decodeURIComponent(msg)}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{decodeURIComponent(err)}</p>}

      <div className="space-y-4">
        {addresses.map((address) => (
          <details key={address.id} className="card">
            <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4 text-sm">
              <span className="font-semibold">{address.label || address.fullName}</span>
              <span className="text-ink/50">
                {address.line1}, {address.postalCode} {address.city}
              </span>
              {address.isDefault && <span className="badge ml-auto bg-brilliant/15 text-emerald-800">Predefinito</span>}
            </summary>
            <div className="border-t border-ink/10 p-5">
              <form action={updateAddressAction} className="space-y-4">
                <input type="hidden" name="id" value={address.id} />
                <AddressFields d={address} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isDefault" defaultChecked={address.isDefault} className="accent-terracotta" />
                  Usa come predefinito
                </label>
                <div className="flex flex-wrap gap-3">
                  <button type="submit" className="btn-secondary">Salva</button>
                </div>
              </form>
              <div className="mt-3 flex gap-4">
                {!address.isDefault && (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="id" value={address.id} />
                    <button type="submit" className="text-xs font-semibold text-ceramic hover:underline">
                      Imposta come predefinito
                    </button>
                  </form>
                )}
                <form action={deleteAddressAction}>
                  <input type="hidden" name="id" value={address.id} />
                  <button type="submit" className="text-xs font-semibold text-terracotta hover:underline">
                    Elimina
                  </button>
                </form>
              </div>
            </div>
          </details>
        ))}
        {addresses.length === 0 && <p className="text-sm text-ink/50">Nessun indirizzo salvato.</p>}
      </div>

      <section className="card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold">Nuovo indirizzo</h2>
        <form action={createAddressAction} className="space-y-4">
          <AddressFields />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isDefault" className="accent-terracotta" />
            Usa come predefinito
          </label>
          <button type="submit" className="btn-primary">Aggiungi indirizzo</button>
        </form>
      </section>
    </div>
  );
}
