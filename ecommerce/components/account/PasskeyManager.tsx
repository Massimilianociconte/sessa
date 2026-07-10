"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import {
  deletePasskeyAction,
  finishPasskeyRegistrationAction,
  startPasskeyRegistrationAction
} from "@/lib/actions/account/passkeys";

export type PasskeyView = {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

function suggestDeviceName(): string {
  if (typeof navigator === "undefined") return "Il mio dispositivo";
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "Il mio iPhone";
  if (/iPad/.test(ua)) return "Il mio iPad";
  if (/Android/.test(ua)) return "Il mio Android";
  if (/Mac/.test(ua)) return "Il mio Mac";
  if (/Windows/.test(ua)) return "Il mio PC";
  return "Il mio dispositivo";
}

function formatDate(iso: string | null): string {
  if (!iso) return "mai";
  return new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/**
 * Gestione passkey nella sezione Sicurezza: crea, elenca, elimina.
 * La cerimonia WebAuthn gira nel browser; le server action fanno solo
 * generazione opzioni e verifica firma.
 */
export default function PasskeyManager({ passkeys }: { passkeys: PasskeyView[] }) {
  const router = useRouter();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Rilevazione solo client (evita mismatch di hydration): setState qui è voluto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof window !== "undefined" && Boolean(window.PublicKeyCredential));
    setName(suggestDeviceName());
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (!password) {
        setError("Inserisci la password attuale per aggiungere una passkey.");
        return;
      }
      const start = await startPasskeyRegistrationAction(password);
      if (!start.ok) {
        setError(start.error);
        return;
      }
      const attestation = await startRegistration({ optionsJSON: start.data });
      const finish = await finishPasskeyRegistrationAction(attestation, name);
      if (!finish.ok) {
        setError(finish.error);
        return;
      }
      setSuccess(`Passkey "${finish.data.name}" creata: da questo dispositivo puoi accedere senza password.`);
      setPassword("");
      router.refresh();
    } catch (err) {
      const domError = err as Error & { name?: string };
      if (domError?.name === "NotAllowedError") {
        setError("Operazione annullata o non consentita dal dispositivo.");
      } else if (domError?.name === "InvalidStateError") {
        setError("Questo dispositivo ha già una passkey per il tuo account.");
      } else {
        setError("Il dispositivo non è riuscito a creare la passkey. Riprova.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (supported === false) {
    return (
      <p className="auth-notice" data-tone="warn">
        Questo browser non supporta le passkey. Puoi continuare a usare password e verifica in due passaggi.
      </p>
    );
  }

  return (
    <div className="passkey-manager">
      {passkeys.length > 0 && (
        <ul className="passkey-list">
          {passkeys.map((pk) => (
            <li key={pk.id} className="passkey-card">
              <span className="passkey-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="7.5" cy="15.5" r="5.5" />
                  <path d="m21 2-9.6 9.6" />
                  <path d="m15.5 7.5 3 3L22 7l-3-3" />
                </svg>
              </span>
              <div className="passkey-card-main">
                <strong>{pk.name}</strong>
                <span>
                  Creata {formatDate(pk.createdAt)} · Ultimo uso {formatDate(pk.lastUsedAt)}
                  {pk.backedUp ? " · Sincronizzata nel cloud" : ""}
                </span>
              </div>
              <form
                action={deletePasskeyAction}
                onSubmit={(event) => {
                  if (!confirm(`Eliminare la passkey "${pk.name}"? Da quel dispositivo servirà di nuovo la password.`)) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="passkeyId" value={pk.id} />
                <label className="sr-only" htmlFor={`delete-passkey-password-${pk.id}`}>
                  Password attuale per eliminare {pk.name}
                </label>
                <input
                  id={`delete-passkey-password-${pk.id}`}
                  name="password"
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                  className="input-field !w-44 !py-2 text-xs"
                  placeholder="Password attuale"
                />
                <button type="submit" className="btn-ghost !text-terracotta">
                  Elimina
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="passkey-create">
        <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <div>
            <label htmlFor="passkeyName" className="label-field">Nome del dispositivo</label>
            <input
              id="passkeyName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              className="input-field"
              placeholder="Es. iPhone di Maria"
            />
          </div>
          <div>
            <label htmlFor="passkeyPassword" className="label-field">Password attuale</label>
            <input
              id="passkeyPassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              maxLength={128}
              autoComplete="current-password"
              className="input-field"
            />
          </div>
          <button type="button" onClick={create} disabled={busy || supported === null} className="btn-primary sm:col-span-2">
            {busy ? "Attendi…" : passkeys.length > 0 ? "Aggiungi passkey" : "Crea passkey"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink/50">
          Il tuo dispositivo ti chiederà Face ID, Touch ID, impronta o PIN. La passkey resta sul
          dispositivo (o nel tuo portachiavi cloud): Sessa non vede né salva i tuoi dati biometrici.
        </p>
      </div>

      {error && <p className="auth-notice" data-tone="warn" role="alert">{error}</p>}
      {success && <p className="auth-notice" role="status">{success}</p>}
    </div>
  );
}
