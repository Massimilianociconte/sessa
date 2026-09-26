"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import PasswordField from "@/components/account/PasswordField";
import { submitWithoutReset } from "@/components/submit-without-reset";
import {
  activateAccountAction,
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
  // Controllati: al passo del codice 2FA email e password restano compilati.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-4">
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <PasswordField
        id="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        maxLength={128}
        value={password}
        onChange={setPassword}
      />
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
  const [values, setValues] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const field = (name: keyof typeof values) => ({
    name,
    id: name,
    value: values[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [name]: event.target.value })
  });
  return (
    <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className="label-field">Nome</label>
          <input {...field("firstName")} required autoComplete="given-name" placeholder="Maria" className="input-field" />
        </div>
        <div>
          <label htmlFor="lastName" className="label-field">Cognome</label>
          <input {...field("lastName")} required autoComplete="family-name" placeholder="Esposito" className="input-field" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="label-field">Email</label>
        <input {...field("email")} type="email" required autoComplete="email" placeholder="nome@esempio.it" className="input-field" />
        <p className="mt-1.5 text-xs text-ink/45">Ti invieremo un link per confermare l&apos;indirizzo.</p>
      </div>
      <div>
        <label htmlFor="phone" className="label-field">Telefono (opzionale)</label>
        <input {...field("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="+39 333 000 0000" className="input-field" />
      </div>
      <label className="flex items-start gap-2 text-xs leading-5 text-ink/65">
        <input
          type="checkbox"
          name="acceptPrivacy"
          required
          checked={acceptPrivacy}
          onChange={(event) => setAcceptPrivacy(event.target.checked)}
          className="mt-0.5 accent-terracotta"
        />
        <span>
          Ho letto l&apos;
          <Link href="/privacy" className="font-semibold text-terracotta underline" target="_blank">informativa privacy</Link>{" "}
          e le{" "}
          <Link href="/condizioni-di-vendita" className="font-semibold text-terracotta underline" target="_blank">condizioni di vendita</Link>.
        </span>
      </label>
      <p className="auth-notice">
        Ti invieremo un link personale: solo dopo aver verificato l&apos;email potrai scegliere la password e l&apos;account verrà creato.
        In questo modo nessuno può reclamare ordini effettuati in precedenza con il tuo indirizzo.
      </p>
      <ErrorBox error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Invio…" : "Invia link sicuro"}
      </button>
    </form>
  );
}

export function ActivateForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(activateAccountAction, initial);
  const [password, setPassword] = useState("");
  return (
    <form action={action} onSubmit={submitWithoutReset(action)} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <PasswordField
        id="password"
        name="password"
        label="Scegli la password"
        autoComplete="new-password"
        minLength={12}
        maxLength={128}
        value={password}
        onChange={setPassword}
        hint="Minimo 12 caratteri. Poi accedi con email e password."
      />
      <ErrorBox error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Attivazione…" : "Attiva l'account"}
      </button>
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
