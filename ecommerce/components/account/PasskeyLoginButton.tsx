"use client";

import { useEffect, useState } from "react";
import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { finishPasskeyLoginAction, startPasskeyLoginAction } from "@/lib/actions/account/passkeys";

/**
 * "Accedi con passkey" nella pagina di login. Usernameless: il browser
 * propone le passkey salvate per questo sito. Fallback: password + 2FA.
 */
export default function PasskeyLoginButton({ nextPath }: { nextPath?: string }) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Rilevazione solo client (evita mismatch di hydration): setState qui è voluto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(browserSupportsWebAuthn());
  }, []);

  if (!supported) return null;

  const login = async () => {
    setBusy(true);
    setError(null);
    try {
      const start = await startPasskeyLoginAction();
      if (!start.ok) {
        setError(start.error);
        return;
      }
      const assertion = await startAuthentication({ optionsJSON: start.data });
      const finish = await finishPasskeyLoginAction(assertion, nextPath);
      if (!finish.ok) {
        setError(finish.error);
        return;
      }
      window.location.assign(finish.data.redirectTo);
    } catch (err) {
      const domError = err as Error & { name?: string };
      if (domError?.name === "NotAllowedError") {
        setError("Accesso annullato. Puoi riprovare o usare la password.");
      } else {
        setError("Accesso con passkey non riuscito: usa email e password.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="passkey-login">
      <div className="auth-divider" role="separator" aria-label="oppure">
        <span>oppure</span>
      </div>
      <button type="button" onClick={login} disabled={busy} className="btn-secondary w-full">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="7.5" cy="15.5" r="5.5" />
          <path d="m21 2-9.6 9.6" />
          <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </svg>
        {busy ? "Attendi…" : "Accedi con passkey"}
      </button>
      {error && <p className="auth-notice mt-3" data-tone="warn" role="alert">{error}</p>}
    </div>
  );
}
