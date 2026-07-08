import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import LoginForm from "@/components/admin/LoginForm";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accesso" };

export default async function AdminLoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/admin");
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
      <LoginForm />
    </AuthShell>
  );
}
