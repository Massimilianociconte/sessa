"use client";

import { useActionState } from "react";
import PasswordField from "@/components/account/PasswordField";
import {
  loginCustomerAction,
  registerCustomerAction,
  resetPasswordAction,
  type AuthState
} from "@/lib/actions/account/auth";

const initial: AuthState = { error: null };

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="auth-error">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
      {error}
    </p>
  );
}

export function CustomerLoginForm({ nextPath }: { nextPath?: string }) {
  const [state, action, pending] = useActionState(loginCustomerAction, initial);
  return (
    <form action={action} className="space-y-4">
      {nextPath && <input type="hidden" name="next" value={nextPath} />}
      <div>
        <label htmlFor="email" className="label-field">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="nome@esempio.it"
          className="input-field"
        />
      </div>
      <PasswordField id="password" name="password" label="Password" autoComplete="current-password" maxLength={128} />
      {state.needsTotp && (
        <div className="auth-totp-box">
          <label htmlFor="totp" className="label-field">Codice di verifica</label>
          <input
            id="totp"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Codice a 6 cifre o codice di recupero"
            required
            autoFocus
            className="input-field"
          />
          <p className="mt-2 text-xs text-ink/50">
            Questo account è protetto dalla verifica in due passaggi: inserisci il codice
            dell'app authenticator oppure un codice di recupero.
          </p>
        </div>
      )}
      <ErrorBox error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Accesso…" : state.needsTotp ? "Verifica e accedi" : "Accedi"}
      </button>
    </form>
  );
}

export function CustomerRegisterForm() {
  const [state, action, pending] = useActionState(registerCustomerAction, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="label-field">Nome</label>
          <input id="firstName" name="firstName" required autoComplete="given-name" placeholder="Maria" className="input-field" />
        </div>
        <div>
          <label htmlFor="lastName" className="label-field">Cognome</label>
          <input id="lastName" name="lastName" required autoComplete="family-name" placeholder="Esposito" className="input-field" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="label-field">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" placeholder="nome@esempio.it" className="input-field" />
        <p className="mt-1.5 text-xs text-ink/45">Ti invieremo un link per confermare l'indirizzo.</p>
      </div>
      <div>
        <label htmlFor="phone" className="label-field">Telefono (opzionale)</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+39 333 000 0000" className="input-field" />
      </div>
      <p className="auth-notice">
        Ti invieremo un link personale: solo dopo aver verificato l&apos;email potrai scegliere la password.
        In questo modo nessuno può reclamare ordini effettuati in precedenza con il tuo indirizzo.
      </p>
      <ErrorBox error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Invio…" : "Invia link sicuro"}
      </button>
      <p className="text-center text-[11px] leading-5 text-ink/40">
        Richiedendo il link accetti le condizioni d&apos;uso dello shop Sessa 1930.
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <PasswordField
        id="password"
        name="password"
        label="Nuova password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        hint="Minimo 12 caratteri. Dopo il salvataggio dovrai accedere di nuovo."
      />
      <ErrorBox error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Salvataggio…" : "Reimposta password"}
      </button>
    </form>
  );
}
