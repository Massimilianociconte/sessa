import { AccountEmptyState, AccountInfoGrid, AccountInfoTile, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import {
  logoutAllCustomerSessionsAction,
  logoutCustomerSessionAction,
  logoutOtherCustomerSessionsAction
} from "@/lib/actions/account/auth";
import { deleteAccountAction } from "@/lib/actions/account/privacy";
import { TwoFactorEnroll, TwoFactorManage } from "@/components/account/TwoFactorSetup";
import { getSessionCustomer, listCustomerSessions } from "@/lib/auth/customer-session";
import { getTwoFactorStatus } from "@/lib/services/customer-2fa";

export const metadata = { title: "Sicurezza" };

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function deviceName(userAgent: string | null) {
  if (!userAgent) return "Dispositivo non riconosciuto";
  const os = userAgent.includes("iPhone")
    ? "iPhone"
    : userAgent.includes("iPad")
      ? "iPad"
      : userAgent.includes("Android")
        ? "Android"
        : userAgent.includes("Mac OS X")
          ? "Mac"
          : userAgent.includes("Windows")
            ? "Windows"
            : "Dispositivo";
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Safari/")
        ? "Safari"
        : "Browser";
  return `${browser} su ${os}`;
}

function maskIp(ip: string | null) {
  if (!ip) return "IP non disponibile";
  if (ip === "local" || ip === "::1" || ip === "127.0.0.1") return "Locale";
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.…` : ip;
}

export default async function AccountSecurityPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [{ msg, err }, customer] = await Promise.all([searchParams, getSessionCustomer()]);
  const [sessions, twoFactor] = customer
    ? await Promise.all([listCustomerSessions(customer.id), getTwoFactorStatus(customer.id)])
    : [[], { enabled: false, enabledAt: null, backupRemaining: 0, backupTotal: 0 }];
  const otherSessions = sessions.filter((session) => !session.isCurrent);

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Protezione account"
        title="Sicurezza"
        description="Controlla i dispositivi connessi, chiudi accessi specifici e ricevi avvisi quando qualcuno entra o cambia la password."
      />

      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{decodeURIComponent(msg)}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{decodeURIComponent(err)}</p>}

      <AccountInfoGrid>
        <AccountInfoTile label="Sessioni attive" value={String(sessions.length)} description={`${otherSessions.length} dispositiv${otherSessions.length === 1 ? "o" : "i"} oltre a questo.`} tone="terracotta" />
        <AccountInfoTile
          label="Verifica in 2 passaggi"
          value={twoFactor.enabled ? "Attiva" : "Non attiva"}
          description={
            twoFactor.enabled
              ? `Codice app richiesto al login · ${twoFactor.backupRemaining} codici di recupero rimasti.`
              : "Aggiungi il codice dell'app authenticator al login."
          }
          tone="ceramic"
        />
        <AccountInfoTile label="Password" value="Protetta" description="Hash server-side e rotazione sessioni dopo cambio o reset." tone="brilliant" />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Autenticazione forte"
        title="Verifica in due passaggi (2FA)"
        description={
          twoFactor.enabled
            ? "Attiva: oltre alla password serve il codice dell'app authenticator. Gestisci qui codici di recupero e disattivazione."
            : "Proteggi l'account con un codice temporaneo generato dal tuo telefono (TOTP standard: Google Authenticator, 1Password, Aegis…)."
        }
      >
        {twoFactor.enabled ? (
          <TwoFactorManage backupRemaining={twoFactor.backupRemaining} />
        ) : (
          <TwoFactorEnroll />
        )}
      </AccountPanel>

      <AccountPanel
        eyebrow="Dispositivi"
        title="Sessioni attive"
        description="Ogni sessione è revocabile dal server: se la chiudi, il relativo cookie non può più autenticare richieste."
        action={
          <div className="account-session-actions">
            <form action={logoutOtherCustomerSessionsAction}>
              <button type="submit" className="btn-secondary" disabled={otherSessions.length === 0}>
                Chiudi altri dispositivi
              </button>
            </form>
            <form action={logoutAllCustomerSessionsAction}>
              <button type="submit" className="btn-secondary">
                Esci ovunque
              </button>
            </form>
          </div>
        }
      >
        {sessions.length === 0 ? (
          <AccountEmptyState
            title="Nessuna sessione attiva."
            description="Accedi nuovamente per ripristinare una sessione sicura su questo dispositivo."
          />
        ) : (
          <ul className="account-session-list">
            {sessions.map((session) => (
              <li key={session.id} className="account-session-card" data-current={session.isCurrent ? "true" : "false"}>
                <div className="account-session-main">
                  <div>
                    <strong>{deviceName(session.userAgent)}</strong>
                    <span>{session.isCurrent ? "Questo dispositivo" : "Sessione remota"}</span>
                  </div>
                  {session.isCurrent && <span className="badge bg-brilliant/15 text-emerald-800">Attuale</span>}
                </div>
                <div className="account-session-meta">
                  <span>IP {maskIp(session.ipAddress)}</span>
                  <span>Ultimo uso {formatDate(session.lastSeenAt)}</span>
                  <span>Creata {formatDate(session.createdAt)}</span>
                  <span>Scade {formatDate(session.expiresAt)}</span>
                </div>
                <form action={logoutCustomerSessionAction}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button type="submit" className={session.isCurrent ? "btn-secondary" : "btn-ghost"}>
                    {session.isCurrent ? "Disconnetti questo" : "Disconnetti"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </AccountPanel>

      <AccountPanel
        eyebrow="Privacy"
        title="I tuoi dati"
        description="Scarica una copia completa dei tuoi dati o elimina definitivamente l'account. Gli ordini restano conservati in forma anonima per gli obblighi fiscali."
      >
        <div className="space-y-6">
          <div>
            <a href="/account/esporta-dati" className="btn-secondary" download>
              Scarica i miei dati (JSON)
            </a>
            <p className="mt-2 text-xs text-ink/45">
              Include profilo, indirizzi, storico ordini, gift card, sconti usati e referral.
            </p>
          </div>
          <form action={deleteAccountAction} className="space-y-3 rounded-2xl border border-terracotta/30 bg-terracotta/5 p-4">
            <p className="text-sm font-semibold text-terracotta">Elimina account</p>
            <p className="text-xs leading-5 text-ink/60">
              Azione definitiva: i dati personali vengono anonimizzati e tutte le sessioni chiuse.
              Le gift card restano spendibili tramite codice.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="deletePassword" className="label-field">Password</label>
                <input id="deletePassword" name="password" type="password" required autoComplete="current-password" className="input-field" />
              </div>
              <div>
                <label htmlFor="deleteConfirm" className="label-field">Scrivi ELIMINA per confermare</label>
                <input id="deleteConfirm" name="confirm" required placeholder="ELIMINA" className="input-field uppercase" />
              </div>
            </div>
            <button type="submit" className="btn-secondary !border-terracotta !text-terracotta">
              Elimina definitivamente il mio account
            </button>
          </form>
        </div>
      </AccountPanel>

      <AccountPanel
        eyebrow="Protezione avanzata"
        title="Protezioni dell'account"
        description="Lo stato delle difese attive su questo account. La passkey resta il prossimo passo naturale."
      >
        <div className="account-security-grid">
          {[
            ["App authenticator", "TOTP con QR code, conferma iniziale e codici di recupero monouso.", twoFactor.enabled ? "Attivo" : "Attivabile qui sopra"],
            ["Passkey", "Accesso moderno con Face ID, Touch ID o chiave dispositivo compatibile.", "Modulo successivo"],
            ["Avvisi sensibili", "Email automatica per nuovi accessi, cambio password, cambio email e 2FA.", "Attivo"]
          ].map(([title, copy, status]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{copy}</p>
              <span>{status}</span>
            </div>
          ))}
        </div>
      </AccountPanel>
    </div>
  );
}
