import { AccountBadge, AccountEmptyState, AccountInfoGrid, AccountInfoTile, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import {
  logoutAllCustomerSessionsAction,
  logoutCustomerSessionAction,
  logoutOtherCustomerSessionsAction
} from "@/lib/actions/account/auth";
import { deleteAccountAction } from "@/lib/actions/account/privacy";
import { TwoFactorEnroll, TwoFactorManage } from "@/components/account/TwoFactorSetup";
import PasskeyManager, { type PasskeyView } from "@/components/account/PasskeyManager";
import { getSessionCustomer, listCustomerSessions } from "@/lib/auth/customer-session";
import { getTwoFactorStatus } from "@/lib/services/customer-2fa";
import { listPasskeys } from "@/lib/services/customer-passkeys";

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
  const [sessions, twoFactor, passkeys] = customer
    ? await Promise.all([
        listCustomerSessions(customer.id),
        getTwoFactorStatus(customer.id),
        listPasskeys(customer.id)
      ])
    : [[], { enabled: false, enabledAt: null, backupRemaining: 0, backupTotal: 0 }, []];
  const otherSessions = sessions.filter((session) => !session.isCurrent);
  const passkeyViews: PasskeyView[] = passkeys.map((pk) => ({
    id: pk.id,
    name: pk.name,
    deviceType: pk.deviceType,
    backedUp: pk.backedUp,
    createdAt: pk.createdAt.toISOString(),
    lastUsedAt: pk.lastUsedAt ? pk.lastUsedAt.toISOString() : null
  }));

  return (
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Protezione account"
        title="Sicurezza"
        description="Passkey, verifica in due passaggi, dispositivi connessi e controllo dei tuoi dati: tutto in una pagina."
      />

      {msg && <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">{decodeURIComponent(msg)}</p>}
      {err && <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{decodeURIComponent(err)}</p>}

      <AccountInfoGrid>
        <AccountInfoTile
          label="Passkey"
          badge={
            passkeys.length > 0 ? (
              <AccountBadge tone="success">Configurata</AccountBadge>
            ) : (
              <AccountBadge tone="neutral">Da configurare</AccountBadge>
            )
          }
          description={
            passkeys.length > 0
              ? `${passkeys.length} dispositiv${passkeys.length === 1 ? "o" : "i"} con accesso rapido senza password.`
              : "Accedi con Face ID, Touch ID o impronta: più veloce della password."
          }
          tone="terracotta"
        />
        <AccountInfoTile
          label="Verifica in 2 passaggi"
          badge={
            twoFactor.enabled ? (
              <AccountBadge tone="success">Attiva</AccountBadge>
            ) : (
              <AccountBadge tone="neutral">Non attiva</AccountBadge>
            )
          }
          description={
            twoFactor.enabled
              ? `Codice app richiesto al login · ${twoFactor.backupRemaining} codici di recupero rimasti.`
              : "Aggiungi il codice dell'app authenticator al login."
          }
          tone="ceramic"
        />
        <AccountInfoTile
          label="Email"
          badge={
            customer?.emailVerified ? (
              <AccountBadge tone="success">Verificata</AccountBadge>
            ) : (
              <AccountBadge tone="warn">Da verificare</AccountBadge>
            )
          }
          description={customer?.email}
          tone="majolica"
        />
        <AccountInfoTile
          label="Sessioni attive"
          badge={<AccountBadge tone="info">{sessions.length} dispositiv{sessions.length === 1 ? "o" : "i"}</AccountBadge>}
          description={`${otherSessions.length} oltre a questo. Revocabili qui sotto.`}
          tone="brilliant"
        />
      </AccountInfoGrid>

      <AccountPanel
        id="passkey"
        eyebrow="Accesso rapido"
        title="Passkey"
        badge={
          passkeys.length > 0 ? (
            <AccountBadge tone="success">Attiva</AccountBadge>
          ) : (
            <AccountBadge tone="neutral">Da configurare</AccountBadge>
          )
        }
        description="Accedi in modo rapido e sicuro usando il tuo dispositivo: Face ID, Touch ID, impronta o PIN. Funziona su iPhone, iPad, Mac, Android e nei password manager compatibili. La password resta come alternativa."
      >
        <PasskeyManager passkeys={passkeyViews} />
      </AccountPanel>

      <AccountPanel
        id="2fa"
        eyebrow="Autenticazione forte"
        title="Verifica in due passaggi (2FA)"
        badge={
          twoFactor.enabled ? (
            <AccountBadge tone="success">Attiva</AccountBadge>
          ) : (
            <AccountBadge tone="neutral">Non attiva</AccountBadge>
          )
        }
        description={
          twoFactor.enabled
            ? "Oltre alla password serve il codice dell'app authenticator. Gestisci qui codici di recupero e disattivazione."
            : "Proteggi l'account con un codice temporaneo generato dal tuo telefono (TOTP standard: Google Authenticator, 1Password, Aegis…)."
        }
        action={
          twoFactor.enabled ? (
            <AccountBadge tone={twoFactor.backupRemaining > 0 ? "info" : "warn"}>
              {twoFactor.backupRemaining > 0
                ? `Codici di recupero: ${twoFactor.backupRemaining}/${twoFactor.backupTotal}`
                : "Codici di recupero esauriti"}
            </AccountBadge>
          ) : undefined
        }
      >
        {twoFactor.enabled ? (
          <TwoFactorManage backupRemaining={twoFactor.backupRemaining} />
        ) : (
          <TwoFactorEnroll />
        )}
      </AccountPanel>

      <AccountPanel
        id="sessioni"
        eyebrow="Dispositivi"
        title="Sessioni attive"
        badge={<AccountBadge tone="info">{sessions.length}</AccountBadge>}
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
                  {session.isCurrent && <AccountBadge tone="success">Attuale</AccountBadge>}
                </div>
                <div className="account-session-meta">
                  <span>IP {maskIp(session.ipAddress)}</span>
                  <span>Ultimo uso {formatDate(session.lastSeenAt ?? session.createdAt)}</span>
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
        id="password"
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
        eyebrow="Riepilogo"
        title="Protezioni dell'account"
        description="Lo stato delle difese attive su questo account, in un colpo d'occhio."
      >
        <div className="account-security-grid">
          {[
            {
              title: "Passkey",
              copy: "Accesso moderno con Face ID, Touch ID o chiave del dispositivo.",
              badge: passkeys.length > 0 ? <AccountBadge tone="success">Attiva</AccountBadge> : <AccountBadge tone="neutral">Da configurare</AccountBadge>
            },
            {
              title: "App authenticator",
              copy: "TOTP con QR code, conferma iniziale e codici di recupero monouso.",
              badge: twoFactor.enabled ? <AccountBadge tone="success">Attiva</AccountBadge> : <AccountBadge tone="neutral">Attivabile qui sopra</AccountBadge>
            },
            {
              title: "Email verificata",
              copy: "Conferma dell'indirizzo per recuperi sicuri e comunicazioni affidabili.",
              badge: customer?.emailVerified ? <AccountBadge tone="success">Verificata</AccountBadge> : <AccountBadge tone="warn">Da verificare</AccountBadge>
            },
            {
              title: "Avvisi sensibili",
              copy: "Email automatica per nuovi accessi, cambio password, cambio email, 2FA e passkey.",
              badge: <AccountBadge tone="success">Attivi</AccountBadge>
            }
          ].map((item) => (
            <div key={item.title}>
              <strong>{item.title}</strong>
              <p>{item.copy}</p>
              {item.badge}
            </div>
          ))}
        </div>
      </AccountPanel>
    </div>
  );
}
