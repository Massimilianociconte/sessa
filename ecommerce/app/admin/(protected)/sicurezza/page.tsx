import Flash from "@/components/admin/Flash";
import { AdminTwoFactorPanel } from "@/components/admin/AdminTwoFactorSetup";
import { logoutAdminSessionAction, logoutOtherAdminSessionsAction } from "@/lib/actions/admin/twofactor";
import { listAdminSessions, requireAdmin } from "@/lib/auth/session";
import { getAdminTwoFactorStatus } from "@/lib/services/admin-2fa";
import { formatRomeDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sicurezza gestionale" };

function deviceName(userAgent: string | null) {
  if (!userAgent) return "Dispositivo non riconosciuto";
  const os = userAgent.includes("iPhone") ? "iPhone" : userAgent.includes("iPad") ? "iPad" : userAgent.includes("Android") ? "Android" : userAgent.includes("Mac OS X") ? "Mac" : userAgent.includes("Windows") ? "Windows" : "Dispositivo";
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Safari/") ? "Safari" : "Browser";
  return `${browser} su ${os}`;
}

function maskIp(ip: string | null) {
  if (!ip) return "IP non disponibile";
  if (ip === "::1" || ip === "127.0.0.1") return "Locale";
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.…` : ip;
}

export default async function AdminSecurityPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string; required?: string }>;
}) {
  const [{ msg, err, required }, admin] = await Promise.all([searchParams, requireAdmin()]);
  const [twoFactor, sessions] = await Promise.all([
    getAdminTwoFactorStatus(admin.id),
    listAdminSessions(admin.id)
  ]);
  const otherSessions = sessions.filter((session) => !session.isCurrent);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">Protezione gestionale</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold">Sicurezza</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/55">Proteggi ordini, clienti e inventario con un secondo fattore e revoca in tempo reale le sessioni che non riconosci.</p>
        </div>
      </div>
      <div className="mt-4"><Flash msg={msg} err={err} /></div>
      {required && !twoFactor.enabled && (
        <p className="mt-4 rounded-xl border border-terracotta/20 bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta" role="status">
          Per accedere al gestionale in produzione, attiva prima la verifica in due passaggi.
        </p>
      )}

      <section className="card mt-6 p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-ceramic">Authenticator</p><h2 className="mt-1 font-serif text-2xl font-semibold">Verifica in due passaggi</h2><p className="mt-1 max-w-2xl text-sm text-ink/55">TOTP standard, compatibile con 1Password, Google Authenticator, Aegis e gli altri gestori moderni. I codici di recupero sono monouso.</p></div>
        </div>
        <AdminTwoFactorPanel
          initialEnabled={twoFactor.enabled}
          backupRemaining={twoFactor.backupRemaining}
          backupTotal={twoFactor.backupTotal}
        />
      </section>

      <section className="card mt-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-brilliant">Dispositivi</p><h2 className="mt-1 font-serif text-2xl font-semibold">Sessioni attive</h2><p className="mt-1 text-sm text-ink/55">Ogni revoca elimina la sessione dal database: il cookie corrispondente smette subito di autenticare.</p></div>
          <form action={logoutOtherAdminSessionsAction}><button type="submit" disabled={otherSessions.length === 0} className="btn-secondary">Disconnetti gli altri</button></form>
        </div>
        <ul className="mt-5 space-y-3">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 bg-cream/35 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{deviceName(session.userAgent)} {session.isCurrent && <span className="badge ml-2 bg-brilliant/10 text-emerald-800">Attuale</span>}</p>
                <p className="mt-1 text-xs leading-5 text-ink/50">IP {maskIp(session.ipAddress)} · ultimo uso {formatRomeDateTime(session.lastSeenAt)} · scade {formatRomeDateTime(session.expiresAt)}</p>
                <p className="text-xs text-ink/40">Secondo fattore {twoFactor.enabled ? (session.twoFactorVerifiedAt ? "verificato" : "da verificare") : "non attivo sull'account"}</p>
              </div>
              <form action={logoutAdminSessionAction}><input type="hidden" name="sessionId" value={session.id} /><button type="submit" className={session.isCurrent ? "btn-secondary" : "btn-ghost"}>{session.isCurrent ? "Esci da questo" : "Disconnetti"}</button></form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
