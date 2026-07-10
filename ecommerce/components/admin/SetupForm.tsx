"use client";

import { useActionState } from "react";
import { setupFirstAdminAction } from "@/lib/actions/admin/setup";
import { initialSetupState } from "@/lib/actions/admin/setup-state";

export default function SetupForm({ requiresToken }: { requiresToken: boolean }) {
  const [state, action, pending] = useActionState(setupFirstAdminAction, initialSetupState);

  return (
    <form action={action} className="space-y-4">
      {requiresToken && (
        <div>
          <label htmlFor="setupToken" className="label-field">Token di configurazione</label>
          <input
            id="setupToken"
            name="setupToken"
            type="password"
            required
            autoComplete="off"
            className="input-field"
            placeholder="Valore di ADMIN_SETUP_TOKEN"
          />
          <p className="mt-1 text-xs text-ink/45">
            È il segreto impostato nelle variabili d'ambiente del deploy.
          </p>
        </div>
      )}
      <div>
        <label htmlFor="name" className="label-field">Nome e cognome</label>
        <input id="name" name="name" required maxLength={120} autoComplete="name" className="input-field" />
      </div>
      <div>
        <label htmlFor="email" className="label-field">Email</label>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="input-field" />
      </div>
      <div>
        <label htmlFor="password" className="label-field">Password (min 12 caratteri)</label>
        <input id="password" name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input-field" />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="label-field">Conferma password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input-field" />
      </div>
      {state.error && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Creazione…" : "Crea account proprietario"}
      </button>
    </form>
  );
}
