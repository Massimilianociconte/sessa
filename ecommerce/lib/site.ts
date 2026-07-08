/**
 * URL pubblico del negozio, normalizzato (senza slash finale).
 * Priorità: NEXT_PUBLIC_SITE_URL (dominio definitivo) → URL (Netlify production)
 * → DEPLOY_PRIME_URL (Netlify deploy preview/branch) → localhost in sviluppo.
 * Tutti i link assoluti (email, Stripe, SEO/JSON-LD, referral, sitemap) passano da qui.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.URL ??
  process.env.DEPLOY_PRIME_URL ??
  "http://localhost:3001"
).replace(/\/$/, "");
