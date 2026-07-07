import Flash from "@/components/admin/Flash";
import {
  createShippingRateAction,
  deleteShippingRateAction,
  updateShippingRateAction
} from "@/lib/actions/admin/shipping";
import { changeOwnPasswordAction, saveStoreSettingsAction } from "@/lib/actions/admin/settings";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Impostazioni" };

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { msg, err } = await searchParams;
  const [settings, zones] = await Promise.all([
    getSettings([
      "store.name",
      "store.email",
      "store.phone",
      "store.address",
      "store.vat",
      "payments.bankTransferInstructions"
    ]),
    prisma.shippingZone.findMany({
      include: { rates: { orderBy: { position: "asc" } } },
      orderBy: { position: "asc" }
    })
  ]);

  const toEuro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Impostazioni</h1>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <section className="card h-fit p-6">
          <h2 className="mb-4 font-serif text-xl font-semibold">Negozio</h2>
          <form action={saveStoreSettingsAction} className="space-y-3">
            <div>
              <label className="label-field">Nome</label>
              <input
                name="storeName"
                defaultValue={String(settings["store.name"] ?? "Sessa 1930")}
                required
                className="input-field"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field">Email</label>
                <input
                  name="storeEmail"
                  type="email"
                  defaultValue={String(settings["store.email"] ?? "")}
                  required
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-field">Telefono</label>
                <input
                  name="storePhone"
                  defaultValue={String(settings["store.phone"] ?? "")}
                  className="input-field"
                />
              </div>
            </div>
            <div>
              <label className="label-field">Indirizzo</label>
              <input
                name="storeAddress"
                defaultValue={String(settings["store.address"] ?? "")}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-field">Partita IVA</label>
              <input
                name="storeVat"
                defaultValue={String(settings["store.vat"] ?? "")}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-field">Istruzioni bonifico (mostrate al cliente)</label>
              <textarea
                name="bankTransferInstructions"
                rows={3}
                defaultValue={String(settings["payments.bankTransferInstructions"] ?? "")}
                className="input-field"
              />
            </div>
            <button type="submit" className="btn-primary">
              Salva impostazioni
            </button>
          </form>
        </section>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="mb-4 font-serif text-xl font-semibold">Spedizioni</h2>
            {zones.map((zone) => (
              <div key={zone.id} className="mb-4">
                <p className="mb-2 text-sm font-semibold text-ink/60">
                  Zona: {zone.name} ({zone.countries})
                </p>
                <div className="space-y-3">
                  {zone.rates.map((rate) => (
                    <form
                      key={rate.id}
                      action={updateShippingRateAction}
                      className="grid gap-2 rounded-xl border border-ink/10 bg-cream/50 p-3 sm:grid-cols-2"
                    >
                      <input type="hidden" name="id" value={rate.id} />
                      <input type="hidden" name="zoneId" value={zone.id} />
                      <div>
                        <label className="label-field">Nome</label>
                        <input name="name" defaultValue={rate.name} required className="input-field" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="label-field">Costo (€)</label>
                          <input
                            name="amount"
                            defaultValue={toEuro(rate.amountCents)}
                            required
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="label-field">Gratis sopra (€)</label>
                          <input
                            name="freeAbove"
                            defaultValue={rate.freeAboveCents ? toEuro(rate.freeAboveCents) : ""}
                            className="input-field"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="isActive"
                          defaultChecked={rate.isActive}
                          className="accent-terracotta"
                        />
                        Attiva
                      </label>
                      <div className="flex items-center justify-end gap-3">
                        <button type="submit" className="btn-secondary !py-1.5 text-xs">
                          Salva
                        </button>
                        <button
                          type="submit"
                          formAction={deleteShippingRateAction}
                          className="text-xs font-semibold text-terracotta hover:underline"
                        >
                          Elimina
                        </button>
                      </div>
                    </form>
                  ))}
                </div>

                <details className="mt-3 rounded-xl border border-dashed border-terracotta/40">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-terracotta">
                    + Nuova tariffa per {zone.name}
                  </summary>
                  <form action={createShippingRateAction} className="grid gap-2 p-3 sm:grid-cols-3">
                    <input type="hidden" name="zoneId" value={zone.id} />
                    <input name="name" placeholder="Nome" required className="input-field" />
                    <input name="amount" placeholder="Costo €" required className="input-field" />
                    <input name="freeAbove" placeholder="Gratis sopra €" className="input-field" />
                    <button type="submit" className="btn-primary sm:col-span-3">
                      Crea tariffa
                    </button>
                  </form>
                </details>
              </div>
            ))}
          </section>

          <section className="card p-6">
            <h2 className="mb-4 font-serif text-xl font-semibold">Cambia password</h2>
            <form action={changeOwnPasswordAction} className="space-y-3">
              <div>
                <label className="label-field">Password attuale</label>
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input-field"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label-field">Nuova password (min 10)</label>
                  <input
                    name="newPassword"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-field">Conferma</label>
                  <input
                    name="confirmPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    className="input-field"
                  />
                </div>
              </div>
              <button type="submit" className="btn-secondary">
                Aggiorna password
              </button>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
