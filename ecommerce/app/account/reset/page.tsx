import Link from "next/link";
import AuthShell from "@/components/account/AuthShell";
import { ResetForm } from "@/components/account/CustomerAuthForms";

export const dynamic = "force-dynamic";

export const metadata = { title: "Reimposta password", robots: { index: false, follow: false } };

export default async function ResetPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell
      eyebrow="Ultimo passo"
      title="Reimposta la password"
      subtitle={token ? "Scegli una nuova password robusta per il tuo account." : undefined}
      brandClaim="Sicurezza senza attese."
      brandCopy="Nuova password, sessioni ruotate e sei di nuovo pronto a ordinare."
      highlights={["Hash sicuro lato server", "Altre sessioni disconnesse", "Avviso email automatico"]}
      sticker="/images/stickers/pasticceria-tradizionale-sessa-sticker.webp"
      footer={
        <div className="auth-links">
          <span>
            Serve un nuovo link?{" "}
            <Link href="/account/recupera" className="auth-link-strong">
              Richiedilo qui
            </Link>
          </span>
        </div>
      }
    >
      {token ? (
        <ResetForm token={token} />
      ) : (
        <p className="text-sm text-ink/60">
          Link non valido o scaduto.{" "}
          <Link href="/account/recupera" className="auth-link-strong">
            Richiedine uno nuovo
          </Link>
          .
        </p>
      )}
    </AuthShell>
  );
}
