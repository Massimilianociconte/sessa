import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import { CustomerLoginForm } from "@/components/account/CustomerAuthForms";
import PasskeyLoginButton from "@/components/account/PasskeyLoginButton";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { safeNextPath } from "@/lib/auth/redirects";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accedi", robots: { index: false, follow: false } };

export default async function CustomerLoginPage({
  searchParams
}: {
  searchParams: Promise<{
    reset?: string;
    all?: string;
    expired?: string;
    registration?: string;
    next?: string;
    dev?: string;
    msg?: string;
    err?: string;
  }>;
}) {
  const [{ reset, all, expired, registration, next, dev, msg, err }, customer] = await Promise.all([
    searchParams,
    getSessionCustomer()
  ]);
  const nextPath = safeNextPath(next, "/account", "/account");
  if (customer) redirect(nextPath);

  return (
    <AuthShell
      eyebrow="Bentornato"
      title="Accedi al tuo account"
      subtitle="Ordini più veloci, indirizzi salvati e i tuoi inviti sempre a portata di mano."
      brandClaim="La tua Sessa, sempre con te."
      brandCopy="Ritrova lo storico ordini, riordina i tuoi classici preferiti e segui le consegne di ogni sede."
      highlights={["Riordino in un tocco", "Indirizzi e preferenze salvati", "Gift card e inviti amici"]}
      sticker="/images/stickers/sfogliatella-sessa-sticker.webp"
      footer={
        <div className="auth-links">
          <span>
            Non hai un account?{" "}
            <Link href="/account/registrati" className="auth-link-strong">
              Registrati
            </Link>
          </span>
          <Link href="/account/recupera" className="auth-link-soft">
            Password dimenticata?
          </Link>
        </div>
      }
    >
      {reset && <p className="auth-notice" role="status">Password reimpostata. Ora puoi accedere.</p>}
      {all && (
        <p className="auth-notice" data-tone="warn" role="status">
          Tutte le sessioni sono state chiuse. Accedi di nuovo da questo dispositivo.
        </p>
      )}
      {expired && (
        <p className="auth-notice" data-tone="warn" role="status">
          La sessione è scaduta o è stata revocata. Accedi di nuovo per continuare.
        </p>
      )}
      {registration && (
        <p className="auth-notice" role="status">
          Controlla la casella email: dal link ricevuto potrai verificare l&apos;indirizzo e scegliere la password.
          {dev && <span className="mt-2 block break-all text-xs">Link sviluppo: {dev}</span>}
        </p>
      )}
      {msg && <p className="auth-notice" role="status">{msg}</p>}
      {err && <p className="auth-notice" data-tone="warn" role="alert">{err}</p>}
      <CustomerLoginForm nextPath={nextPath} />
      <PasskeyLoginButton nextPath={nextPath} />
    </AuthShell>
  );
}
