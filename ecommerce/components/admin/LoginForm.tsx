"use client";

import { useActionState, useState } from "react";
import { submitWithoutReset } from "@/components/submit-without-reset";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = { error: null, needsTwoFactor: false };

export default function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  // Controllati: al passo del codice 2FA (obbligatorio in produzione) le credenziali restano.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={formAction} onSubmit={submitWithoutReset(formAction)} className="space-y-4">
      {nextPath && <input type="hidden" name="next" value={nextPath} />}
      <div>
        <label htmlFor="email" className="label-field">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="input-field"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      {state.needsTwoFactor && (
        <div className="rounded-2xl border border-ceramic/20 bg-ceramic/5 p-4">
          <label htmlFor="admin-code" className="label-field">
            Codice authenticator o di recupero
          </label>
          <input
            id="admin-code"
            name="code"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={32}
            className="input-field text-center font-mono text-lg"
            aria-describedby="admin-code-help"
          />
          <p id="admin-code-help" className="mt-2 text-xs leading-5 text-ink/50">
            Apri l'app authenticator oppure usa uno dei codici di recupero monouso.
          </p>
        </div>
      )}
      <div>
        <label htmlFor="password" className="label-field">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          className="input-field"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {state.error && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Verifica in corso…" : state.needsTwoFactor ? "Verifica e accedi" : "Accedi"}
      </button>
    </form>
  );
}
