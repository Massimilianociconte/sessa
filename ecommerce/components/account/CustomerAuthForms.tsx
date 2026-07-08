"use client";

import { useActionState } from "react";
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
    <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{error}</p>
  );
}

export function CustomerLoginForm() {
  const [state, action, pending] = useActionState(loginCustomerAction, initial);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label-field">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input-field" />
      </div>
      <div>
        <label htmlFor="password" className="label-field">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input-field" />
      </div>
      {state.needsTotp && (
        <div className="rounded-2xl border border-ceramic/30 bg-ceramic/5 p-4">
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
        <input id="firstName" name="firstName" required autoComplete="given-name" className="input-field" />
        </div>
        <div>
          <label htmlFor="lastName" className="label-field">Cognome</label>
        <input id="lastName" name="lastName" required autoComplete="family-name" className="input-field" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="label-field">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input-field" />
      </div>
      <div>
        <label htmlFor="phone" className="label-field">Telefono (opzionale)</label>
        <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" className="input-field" />
      </div>
      <div>
        <label htmlFor="password" className="label-field">Password (min 10 caratteri)</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input-field" />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input type="checkbox" name="marketingOptIn" className="accent-terracotta" />
        Voglio ricevere novità e offerte
      </label>
      <ErrorBox error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creazione…" : "Crea account"}
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="label-field">Nuova password (min 10 caratteri)</label>
        <input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input-field" />
      </div>
      <ErrorBox error={state.error} />
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Salvataggio…" : "Reimposta password"}
      </button>
    </form>
  );
}
