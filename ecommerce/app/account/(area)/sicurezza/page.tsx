import { logoutAllCustomerSessionsAction } from "@/lib/actions/account/auth";
import { getSessionCustomer, listCustomerSessions } from "@/lib/auth/customer-session";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export default async function AccountSecurityPage() {
  const customer = await getSessionCustomer();
  const sessions = customer ? await listCustomerSessions(customer.id) : [];

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-terracotta">Protezione account</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Sicurezza</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
          Gestisci le sessioni attive e prepara il profilo per i prossimi livelli gratuiti di protezione: app authenticator,
          codici di recupero e passkey.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/45">Sessioni</p>
          <p className="mt-2 font-serif text-3xl font-semibold text-terracotta">{sessions.length}</p>
          <p className="mt-1 text-xs text-ink/55">Dispositivi con accesso ancora valido.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/45">Password</p>
          <p className="mt-2 font-serif text-2xl font-semibold">Attiva</p>
          <p className="mt-1 text-xs text-ink/55">Hash server-side, mai esposta al client.</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-ink/45">2FA</p>
          <p className="mt-2 font-serif text-2xl font-semibold">Predisposta</p>
          <p className="mt-1 text-xs text-ink/55">TOTP e backup codes sono la strada consigliata, senza SMS.</p>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Sessioni attive</h2>
            <p className="mt-1 text-sm text-ink/55">Esci da tutti i dispositivi se noti attività sospetta.</p>
          </div>
          <form action={logoutAllCustomerSessionsAction}>
            <button type="submit" className="btn-secondary">
              Esci da tutti i dispositivi
            </button>
          </form>
        </div>

        <ul className="mt-5 divide-y divide-ink/10">
          {sessions.map((session, index) => (
            <li key={session.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="font-semibold text-ink">{index === 0 ? "Sessione recente" : "Sessione salvata"}</span>
              <span className="text-ink/55">
                Creata {formatDate(session.createdAt)} · scade {formatDate(session.expiresAt)}
              </span>
            </li>
          ))}
          {sessions.length === 0 && (
            <li className="py-4 text-sm text-ink/55">Nessuna sessione attiva oltre a questa richiesta.</li>
          )}
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="font-serif text-2xl font-semibold">Prossime protezioni consigliate</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ["App authenticator", "TOTP gratuito con QR code e codici di recupero monouso."],
            ["Passkey", "Accesso moderno con Face ID, Touch ID o chiave dispositivo compatibile."],
            ["Avvisi accesso", "Email automatiche per nuovo login, cambio password e modifica dati sensibili."]
          ].map(([title, copy]) => (
            <div key={title} className="rounded-2xl border border-ink/10 bg-cream/60 p-4">
              <p className="font-serif text-lg font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-ink/55">{copy}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
