import Link from "next/link";
import { redirect } from "next/navigation";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
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
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <h1 className="text-center font-serif text-3xl font-semibold">Crea il tuo account</h1>
        {ref && (
          <p className="mt-3 rounded-xl bg-brilliant/10 px-4 py-3 text-center text-sm font-semibold text-emerald-800">
            Sei stato invitato da un amico! Registrati per ricevere il tuo sconto di benvenuto.
          </p>
        )}
        <p className="mt-2 text-center text-sm text-ink/60">
          Ordina più velocemente, salva gli indirizzi e ritrova lo storico ordini.
        </p>
        <div className="card mt-6 p-6">
          <CustomerRegisterForm />
        </div>
        <p className="mt-4 text-center text-sm">
          Hai già un account?{" "}
          <Link href="/account/login" className="text-terracotta hover:underline">
            Accedi
          </Link>
        </p>
      </main>
      <Footer />
    </>
  );
}
