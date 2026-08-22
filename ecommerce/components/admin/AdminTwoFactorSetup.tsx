"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmAdminTotpAction,
  disableAdminTotpAction,
  regenerateAdminBackupCodesAction,
  startAdminTotpAction
} from "@/lib/actions/admin/twofactor";
import { initialAdminTwoFactorState } from "@/lib/actions/admin/twofactor-state";

function ErrorBox({ error }: { error: string | null }) {
  return error ? <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{error}</p> : null;
}

function BackupCodes({ codes }: { codes: string[] }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copyCodes() {
    const value = codes.join("\n");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      setCopyStatus("copied");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      setCopyStatus(copied ? "copied" : "error");
    }
  }

  return (
    <div className="rounded-2xl border border-brilliant/30 bg-brilliant/5 p-4">
      <p className="text-sm font-semibold text-emerald-800">Salva ora questi codici: non saranno mostrati di nuovo.</p>
      <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">
        {codes.map((code) => <li key={code} className="rounded-lg bg-white px-2 py-1 text-center shadow-sm">{code}</li>)}
      </ul>
      <button type="button" className="btn-ghost mt-3 text-sm" onClick={copyCodes}>
        {copyStatus === "copied" ? "Codici copiati" : "Copia tutti"}
      </button>
      <span className={copyStatus === "error" ? "ml-3 text-xs font-semibold text-terracotta" : "sr-only"} aria-live="polite">
        {copyStatus === "copied" ? "Tutti i codici di recupero sono stati copiati." : copyStatus === "error" ? "Copia non disponibile: seleziona e salva i codici manualmente." : ""}
      </span>
    </div>
  );
}

function AdminTwoFactorEnroll({
  onActivated,
  onCodesSaved
}: {
  onActivated: () => void;
  onCodesSaved: () => void;
}) {
  const [startState, startAction, startPending] = useActionState(startAdminTotpAction, initialAdminTwoFactorState);
  const [confirmState, confirmAction, confirmPending] = useActionState(confirmAdminTotpAction, initialAdminTwoFactorState);

  useEffect(() => {
    if (confirmState.step === "enabled") onActivated();
  }, [confirmState.step, onActivated]);

  if (confirmState.step === "enabled" && confirmState.backupCodes) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">2FA attiva. Le altre sessioni sono state revocate.</p>
        <BackupCodes codes={confirmState.backupCodes} />
        <button type="button" className="btn-primary" onClick={onCodesSaved}>Ho salvato i codici</button>
      </div>
    );
  }
  if (startState.step === "pending" && startState.qrDataUrl) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/70">
          <li>Apri la tua app authenticator.</li><li>Inquadra il QR o inserisci il segreto.</li><li>Conferma il codice temporaneo.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={startState.qrDataUrl} alt="QR per autenticazione gestionale" width={220} height={220} className="rounded-xl border border-ink/10 bg-white p-2" />
          <code className="max-w-full break-all rounded-lg bg-cream px-3 py-2 font-mono text-xs">{startState.secret}</code>
        </div>
        <form action={confirmAction} className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="admin-totp-confirm" className="label-field">Codice a 6 cifre</label><input id="admin-totp-confirm" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="input-field !w-44 text-center font-mono" /></div>
          <button type="submit" disabled={confirmPending} className="btn-primary">{confirmPending ? "Verifica…" : "Attiva 2FA"}</button>
        </form>
        <ErrorBox error={confirmState.error} />
      </div>
    );
  }
  return (
    <form action={startAction} className="flex flex-wrap items-end gap-3">
      <div><label htmlFor="admin-totp-password" className="label-field">Password attuale</label><input id="admin-totp-password" name="password" type="password" required autoComplete="current-password" className="input-field" /></div>
      <button type="submit" disabled={startPending} className="btn-primary">{startPending ? "Generazione…" : "Attiva verifica in due passaggi"}</button>
      <ErrorBox error={startState.error} />
    </form>
  );
}

function AdminTwoFactorManage({ backupRemaining }: { backupRemaining: number }) {
  const [regenState, regenAction, regenPending] = useActionState(regenerateAdminBackupCodesAction, initialAdminTwoFactorState);
  return (
    <div className="space-y-6">
      {regenState.step === "codes" && regenState.backupCodes ? <BackupCodes codes={regenState.backupCodes} /> : (
        <form action={regenAction} className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="admin-totp-regen" className="label-field">Codice app o recupero ({backupRemaining} rimasti)</label><input id="admin-totp-regen" name="code" required autoComplete="one-time-code" className="input-field font-mono" /></div>
          <button type="submit" disabled={regenPending} className="btn-secondary">{regenPending ? "Rigenerazione…" : "Rigenera codici"}</button>
          <ErrorBox error={regenState.error} />
        </form>
      )}
      <form action={disableAdminTotpAction} className="space-y-3 rounded-2xl border border-terracotta/30 bg-terracotta/5 p-4">
        <p className="text-sm font-semibold text-terracotta">Disattiva 2FA</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="admin-totp-disable-password" className="label-field">Password</label><input id="admin-totp-disable-password" name="password" type="password" required autoComplete="current-password" className="input-field" /></div>
          <div><label htmlFor="admin-totp-disable-code" className="label-field">Codice app o recupero</label><input id="admin-totp-disable-code" name="code" required autoComplete="one-time-code" className="input-field font-mono" /></div>
        </div>
        <button type="submit" className="btn-secondary !border-terracotta !text-terracotta">Disattiva 2FA</button>
      </form>
    </div>
  );
}

export function AdminTwoFactorPanel({
  initialEnabled,
  backupRemaining,
  backupTotal
}: {
  initialEnabled: boolean;
  backupRemaining: number;
  backupTotal: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<"disabled" | "codes" | "enabled">(initialEnabled ? "enabled" : "disabled");
  const effectiveTotal = backupTotal > 0 ? backupTotal : 10;
  const effectiveRemaining = initialEnabled ? backupRemaining : effectiveTotal;
  const enabled = phase !== "disabled";

  const markActivated = useCallback(() => setPhase("codes"), []);
  const finishEnrollment = useCallback(() => {
    setPhase("enabled");
    router.refresh();
  }, [router]);

  return (
    <>
      <div className="mb-5 flex justify-end">
        <span className={`badge ${enabled ? "bg-brilliant/10 text-emerald-800" : "bg-terracotta/10 text-terracotta"}`}>
          {phase === "codes" ? "2FA attiva · salva i codici" : enabled ? `${effectiveRemaining}/${effectiveTotal} codici disponibili` : "2FA da attivare"}
        </span>
      </div>
      {phase === "enabled" ? (
        <AdminTwoFactorManage backupRemaining={effectiveRemaining} />
      ) : (
        <AdminTwoFactorEnroll onActivated={markActivated} onCodesSaved={finishEnrollment} />
      )}
    </>
  );
}
