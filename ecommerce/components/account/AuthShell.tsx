import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  /** Palette e wordmark: "shop" (terracotta, clienti) o "admin" (blu ceramica, staff). */
  variant?: "shop" | "admin";
  /** Kicker sopra il titolo, es. "Bentornato". */
  eyebrow: string;
  /** Titolo della form. */
  title: string;
  /** Sottotitolo/descrizione sotto il titolo. */
  subtitle?: ReactNode;
  /** Claim grande del pannello brand (desktop). */
  brandClaim: string;
  /** Riga descrittiva del pannello brand. */
  brandCopy: string;
  /** Punti fiducia mostrati nel pannello brand. */
  highlights?: string[];
  /** Sticker decorativo nel pannello (path in /public). Solo variant shop. */
  sticker?: string;
  /** Contenuto principale (la form). */
  children: ReactNode;
  /** Link/note sotto la card. */
  footer?: ReactNode;
};

/**
 * Guscio condiviso delle pagine di autenticazione (login, registrazione,
 * recupero, reset, gestionale). Desktop: pannello brand + form affiancati.
 * Mobile: fascia brand compatta sopra la card.
 */
export default function AuthShell({
  variant = "shop",
  eyebrow,
  title,
  subtitle,
  brandClaim,
  brandCopy,
  highlights = [],
  sticker,
  children,
  footer
}: AuthShellProps) {
  return (
    <main className="auth-page" data-variant={variant}>
      <section className="auth-brand" aria-hidden="true">
        <div className="auth-brand-inner">
          <Link href="/" className="auth-brand-logo" aria-label="Sessa 1930 — torna allo shop">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/sessa-logo-white.webp" alt="" width={720} height={196} loading="eager" fetchPriority="high" decoding="async" />
          </Link>
          <p className="auth-brand-kicker">{variant === "admin" ? "Gestionale multi-sede" : "Pasticceria dal 1930"}</p>
          <h2 className="auth-brand-claim">{brandClaim}</h2>
          <p className="auth-brand-copy">{brandCopy}</p>
          {highlights.length > 0 && (
            <ul className="auth-brand-highlights">
              {highlights.map((item) => (
                <li key={item}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {sticker && (
            <div className="auth-brand-sticker">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sticker} alt="" loading="lazy" decoding="async" />
            </div>
          )}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <header className="auth-head">
            <p className="auth-eyebrow">{eyebrow}</p>
            <h1 className="auth-title">{title}</h1>
            {subtitle && <div className="auth-subtitle">{subtitle}</div>}
          </header>
          <div className="auth-card">{children}</div>
          {footer && <div className="auth-footer">{footer}</div>}
          <p className="auth-backlink">
            <Link href="/">← Torna allo shop</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
