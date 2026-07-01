import { navItems } from "@/data/site-content";
import { SessaSignature } from "@/components/SessaSignature";

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 bg-terracotta/[0.92] text-ivory shadow-[0_12px_40px_rgba(23,20,18,0.14)] backdrop-blur-md">
      <div className="mx-auto flex min-h-[72px] w-full max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:min-h-[86px] lg:px-12">
        <a
          href="#top"
          className="block text-ivory outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-4 focus-visible:ring-offset-terracotta"
          aria-label="Sessa home"
        >
          <SessaSignature className="h-auto w-[142px] sm:w-[178px]" tail="short" />
        </a>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-cream/[0.88] md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-4 focus-visible:ring-offset-terracotta"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <a
          href="#dolci"
          className="rounded-full border border-cream/70 px-5 py-2 text-sm font-bold text-cream transition-colors hover:bg-cream hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-4 focus-visible:ring-offset-terracotta"
        >
          Menu
        </a>
      </div>
    </header>
  );
}
