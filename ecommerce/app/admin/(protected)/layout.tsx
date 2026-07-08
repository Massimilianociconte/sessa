import Link from "next/link";
import { redirect } from "next/navigation";
import AdminPwaInstall from "@/components/admin/AdminPwaInstall";
import { logoutAction } from "@/lib/actions/auth";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/ordini", label: "Ordini" },
  { href: "/admin/prodotti", label: "Prodotti" },
  { href: "/admin/categorie", label: "Categorie" },
  { href: "/admin/sedi", label: "Sedi" },
  { href: "/admin/magazzino", label: "Magazzino" },
  { href: "/admin/sconti", label: "Sconti" },
  { href: "/admin/gift-card", label: "Gift card" },
  { href: "/admin/referral", label: "Referral" },
  { href: "/admin/clienti", label: "Clienti" },
  { href: "/admin/impostazioni", label: "Impostazioni" }
];

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-cream">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink/10 bg-white px-4 py-6 md:flex">
        <Link href="/admin" className="px-3">
          <span className="font-script text-3xl text-terracotta">Sessa</span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.3em] text-ink/50">
            Gestionale
          </span>
        </Link>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-ink/70 transition hover:bg-cream hover:text-terracotta"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-ink/10 pt-4">
          <div className="px-3 pb-3">
            <AdminPwaInstall />
          </div>
          <p className="truncate px-3 text-xs font-semibold">{user.name}</p>
          <p className="truncate px-3 text-xs text-ink/50">{user.email}</p>
          <form action={logoutAction} className="mt-2 px-3">
            <button type="submit" className="text-xs font-semibold text-terracotta hover:underline">
              Esci
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="admin-mobile-nav sticky top-0 z-30 flex items-center gap-3 overflow-x-auto border-b border-ink/10 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-sm font-medium text-ink/70 hover:text-terracotta"
            >
              {item.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button type="submit" className="text-sm font-semibold text-terracotta">
              Esci
            </button>
          </form>
        </header>
        <main className="px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
