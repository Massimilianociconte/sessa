import { AccountEmptyState, AccountInfoGrid, AccountInfoTile, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import {
  logoutAllCustomerSessionsAction,
  logoutCustomerSessionAction,
  logoutOtherCustomerSessionsAction
} from "@/lib/actions/account/auth";
import { getSessionCustomer, listCustomerSessions } from "@/lib/auth/customer-session";

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
  const sessions = customer ? await listCustomerSessions(customer.id) : [];
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
        <AccountInfoTile label="Protezione login" value="Attiva" description="Rate limit per login e recupero password, più avviso email a ogni nuovo accesso." tone="ceramic" />
        <AccountInfoTile label="Password" value="Protetta" description="Hash server-side e rotazione sessioni dopo cambio o reset." tone="brilliant" />
      </AccountInfoGrid>

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
        eyebrow="Protezione avanzata"
        title="Prossime protezioni consigliate"
        description="Queste funzioni restano il passo successivo naturale: sono gratuite per l'utente, ma richiedono un modulo dedicato per gestire segreti, QR code e WebAuthn senza simulazioni."
      >
        <div className="account-security-grid">
          {[
            ["App authenticator", "TOTP gratuito con QR code, conferma iniziale e codici di recupero monouso."],
            ["Passkey", "Accesso moderno con Face ID, Touch ID o chiave dispositivo compatibile."],
            ["Avvisi sensibili", "Gli avvisi per login e cambio password sono già collegati alla coda email."]
          ].map(([title, copy]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{copy}</p>
              <span>{title === "Avvisi sensibili" ? "Attivo" : "Modulo successivo"}</span>
            </div>
          ))}
        </div>
      </AccountPanel>
    </div>
  );
}
