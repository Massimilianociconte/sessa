"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/account", label: "Panoramica", eyebrow: "01" },
  { href: "/account/ordini", label: "I miei ordini", eyebrow: "02" },
  { href: "/account/indirizzi", label: "Indirizzi", eyebrow: "03" },
  { href: "/account/invita", label: "Invita amici", eyebrow: "04" },
  { href: "/account/gift-card", label: "Gift card e crediti", eyebrow: "05" },
  { href: "/account/codici", label: "Codici sconto", eyebrow: "06" },
  { href: "/account/preferenze", label: "Preferenze", eyebrow: "07" },
  { href: "/account/sicurezza", label: "Sicurezza", eyebrow: "08" },
  { href: "/account/profilo", label: "Profilo", eyebrow: "09" }
];

function isActive(pathname: string, href: string) {
  return href === "/account" ? pathname === href : pathname.startsWith(href);
}

export default function AccountNav() {
  const pathname = usePathname();

  return (
    <nav className="account-nav account-mobile-nav" aria-label="Navigazione area personale">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="account-nav-link"
            data-active={active ? "true" : "false"}
          >
            <span aria-hidden="true">{item.eyebrow}</span>
            <strong>{item.label}</strong>
          </Link>
        );
      })}
    </nav>
  );
}
