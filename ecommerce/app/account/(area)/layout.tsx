import Link from "next/link";
import { redirect } from "next/navigation";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { logoutCustomerAction } from "@/lib/actions/account/auth";
import { getSessionCustomer } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/account", label: "Panoramica" },
  { href: "/account/ordini", label: "I miei ordini" },
  { href: "/account/indirizzi", label: "Indirizzi" },
  { href: "/account/invita", label: "Invita amici" },
  { href: "/account/sicurezza", label: "Sicurezza" },
  { href: "/account/profilo", label: "Profilo" }
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await getSessionCustomer();
  if (!customer) redirect("/account/login");

  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6">
          <p className="font-script text-3xl text-terracotta">Ciao {customer.firstName}</p>
          <p className="text-sm text-ink/50">{customer.email}</p>
        </div>
        <div className="grid gap-8 md:grid-cols-[200px_1fr]">
          <aside className="h-fit">
            <nav className="account-mobile-nav flex gap-2 overflow-x-auto md:flex-col">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium text-ink/70 transition hover:bg-cream hover:text-terracotta"
                >
                  {item.label}
                </Link>
              ))}
              <form action={logoutCustomerAction}>
                <button type="submit" className="rounded-xl px-3 py-2 text-sm font-semibold text-terracotta hover:underline">
                  Esci
                </button>
              </form>
            </nav>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
