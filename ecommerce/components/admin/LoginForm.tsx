"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = { error: null };

export default function LoginForm({ nextPath }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {nextPath && <input type="hidden" name="next" value={nextPath} />}
      <div>
        <label htmlFor="email" className="label-field">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input-field" />
      </div>
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
        />
      </div>
      {state.error && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Accesso in corso…" : "Accedi"}
      </button>
    </form>
  );
}
