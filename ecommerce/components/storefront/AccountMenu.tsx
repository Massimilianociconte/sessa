"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAIN_LINKS: Array<{ href: string; label: string; icon: string }> = [
  { href: "/account", label: "Panoramica", icon: "M3 12 12 4l9 8M5 10v10h14V10" },
  { href: "/account/ordini", label: "I miei ordini", icon: "M6 2h9l5 5v15H6zM14 2v6h6" },
  { href: "/account/indirizzi", label: "Indirizzi", icon: "M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" },
  { href: "/account/invita", label: "Invita amici", icon: "M16 11a4 4 0 1 0-8 0M4 21v-1a6 6 0 0 1 12 0v1M19 8v6M22 11h-6" },
  { href: "/account/gift-card", label: "Gift card e crediti", icon: "M3 8h18v13H3zM3 12h18M12 8v13M7.5 8a2.5 2.5 0 1 1 4.5-1.5A2.5 2.5 0 1 1 16.5 8" },
  { href: "/account/codici", label: "Codici sconto", icon: "M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM12 7v2m0 3v2m0 3v2" },
  { href: "/account/profilo", label: "Profilo", icon: "M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 9a8 8 0 0 1 16 0" }
];

const SECURITY_LINKS: Array<{ href: string; label: string }> = [
  { href: "/account/sicurezza#passkey", label: "Passkey" },
  { href: "/account/sicurezza#2fa", label: "Verifica in 2 passaggi" },
  { href: "/account/sicurezza#sessioni", label: "Dispositivi e sessioni" }
];

/**
 * Bottone account dell'header. Da loggato mostra il nome e apre un menu di
 * scorciatoie verso l'area personale: dropdown su desktop, bottom sheet su
 * mobile (stessa markup, cambia il CSS). Da ospite è un semplice link Accedi.
 */
export default function AccountMenu({
  name,
  logout
}: {
  name: string | null;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Il pannello vive in un portal su <body>: l'header ha backdrop-filter, che
  // farebbe da containing block per position:fixed ancorando il menu all'header.
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  // Desktop: dropdown ancorato al bottone (ricalcolato su resize); mobile: bottom sheet.
  useEffect(() => {
    if (!open) return;
    const compute = () => {
      const isDesktop = window.matchMedia("(min-width: 640px)").matches;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (isDesktop && rect) {
        setDropdownPos({ top: rect.bottom + 10, right: Math.max(8, window.innerWidth - rect.right) });
      } else {
        setDropdownPos(null);
      }
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        // Focus trap essenziale dentro il pannello.
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>("a, button");
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const firstLink = panelRef.current?.querySelector<HTMLElement>("a, button");
    firstLink?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  if (!name) {
    return (
      <Link
        href="/account/login"
        className="inline-flex min-h-10 items-center rounded-full border border-cream/45 px-3 py-1.5 font-semibold text-cream transition hover:bg-cream hover:text-terracotta sm:px-4"
      >
        Accedi
      </Link>
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "S";

  return (
    <div className="account-menu-root">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="account-menu-trigger"
      >
        <span className="account-menu-avatar" aria-hidden="true">{initial}</span>
        <span className="account-menu-name">{name}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" data-open={open}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && mounted && createPortal(
        <>
          <div className="account-menu-overlay" onClick={close} aria-hidden="true" />
          <div
            ref={panelRef}
            className="account-menu-panel"
            role="menu"
            aria-label="Il tuo account"
            data-variant={dropdownPos ? "dropdown" : "sheet"}
            style={dropdownPos ? { top: dropdownPos.top, right: dropdownPos.right, left: "auto", bottom: "auto" } : undefined}
          >
            <div className="account-menu-head">
              <span className="account-menu-avatar" aria-hidden="true">{initial}</span>
              <div>
                <strong>Ciao, {name}</strong>
                <span>La tua Sessa personale</span>
              </div>
              <button type="button" onClick={close} className="account-menu-close" aria-label="Chiudi menu">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <nav className="account-menu-links">
              {MAIN_LINKS.map((item) => (
                <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d={item.icon} />
                  </svg>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="account-menu-section">
              <Link href="/account/sicurezza" role="menuitem" onClick={() => setOpen(false)} className="account-menu-security">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6z" />
                </svg>
                Sicurezza
              </Link>
              <div className="account-menu-sublinks">
                {SECURITY_LINKS.map((item) => (
                  <Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)}>
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <form action={logout} className="account-menu-logout">
              <button type="submit" role="menuitem">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="m16 17 5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                Esci dall'account
              </button>
            </form>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
