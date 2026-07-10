import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import LoginForm from "@/components/admin/LoginForm";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { safeNextPath } from "@/lib/auth/redirects";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accesso" };

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; expired?: string }>;
}) {
  const [{ next, expired }, user] = await Promise.all([searchParams, getSessionUser()]);
  const nextPath = safeNextPath(next, "/admin", "/admin");
  if (user) redirect(nextPath);
  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0) redirect("/admin/setup");

  return (
    <AuthShell
      variant="admin"
      eyebrow="Area riservata"
      title="Accedi al gestionale"
      subtitle="Ordini, magazzino, sconti e clienti di tutte le sedi in un unico pannello."
      brandClaim="La bottega, sotto controllo."
      brandCopy="Dashboard multi-sede per lo staff Sessa: dagli ordini in arrivo alle scorte del laboratorio."
      highlights={["Ordini in tempo reale", "Magazzino per sede", "Sconti, gift card e referral"]}
      footer={
        <div className="auth-links">
          <span className="text-ink/45">Accesso riservato allo staff Sessa 1930.</span>
          <Link href="/" className="auth-link-soft">
            Vai allo shop
          </Link>
        </div>
      }
    >
      {expired && (
        <p className="auth-notice" data-tone="warn" role="status">
          La sessione gestionale è scaduta o è stata revocata. Accedi di nuovo per continuare.
        </p>
      )}
      <LoginForm nextPath={nextPath} />
    </AuthShell>
  );
}
