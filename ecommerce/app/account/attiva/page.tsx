import Link from "next/link";
import AuthShell from "@/components/account/AuthShell";
import { ActivateForm } from "@/components/account/CustomerAuthForms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Attiva il tuo account", robots: { index: false, follow: false } };

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell
      eyebrow="Ultimo passo"
      title="Attiva il tuo account"
      subtitle={token ? "Scegli la password: l'account nasce ora, dopo la verifica della tua email." : undefined}
      brandClaim="Il tuo posto da Sessa."
      brandCopy="Storico ordini, indirizzi salvati e riordino in un clic."
      highlights={["Email verificata", "Password solo tua", "Ordini precedenti collegati"]}
      sticker="/images/stickers/pasticceria-tradizionale-sessa-sticker.webp"
      footer={
        <div className="auth-links">
          <span>
            Link scaduto?{" "}
            <Link href="/account/registrati" className="auth-link-strong">
              Ripeti la registrazione
            </Link>
          </span>
        </div>
      }
    >
      {token ? (
        <ActivateForm token={token} />
      ) : (
        <p className="text-sm text-ink/60">
          Link non valido o scaduto.{" "}
          <Link href="/account/registrati" className="auth-link-strong">
            Ripeti la registrazione
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
