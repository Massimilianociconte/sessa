import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "terracotta" | "ceramic" | "brilliant" | "majolica";

export type BadgeTone = "success" | "neutral" | "warn" | "info";

/**
 * Pill di stato per l'area personale: rende leggibile a colpo d'occhio
 * cosa è attivo, cosa è da configurare e cosa richiede attenzione.
 */
export function AccountBadge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="account-badge" data-tone={tone}>
      {tone === "success" && (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 13 4 4L19 7" />
        </svg>
      )}
      {tone === "warn" && (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M12 6v7" />
          <path d="M12 17.5h.01" />
        </svg>
      )}
      {children}
    </span>
  );
}

export function AccountPageIntro({
  kicker,
  title,
  description,
  children
}: {
  kicker: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="account-page-intro">
      <div>
        <p>{kicker}</p>
        <h1>{title}</h1>
        {description && <span>{description}</span>}
      </div>
      {children && <div className="account-page-intro-actions">{children}</div>}
    </section>
  );
}

export function AccountMetricCard({
  label,
  value,
  description,
  href,
  action,
  tone = "terracotta"
}: {
  label: string;
  value: string | number;
  description: string;
  href?: string;
  action?: string;
  tone?: Tone;
}) {
  const content = (
    <>
      <p className="account-metric-label">{label}</p>
      <strong className="account-metric-value">{value}</strong>
      <span className="account-metric-description">{description}</span>
      {action && <em>{action}</em>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="account-metric-card" data-tone={tone}>
        {content}
      </Link>
    );
  }

  return (
    <article className="account-metric-card" data-tone={tone}>
      {content}
    </article>
  );
}

export function AccountPanel({
  eyebrow,
  title,
  badge,
  description,
  action,
  children,
  className = "",
  id
}: {
  eyebrow?: string;
  title: string;
  badge?: ReactNode;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`account-panel ${className}`}>
      <div className="account-panel-heading">
        <div>
          {eyebrow && <p>{eyebrow}</p>}
          <h2>
            {title}
            {badge}
          </h2>
          {description && <span>{description}</span>}
        </div>
        {action && <div className="account-panel-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function AccountEmptyState({
  title,
  description,
  primary,
  secondary
}: {
  title: string;
  description: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="account-empty-state">
      <div aria-hidden="true" className="account-empty-mark">S</div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {(primary || secondary) && (
        <div className="account-empty-actions">
          {primary && (
            <Link href={primary.href} className="btn-primary">
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href} className="btn-secondary">
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function AccountInfoGrid({ children }: { children: ReactNode }) {
  return <div className="account-info-grid">{children}</div>;
}

export function AccountInfoTile({
  label,
  value,
  badge,
  description,
  tone = "terracotta"
}: {
  label: string;
  value?: string;
  badge?: ReactNode;
  description?: string;
  tone?: Tone;
}) {
  return (
    <div className="account-info-tile" data-tone={tone}>
      <p>{label}</p>
      {(value || badge) && (
        <strong>
          {value}
          {badge}
        </strong>
      )}
      {description && <span>{description}</span>}
    </div>
  );
}
