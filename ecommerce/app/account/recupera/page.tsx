import Link from "next/link";
import AuthShell from "@/components/account/AuthShell";
import { requestResetAction } from "@/lib/actions/account/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Recupera password", robots: { index: false, follow: false } };

export default async function RecoverPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; dev?: string; err?: string }>;
}) {
  const { sent, dev, err } = await searchParams;

  return (
    <AuthShell
      eyebrow="Nessun problema"
      title="Recupera la password"
      subtitle={sent ? undefined : "Inserisci la tua email: ti invieremo un link sicuro per reimpostarla."}
      brandClaim="Torni subito operativo."
      brandCopy="Il link di reset vale un'ora e chiude le altre sessioni: il tuo account resta protetto."
      highlights={["Link monouso via email", "Valido 60 minuti", "Sessioni ruotate dopo il cambio"]}
      sticker="/images/stickers/colazioni-sessa-sticker.webp"
      footer={
        <div className="auth-links">
          <span>
            Ricordata?{" "}
            <Link href="/account/login" className="auth-link-strong">
              Torna all'accesso
            </Link>
          </span>
        </div>
      }
    >
      {sent ? (
        <div className="space-y-4 text-sm">
          <p className="auth-notice" role="status">
            Se l'email è registrata, riceverai un link per reimpostare la password. Controlla anche lo spam.
          </p>
          {dev && (
            <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/60">
              (Sviluppo) Link di reset:{" "}
              <Link href={dev.replace(/^https?:\/\/[^/]+/, "")} className="break-all font-semibold text-terracotta">
                {dev}
              </Link>
            </p>
          )}
          <Link href="/account/login" className="btn-secondary w-full">
            Torna all'accesso
          </Link>
        </div>
      ) : (
        <>
          {err && (
            <p className="auth-notice" data-tone="warn" role="alert">
              {decodeURIComponent(err)}
            </p>
          )}
          <form action={requestResetAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="label-field">Email</label>
              <input id="email" name="email" type="email" required placeholder="nome@esempio.it" className="input-field" />
            </div>
            <button type="submit" className="btn-primary w-full">
              Invia link di reset
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
