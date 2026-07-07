import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/auth/customer-session";
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
    <div className="space-y-6">
      <h1 className="font-serif text-2xl font-semibold">Profilo</h1>
      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{decodeURIComponent(msg)}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{decodeURIComponent(err)}</p>}

      <section className="card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold">Dati personali</h2>
        <form action={updateProfileAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">Nome</label>
              <input name="firstName" defaultValue={customer.firstName} required className="input-field" />
            </div>
            <div>
              <label className="label-field">Cognome</label>
              <input name="lastName" defaultValue={customer.lastName} required className="input-field" />
            </div>
          </div>
          <div>
            <label className="label-field">Email (non modificabile)</label>
            <input value={customer.email} disabled className="input-field bg-cream/60" />
          </div>
          <div>
            <label className="label-field">Telefono</label>
            <input name="phone" defaultValue={customer.phone ?? ""} className="input-field" />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" name="marketingOptIn" defaultChecked={customer.marketingOptIn} className="accent-terracotta" />
            Voglio ricevere novità e offerte
          </label>
          <button type="submit" className="btn-primary">Salva dati</button>
        </form>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-serif text-xl font-semibold">Cambia password</h2>
        <form action={changeCustomerPasswordAction} className="space-y-4">
          <div>
            <label className="label-field">Password attuale</label>
            <input name="currentPassword" type="password" required autoComplete="current-password" className="input-field" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label-field">Nuova password (min 10)</label>
              <input name="newPassword" type="password" required minLength={10} autoComplete="new-password" className="input-field" />
            </div>
            <div>
              <label className="label-field">Conferma</label>
              <input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" className="input-field" />
            </div>
          </div>
          <button type="submit" className="btn-secondary">Aggiorna password</button>
        </form>
      </section>
    </div>
  );
}
