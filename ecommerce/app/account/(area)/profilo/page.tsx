import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/auth/customer-session";
import { AccountInfoGrid, AccountInfoTile, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import {
  changeCustomerPasswordAction,
  updateProfileAction
} from "@/lib/actions/account/profile";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profilo" };

export default async function AccountProfilePage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [{ msg, err }, session] = await Promise.all([searchParams, requireCustomer()]);
  const customer = await prisma.customer.findUnique({ where: { id: session.id } });
  if (!customer) return null;

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Dati personali"
        title="Profilo"
        description="Mantieni aggiornati i dati essenziali per checkout, ricevute, assistenza sede e comunicazioni utili."
      />
      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{decodeURIComponent(msg)}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{decodeURIComponent(err)}</p>}

      <AccountInfoGrid>
        <AccountInfoTile label="Email" value={customer.emailVerified ? "Verificata" : "Da verificare"} description={customer.email} tone="ceramic" />
        <AccountInfoTile label="Telefono" value={customer.phone ? "Presente" : "Mancante"} description={customer.phone ?? "Aggiungilo per consegne e contatti sede."} tone="terracotta" />
        <AccountInfoTile label="Newsletter" value={customer.marketingOptIn ? "Attiva" : "Non attiva"} description="Promozioni locali, ricorrenze e novita Sessa." tone="brilliant" />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Anagrafica"
        title="Dati personali"
        description="Questi dati restano collegati solo al tuo account e agli ordini effettuati."
      >
        <form action={updateProfileAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="label-field">Nome</label>
              <input id="firstName" name="firstName" defaultValue={customer.firstName} required autoComplete="given-name" className="input-field" />
            </div>
            <div>
              <label htmlFor="lastName" className="label-field">Cognome</label>
              <input id="lastName" name="lastName" defaultValue={customer.lastName} required autoComplete="family-name" className="input-field" />
            </div>
          </div>
          <div>
            <label htmlFor="email" className="label-field">Email (non modificabile)</label>
            <input id="email" value={customer.email} disabled autoComplete="email" className="input-field bg-cream/60" />
          </div>
          <div>
            <label htmlFor="phone" className="label-field">Telefono</label>
            <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={customer.phone ?? ""} className="input-field" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" name="marketingOptIn" defaultChecked={customer.marketingOptIn} className="accent-terracotta" />
            Voglio ricevere novita, promozioni locali e comunicazioni Sessa.
          </label>
          <button type="submit" className="btn-primary">Salva dati</button>
        </form>
      </AccountPanel>

      <AccountPanel
        eyebrow="Accesso"
        title="Cambia password"
        description="Dopo l'aggiornamento le altre sessioni vengono disconnesse per proteggere l'account."
      >
        <form action={changeCustomerPasswordAction} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="label-field">Password attuale</label>
            <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className="input-field" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="newPassword" className="label-field">Nuova password (min 10)</label>
              <input id="newPassword" name="newPassword" type="password" required minLength={10} autoComplete="new-password" className="input-field" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="label-field">Conferma</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" className="input-field" />
            </div>
          </div>
          <button type="submit" className="btn-secondary">Aggiorna password</button>
        </form>
      </AccountPanel>
    </div>
  );
}
