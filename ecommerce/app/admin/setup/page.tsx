import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import SetupForm from "@/components/admin/SetupForm";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Prima configurazione", robots: { index: false, follow: false } };

/**
 * Bootstrap del gestionale: visibile SOLO finché non esiste alcun utente admin.
 * In produzione la creazione richiede il token segreto ADMIN_SETUP_TOKEN (env).
 */
export default async function AdminSetupPage() {
  const adminCount = await prisma.adminUser.count();
  if (adminCount > 0) redirect("/admin/login");

  const envToken = process.env.ADMIN_SETUP_TOKEN ?? "";
  const isProduction = process.env.NODE_ENV === "production";
  const blocked = isProduction && !envToken;

  return (
    <AuthShell
      variant="admin"
      eyebrow="Benvenuto"
      title="Prima configurazione"
      subtitle={
        <>
          Il gestionale non ha ancora un account. Crea qui il profilo <strong>proprietario</strong>:
          questa pagina si disattiva da sola appena l'account esiste.
        </>
      }
      brandClaim="Si parte da qui."
      brandCopy="Un solo account proprietario, poi inviti il resto dello staff dalle impostazioni."
      highlights={["Token di sicurezza in produzione", "Password minimo 12 caratteri", "Creazione atomica anti-race"]}
    >
      {blocked ? (
        <p className="auth-notice" data-tone="warn" role="alert">
          Per sicurezza la configurazione in produzione richiede la variabile d'ambiente
          ADMIN_SETUP_TOKEN. Impostala nel pannello del deploy e ricarica questa pagina.
        </p>
      ) : (
        <SetupForm requiresToken={Boolean(envToken)} />
      )}
    </AuthShell>
  );
}
