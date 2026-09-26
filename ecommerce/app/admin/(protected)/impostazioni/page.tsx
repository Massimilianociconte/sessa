import Flash from "@/components/admin/Flash";
import {
  createShippingRateAction,
  deleteShippingRateAction,
  updateShippingRateAction
} from "@/lib/actions/admin/shipping";
import {
  changeOwnPasswordAction,
  createAdminUserAction,
  resetAdminUserPasswordAction,
  saveLegalSettingsAction,
  saveStoreSettingsAction,
  toggleAdminUserAction,
  updateAdminAccessAction
} from "@/lib/actions/admin/settings";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { hasAdminCapability } from "@/lib/auth/admin-authorization";
import { formatRomeDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export const metadata = { title: "Impostazioni" };

export default async function AdminSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { msg, err } = await searchParams;
  const currentUser = await requireAdmin();
  const isOwner = currentUser.role === "OWNER";
  const canManageSettings = hasAdminCapability(currentUser.role, "settings:manage");
  const [settings, zones, adminUsers, locations] = await Promise.all([
    canManageSettings
      ? getSettings([
          "store.name",
          "store.email",
          "store.phone",
          "store.address",
          "store.vat",
          "payments.bankTransferInstructions",
          "legal.companyName",
          "legal.registeredOffice",
          "legal.vatNumber",
          "legal.taxCode",
          "legal.rea",
          "legal.pec",
          "legal.supportEmail",
          "legal.privacyEmail",
          "legal.supportPhone",
          "legal.termsVersion",
          "notifications.ordersEmail",
          "notifications.alertsEmail",
          "notifications.alertsWebhookUrl",
          "payments.cashMaxCents",
          "payments.cashMaxAdvanceDays",
          "payments.bankTransferMinBusinessDays",
          "payments.bankTransferReservationBusinessDays",
          "payments.maxCardAttempts",
          "orders.customerCancelHours"
        ])
      : Promise.resolve({} as Record<string, unknown>),
    canManageSettings
      ? prisma.shippingZone.findMany({
          include: { rates: { orderBy: { position: "asc" } } },
          orderBy: { position: "asc" }
        })
      : Promise.resolve([]),
    isOwner
      ? prisma.adminUser.findMany({
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            lastLoginAt: true,
            scopeAllLocations: true,
            locationScopes: { select: { locationId: true } }
          }
        })
      : Promise.resolve([]),
    isOwner
      ? prisma.location.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([])
  ]);

  const toEuro = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Impostazioni</h1>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        {canManageSettings && <section className="card h-fit p-6">
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
        </section>}

        {canManageSettings && <section className="card h-fit p-6">
          <h2 className="font-serif text-xl font-semibold">Dati legali, avvisi e regole di pagamento</h2>
          <p className="mb-4 mt-1 text-xs text-ink/50">
            I dati aziendali compaiono in note legali, condizioni di vendita e privacy. Finché mancano, la checklist di lancio lo segnala.
          </p>
          <form action={saveLegalSettingsAction} className="space-y-3">
            {(
              [
                ["companyName", "legal.companyName", "Ragione sociale", "text"],
                ["registeredOffice", "legal.registeredOffice", "Sede legale", "text"],
                ["vatNumber", "legal.vatNumber", "Partita IVA", "text"],
                ["taxCode", "legal.taxCode", "Codice fiscale (se diverso)", "text"],
                ["rea", "legal.rea", "Numero REA", "text"],
                ["pec", "legal.pec", "PEC", "email"],
                ["supportEmail", "legal.supportEmail", "Email assistenza clienti", "email"],
                ["privacyEmail", "legal.privacyEmail", "Email per richieste privacy", "email"],
                ["supportPhone", "legal.supportPhone", "Telefono assistenza", "text"],
                ["termsVersion", "legal.termsVersion", "Versione condizioni di vendita", "text"]
              ] as const
            ).map(([name, key, label, type]) => (
              <div key={name}>
                <label className="label-field" htmlFor={`legal-${name}`}>{label}</label>
                <input id={`legal-${name}`} name={name} type={type} defaultValue={String(settings[key] ?? (name === "termsVersion" ? "2026-09" : ""))} className="input-field" />
              </div>
            ))}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field" htmlFor="ordersEmail">Email avvisi nuovi ordini (fallback)</label>
                <input id="ordersEmail" name="ordersEmail" type="email" defaultValue={String(settings["notifications.ordersEmail"] ?? "")} className="input-field" />
              </div>
              <div>
                <label className="label-field" htmlFor="alertsEmail">Email allarmi tecnici</label>
                <input id="alertsEmail" name="alertsEmail" type="email" defaultValue={String(settings["notifications.alertsEmail"] ?? "")} className="input-field" />
              </div>
            </div>
            <div>
              <label className="label-field" htmlFor="alertsWebhookUrl">Webhook allarmi (Slack/Telegram/Teams, https)</label>
              <input id="alertsWebhookUrl" name="alertsWebhookUrl" defaultValue={String(settings["notifications.alertsWebhookUrl"] ?? "")} className="input-field" placeholder="https://hooks.slack.com/…" />
              <p className="mt-1 text-xs text-ink/45">Consigliato: arriva anche quando le email non partono.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label-field" htmlFor="cashMax">Pagamento in sede fino a (€)</label>
                <input id="cashMax" name="cashMax" defaultValue={toEuro(Number(settings["payments.cashMaxCents"] ?? 15000))} className="input-field" />
              </div>
              <div>
                <label className="label-field" htmlFor="cashMaxAdvanceDays">Pagamento in sede: ritiro entro (giorni)</label>
                <input id="cashMaxAdvanceDays" name="cashMaxAdvanceDays" type="number" min={1} max={60} defaultValue={Number(settings["payments.cashMaxAdvanceDays"] ?? 7)} className="input-field" />
              </div>
              <div>
                <label className="label-field" htmlFor="bankTransferMinBusinessDays">Bonifico: anticipo minimo (giorni lavorativi)</label>
                <input id="bankTransferMinBusinessDays" name="bankTransferMinBusinessDays" type="number" min={1} max={30} defaultValue={Number(settings["payments.bankTransferMinBusinessDays"] ?? 3)} className="input-field" />
              </div>
              <div>
                <label className="label-field" htmlFor="bankTransferReservationBusinessDays">Bonifico: accredito entro (giorni lavorativi)</label>
                <input id="bankTransferReservationBusinessDays" name="bankTransferReservationBusinessDays" type="number" min={1} max={15} defaultValue={Number(settings["payments.bankTransferReservationBusinessDays"] ?? 2)} className="input-field" />
              </div>
              <div>
                <label className="label-field" htmlFor="maxCardAttempts">Tentativi carta per ordine</label>
                <input id="maxCardAttempts" name="maxCardAttempts" type="number" min={1} max={20} defaultValue={Number(settings["payments.maxCardAttempts"] ?? 5)} className="input-field" />
              </div>
              <div>
                <label className="label-field" htmlFor="customerCancelHours">Annullo online fino a (ore prima)</label>
                <input id="customerCancelHours" name="customerCancelHours" type="number" min={0} max={720} defaultValue={Number(settings["orders.customerCancelHours"] ?? 24)} className="input-field" />
              </div>
            </div>
            <button type="submit" className="btn-primary">Salva dati legali e regole</button>
          </form>
        </section>}

        <div className="space-y-6">
          {canManageSettings && <section className="card p-6">
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
                      <div>
                        <label className="label-field">Tipo</label>
                        <select name="scope" defaultValue={rate.scope} className="input-field">
                          <option value="NATIONAL">Corriere (solo prodotti spedibili)</option>
                          <option value="LOCAL">Consegna locale del fresco (CAP della sede)</option>
                        </select>
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
                    <select name="scope" defaultValue="LOCAL" className="input-field sm:col-span-3" aria-label="Tipo di consegna">
                      <option value="LOCAL">Consegna locale del fresco (CAP della sede)</option>
                      <option value="NATIONAL">Corriere (solo prodotti spedibili)</option>
                    </select>
                    <button type="submit" className="btn-primary sm:col-span-3">
                      Crea tariffa
                    </button>
                  </form>
                </details>
              </div>
            ))}
          </section>}

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
                  <label className="label-field">Nuova password (min 12)</label>
                  <input
                    name="newPassword"
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
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
                    minLength={12}
                    maxLength={128}
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

          {isOwner && (
            <section className="card p-6">
              <h2 className="mb-1 font-serif text-xl font-semibold">Utenti gestionale</h2>
              <p className="mb-4 text-xs text-ink/50">
                Solo il proprietario vede questa sezione. Disattivare un utente revoca subito le sue sessioni.
              </p>

              <ul className="space-y-3">
                {adminUsers.map((adminUser) => (
                  <li key={adminUser.id} className="rounded-2xl border border-ink/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {adminUser.name}{" "}
                          <span className={`badge ml-1 ${adminUser.role === "OWNER" ? "bg-terracotta/15 text-terracotta" : "bg-cream text-ink/60"}`}>
                            {adminUser.role}
                          </span>
                          {!adminUser.isActive && <span className="badge ml-1 bg-ink/10 text-ink/50">Disattivato</span>}
                        </p>
                        <p className="text-xs text-ink/50">
                          {adminUser.email}
                          {adminUser.lastLoginAt &&
                            ` · ultimo accesso ${formatRomeDateTime(adminUser.lastLoginAt)}`}
                        </p>
                      </div>
                      {adminUser.role !== "OWNER" && (
                        <form action={toggleAdminUserAction} className="flex flex-wrap items-center justify-end gap-2">
                          <input type="hidden" name="userId" value={adminUser.id} />
                          <input
                            name="ownerPassword"
                            type="password"
                            required
                            maxLength={128}
                            autoComplete="current-password"
                            className="input-field !w-40 !py-2 text-xs"
                            placeholder="Password owner"
                            aria-label="Password proprietario"
                          />
                          <button type="submit" className="btn-ghost text-xs">
                            {adminUser.isActive ? "Disattiva" : "Riattiva"}
                          </button>
                        </form>
                      )}
                    </div>
                    {adminUser.role !== "OWNER" && (
                      <details className="mt-3 rounded-xl border border-ink/10 bg-cream/35 p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-ink/60">Ruolo e sedi autorizzate</summary>
                        <form action={updateAdminAccessAction} className="mt-3 space-y-3">
                          <input type="hidden" name="userId" value={adminUser.id} />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="label-field">Ruolo</label>
                              <select name="role" className="input-field" defaultValue={adminUser.role}>
                                <option value="STORE_MANAGER">Responsabile sede</option>
                                <option value="FULFILLMENT">Preparazione ordini</option>
                                <option value="MARKETING">Marketing e catalogo</option>
                                <option value="ADMIN">Amministratore globale</option>
                              </select>
                            </div>
                            <div>
                              <label className="label-field">Conferma proprietario</label>
                              <input name="ownerPassword" type="password" required maxLength={128} autoComplete="current-password" className="input-field" />
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <input type="checkbox" name="scopeAllLocations" defaultChecked={adminUser.scopeAllLocations} className="accent-terracotta" />
                            Tutte le sedi (per ruoli operativi)
                          </label>
                          <fieldset>
                            <legend className="label-field">Sedi assegnate</legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {locations.map((location) => (
                                <label key={location.id} className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm">
                                  <input type="checkbox" name="locationIds" value={location.id} defaultChecked={adminUser.locationScopes.some((scope) => scope.locationId === location.id)} className="accent-terracotta" />
                                  {location.name}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <button type="submit" className="btn-secondary !py-2 text-xs">Aggiorna accesso</button>
                        </form>
                      </details>
                    )}
                    {adminUser.role !== "OWNER" && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-ink/50">
                          Reimposta password
                        </summary>
                        <form action={resetAdminUserPasswordAction} className="mt-2 flex flex-wrap items-end gap-2">
                          <input type="hidden" name="userId" value={adminUser.id} />
                          <div className="min-w-56 flex-1">
                            <label className="label-field">Nuova password (min 12)</label>
                            <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input-field" />
                          </div>
                          <div className="min-w-56 flex-1">
                            <label className="label-field">Password proprietario</label>
                            <input name="ownerPassword" type="password" required maxLength={128} autoComplete="current-password" className="input-field" />
                          </div>
                          <button type="submit" className="btn-secondary !py-2 text-xs">
                            Reimposta
                          </button>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>

              <details className="mt-5">
                <summary className="cursor-pointer text-sm font-semibold text-terracotta">
                  + Aggiungi utente
                </summary>
                <form action={createAdminUserAction} className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label-field">Nome e cognome</label>
                      <input name="name" required autoComplete="off" className="input-field" />
                    </div>
                    <div>
                      <label className="label-field">Email</label>
                      <input name="email" type="email" required autoComplete="off" className="input-field" />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label-field">Password iniziale (min 12)</label>
                      <input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input-field" />
                    </div>
                    <div>
                      <label className="label-field">Ruolo</label>
                      <select name="role" className="input-field" defaultValue="STORE_MANAGER">
                        <option value="STORE_MANAGER">Responsabile sede</option>
                        <option value="FULFILLMENT">Preparazione ordini</option>
                        <option value="MARKETING">Marketing e catalogo</option>
                        <option value="ADMIN">Amministratore globale</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" name="scopeAllLocations" className="accent-terracotta" />
                    Tutte le sedi (solo ruoli operativi)
                  </label>
                  <fieldset>
                    <legend className="label-field">Sedi assegnate</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {locations.map((location) => (
                        <label key={location.id} className="flex items-center gap-2 rounded-lg border border-ink/10 bg-cream/40 px-3 py-2 text-sm">
                          <input type="checkbox" name="locationIds" value={location.id} className="accent-terracotta" />
                          {location.name}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div>
                    <label className="label-field">Password proprietario</label>
                    <input name="ownerPassword" type="password" required maxLength={128} autoComplete="current-password" className="input-field" />
                  </div>
                  <button type="submit" className="btn-primary">
                    Crea utente
                  </button>
                </form>
              </details>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
