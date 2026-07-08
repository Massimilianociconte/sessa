import { redirect } from "next/navigation";
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
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="card w-full max-w-md p-8">
        <p className="text-center font-script text-4xl text-terracotta">Sessa</p>
        <h1 className="mt-1 text-center text-sm font-semibold uppercase tracking-[0.3em] text-ink/50">
          Prima configurazione
        </h1>
        <p className="mt-4 text-center text-sm leading-6 text-ink/60">
          Il gestionale non ha ancora un account. Crea qui il profilo <strong>proprietario</strong>:
          questa pagina si disattiva da sola appena l'account esiste.
        </p>
        <div className="mt-8">
          {blocked ? (
            <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
              Per sicurezza la configurazione in produzione richiede la variabile d'ambiente
              ADMIN_SETUP_TOKEN. Impostala nel pannello del deploy e ricarica questa pagina.
            </p>
          ) : (
            <SetupForm requiresToken={Boolean(envToken)} />
          )}
        </div>
      </div>
    </main>
  );
}
