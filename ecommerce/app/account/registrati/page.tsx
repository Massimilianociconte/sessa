import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import { CustomerRegisterForm } from "@/components/account/CustomerAuthForms";
import { getSessionCustomer } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Registrati", robots: { index: false, follow: false } };

export default async function CustomerRegisterPage({
  searchParams
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const [{ ref }, customer] = await Promise.all([searchParams, getSessionCustomer()]);
  if (customer) redirect("/account");

  return (
    <AuthShell
      eyebrow="Nuovo qui?"
      title="Crea il tuo account"
      subtitle="Bastano trenta secondi: poi ordini, salvi indirizzi e inviti gli amici."
      brandClaim="Un'esplosione di gusto, anche online."
      brandCopy="Sfogliatelle, grandi lievitati e box regalo dal laboratorio di Ottaviano alle sedi di tutta Italia."
      highlights={["Checkout più rapido", "Storico ordini e riordino", "Sconto di benvenuto con gli inviti"]}
      sticker="/images/stickers/box-regalo-sessa-sticker.webp"
      footer={
        <div className="auth-links">
          <span>
            Hai già un account?{" "}
            <Link href="/account/login" className="auth-link-strong">
              Accedi
            </Link>
          </span>
        </div>
      }
    >
      {ref && (
        <p className="auth-notice" role="status">
          Sei stato invitato da un amico! Registrati per ricevere il tuo sconto di benvenuto.
        </p>
      )}
      <CustomerRegisterForm />
    </AuthShell>
  );
}
