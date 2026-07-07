import Link from "next/link";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { requestResetAction } from "@/lib/actions/account/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Recupera password", robots: { index: false, follow: false } };

export default async function RecoverPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; dev?: string; err?: string }>;
}) {
  const { sent, dev, err } = await searchParams;

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-md flex-col px-4 py-12">
        <h1 className="text-center font-serif text-3xl font-semibold">Recupera la password</h1>

        {sent ? (
          <div className="card mt-6 space-y-3 p-6 text-sm">
            <p className="font-semibold text-emerald-800">
              Se l'email è registrata, riceverai un link per reimpostare la password.
            </p>
            {dev && (
              <p className="rounded-lg bg-cream px-3 py-2 text-xs text-ink/60">
                (Sviluppo) Link di reset:{" "}
                <Link href={dev.replace(/^https?:\/\/[^/]+/, "")} className="break-all font-semibold text-terracotta">
                  {dev}
                </Link>
              </p>
            )}
            <Link href="/account/login" className="btn-secondary">
              Torna all'accesso
            </Link>
          </div>
        ) : (
          <>
            {err && (
              <p className="mt-4 rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
                {decodeURIComponent(err)}
              </p>
            )}
            <p className="mt-2 text-center text-sm text-ink/60">
              Inserisci la tua email: ti invieremo un link per reimpostarla.
            </p>
            <form action={requestResetAction} className="card mt-6 space-y-4 p-6">
              <div>
                <label htmlFor="email" className="label-field">Email</label>
                <input id="email" name="email" type="email" required className="input-field" />
              </div>
              <button type="submit" className="btn-primary w-full">
                Invia link di reset
              </button>
            </form>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
