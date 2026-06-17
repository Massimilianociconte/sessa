import { navItems } from "@/data/site-content";

export function Header() {
  return (
    <header className="relative bg-terracotta text-ivory">
      <div className="mx-auto flex min-h-[76px] w-full max-w-[1480px] items-center justify-between px-5 sm:px-8 lg:min-h-[92px] lg:px-12">
        <a
          href="#top"
          className="font-script text-[clamp(3.1rem,5.5vw,4.8rem)] leading-[0.9] text-ivory outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-4 focus-visible:ring-offset-terracotta"
          aria-label="Sessa home"
        >
          Sessa
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
