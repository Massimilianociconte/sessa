import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "terracotta" | "ceramic" | "brilliant" | "majolica";

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
  description,
  action,
  children,
  className = ""
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`account-panel ${className}`}>
      <div className="account-panel-heading">
        <div>
          {eyebrow && <p>{eyebrow}</p>}
          <h2>{title}</h2>
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
  description,
  tone = "terracotta"
}: {
  label: string;
  value: string;
  description?: string;
  tone?: Tone;
}) {
  return (
    <div className="account-info-tile" data-tone={tone}>
      <p>{label}</p>
      <strong>{value}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
