import Link from "next/link";
import { redirect } from "next/navigation";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { CustomerLoginForm } from "@/components/account/CustomerAuthForms";
import { getSessionCustomer } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accedi", robots: { index: false, follow: false } };

export default async function CustomerLoginPage({
  searchParams
}: {
  searchParams: Promise<{ reset?: string; all?: string }>;
}) {
  const [{ reset, all }, customer] = await Promise.all([searchParams, getSessionCustomer()]);
  if (customer) redirect("/account");

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <h1 className="text-center font-serif text-3xl font-semibold">Accedi al tuo account</h1>
        {reset && (
          <p className="mt-4 rounded-xl bg-brilliant/10 px-4 py-3 text-sm font-semibold text-emerald-800">
            Password reimpostata. Ora puoi accedere.
          </p>
        )}
        {all && (
          <p className="mt-4 rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
            Tutte le sessioni sono state chiuse. Accedi di nuovo da questo dispositivo.
          </p>
        )}
        <div className="card mt-6 p-6">
          <CustomerLoginForm />
        </div>
        <div className="mt-4 flex justify-between text-sm">
          <Link href="/account/registrati" className="text-terracotta hover:underline">
            Crea un account
          </Link>
          <Link href="/account/recupera" className="text-ink/60 hover:underline">
            Password dimenticata?
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
