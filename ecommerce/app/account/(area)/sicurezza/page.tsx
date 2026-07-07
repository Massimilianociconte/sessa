import { AccountEmptyState, AccountInfoGrid, AccountInfoTile, AccountPageIntro, AccountPanel } from "@/components/account/AccountUi";
import { logoutAllCustomerSessionsAction } from "@/lib/actions/account/auth";
import { getSessionCustomer, listCustomerSessions } from "@/lib/auth/customer-session";

export const metadata = { title: "Sicurezza" };

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
    <div className="account-page-stack">
      <AccountPageIntro
        kicker="Protezione account"
        title="Sicurezza"
        description="Controlla le sessioni attive e prepara l'account a protezioni gratuite come app authenticator, backup code e passkey."
      />

      <AccountInfoGrid>
        <AccountInfoTile label="Sessioni attive" value={String(sessions.length)} description="Dispositivi con accesso ancora valido." tone="terracotta" />
        <AccountInfoTile label="Password" value="Attiva" description="Hash server-side, mai esposta al client." tone="ceramic" />
        <AccountInfoTile label="2FA" value="Predisposta" description="TOTP e backup code, senza costi SMS." tone="brilliant" />
      </AccountInfoGrid>

      <AccountPanel
        eyebrow="Dispositivi"
        title="Sessioni attive"
        description="Esci da tutti i dispositivi se noti attivita sospetta o hai cambiato dispositivo."
        action={
          <form action={logoutAllCustomerSessionsAction}>
            <button type="submit" className="btn-secondary">
              Esci da tutti i dispositivi
            </button>
          </form>
        }
      >
        {sessions.length === 0 ? (
          <AccountEmptyState
            title="Nessuna sessione aggiuntiva."
            description="Quando accederai da altri dispositivi, li vedrai qui con data di creazione e scadenza."
          />
        ) : (
          <ul className="account-session-list">
            {sessions.map((session, index) => (
              <li key={session.id}>
                <div>
                  <strong>{index === 0 ? "Sessione piu recente" : "Sessione salvata"}</strong>
                  <span>Creata {formatDate(session.createdAt)}</span>
                </div>
                <p>Scade {formatDate(session.expiresAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </AccountPanel>

      <AccountPanel
        eyebrow="Roadmap gratuita"
        title="Prossime protezioni consigliate"
        description="Funzioni predisposte per aumentare sicurezza senza rendere l'accesso pesante."
      >
        <div className="account-security-grid">
          {[
            ["App authenticator", "TOTP gratuito con QR code e codici di recupero monouso."],
            ["Passkey", "Accesso moderno con Face ID, Touch ID o chiave dispositivo compatibile."],
            ["Avvisi accesso", "Email automatiche per nuovo login, cambio password e modifica dati sensibili."]
          ].map(([title, copy]) => (
            <div key={title}>
              <strong>{title}</strong>
              <p>{copy}</p>
              <span>Predisposto</span>
            </div>
          ))}
        </div>
      </AccountPanel>
    </div>
  );
}
