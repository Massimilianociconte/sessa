import Link from "next/link";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
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
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <h1 className="text-center font-serif text-3xl font-semibold">Reimposta la password</h1>
        <div className="card mt-6 p-6">
          {token ? (
            <ResetForm token={token} />
          ) : (
            <p className="text-sm text-ink/60">
              Link non valido.{" "}
              <Link href="/account/recupera" className="text-terracotta hover:underline">
                Richiedine uno nuovo
              </Link>
              .
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
