"use client";

import { useActionState } from "react";
import {
  confirmTotpAction,
  disableTotpAction,
  initialTwoFactorState,
  regenerateBackupCodesAction,
  startTotpAction
} from "@/lib/actions/account/twofactor";

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{error}</p>
  );
}

function BackupCodesBox({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-2xl border border-brilliant/30 bg-brilliant/5 p-4">
      <p className="text-sm font-semibold text-emerald-800">
        Codici di recupero — salvali ORA, non verranno mostrati di nuovo.
      </p>
      <p className="mt-1 text-xs text-ink/55">
        Ogni codice funziona una sola volta e sostituisce il codice dell'app se perdi il telefono.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code} className="rounded-lg bg-white px-2 py-1 text-center shadow-sm">
            {code}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-ghost mt-3 text-sm"
        onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}
      >
        Copia tutti
      </button>
    </div>
  );
}

/** Flusso di attivazione: password → QR → codice di conferma → codici di recupero. */
export function TwoFactorEnroll() {
  const [startState, startAction, startPending] = useActionState(startTotpAction, initialTwoFactorState);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmTotpAction, initialTwoFactorState);

  if (confirmState.step === "enabled" && confirmState.backupCodes) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">
          Verifica in due passaggi attivata. Dal prossimo accesso servirà il codice dell'app.
        </p>
        <BackupCodesBox codes={confirmState.backupCodes} />
      </div>
    );
  }

  if (startState.step === "pending" && startState.qrDataUrl) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/70">
          <li>Apri l'app authenticator (Google Authenticator, 1Password, Aegis…).</li>
          <li>Inquadra il QR oppure inserisci il codice manuale.</li>
          <li>Conferma qui sotto il codice a 6 cifre generato dall'app.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-5">
          {/* Il QR è un data URL generato server-side: nessuna richiesta esterna. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={startState.qrDataUrl} alt="QR code per app authenticator" width={220} height={220} className="rounded-xl border border-ink/10 bg-white p-2" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-ink/70">Inserimento manuale</p>
            <code className="mt-1 block break-all rounded-lg bg-cream px-3 py-2 font-mono text-xs">{startState.secret}</code>
            <p className="mt-1 text-xs text-ink/45">SHA1 · 6 cifre · 30 secondi</p>
          </div>
        </div>
        <form action={confirmAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="totp-confirm-code" className="label-field">Codice a 6 cifre</label>
            <input
              id="totp-confirm-code"
              name="code"
              inputMode="numeric"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoComplete="one-time-code"
              className="input-field !w-44 text-center font-mono"
            />
          </div>
          <button type="submit" disabled={confirmPending} className="btn-primary">
            {confirmPending ? "Verifica…" : "Attiva 2FA"}
          </button>
        </form>
        <ErrorBox error={confirmState.error} />
      </div>
    );
  }

  return (
    <form action={startAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="totp-start-password" className="label-field">Password attuale</label>
        <input
          id="totp-start-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input-field"
        />
      </div>
      <button type="submit" disabled={startPending} className="btn-primary">
        {startPending ? "Generazione…" : "Attiva verifica in due passaggi"}
      </button>
      <ErrorBox error={startState.error} />
    </form>
  );
}

/** Gestione a 2FA attiva: rigenera codici di recupero o disattiva. */
export function TwoFactorManage({ backupRemaining }: { backupRemaining: number }) {
  const [regenState, regenAction, regenPending] = useActionState(
    regenerateBackupCodesAction,
    initialTwoFactorState
  );

  return (
    <div className="space-y-6">
      {regenState.step === "codes" && regenState.backupCodes ? (
        <BackupCodesBox codes={regenState.backupCodes} />
      ) : (
        <form action={regenAction} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="totp-regen-code" className="label-field">
              Codice app o di recupero ({backupRemaining} rimasti)
            </label>
            <input
              id="totp-regen-code"
              name="code"
              required
              autoComplete="one-time-code"
              className="input-field !w-56 font-mono"
            />
          </div>
          <button type="submit" disabled={regenPending} className="btn-secondary">
            {regenPending ? "Rigenerazione…" : "Rigenera codici di recupero"}
          </button>
          <ErrorBox error={regenState.error} />
        </form>
      )}

      <form action={disableTotpAction} className="space-y-3 rounded-2xl border border-terracotta/30 bg-terracotta/5 p-4">
        <p className="text-sm font-semibold text-terracotta">Disattiva verifica in due passaggi</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="totp-disable-password" className="label-field">Password</label>
            <input id="totp-disable-password" name="password" type="password" required autoComplete="current-password" className="input-field" />
          </div>
          <div>
            <label htmlFor="totp-disable-code" className="label-field">Codice app o di recupero</label>
            <input id="totp-disable-code" name="code" required autoComplete="one-time-code" className="input-field font-mono" />
          </div>
        </div>
        <button type="submit" className="btn-secondary !border-terracotta !text-terracotta">
          Disattiva 2FA
        </button>
      </form>
    </div>
  );
}
