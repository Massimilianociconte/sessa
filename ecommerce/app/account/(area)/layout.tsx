import Link from "next/link";
import { redirect } from "next/navigation";
import AccountNav from "@/components/account/AccountNav";
import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import { logoutCustomerAction } from "@/lib/actions/account/auth";
import { getSessionCustomer } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const customer = await getSessionCustomer();
  if (!customer) redirect("/account/login");

  return (
    <>
      <Header />
      <main className="account-shell">
        <section className="account-hero" aria-label="Area personale Sessa">
          <div>
            <p className="script-accent">Ciao {customer.firstName}</p>
            <h1>La tua Sessa personale</h1>
            <span>
              Ordini, indirizzi, inviti e preferenze raccolti in una dashboard pensata per rendere ogni acquisto piu rapido.
            </span>
          </div>
          <Link href="/" className="btn-secondary account-hero-cta">
            Scegli una sede
          </Link>
        </section>

        <div className="account-layout-grid">
          <aside className="account-sidebar">
            <div className="account-profile-card">
              <span className="account-avatar" aria-hidden="true">
                {customer.firstName.slice(0, 1)}
                {customer.lastName.slice(0, 1)}
              </span>
              <div>
                <strong>
                  {customer.firstName} {customer.lastName}
                </strong>
                <p>{customer.email}</p>
              </div>
            </div>
            <AccountNav />
            <form action={logoutCustomerAction} className="account-logout-form">
              <button type="submit">Esci dall'account</button>
            </form>
          </aside>
          <div className="account-content">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}
