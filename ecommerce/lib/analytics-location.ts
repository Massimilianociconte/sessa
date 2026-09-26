/**
 * URL inviati ad Analytics: mai token o dati personali. Solo origine +
 * percorso + parametri di campagna; le aree personali non vengono tracciate.
 */
const PRIVATE_PREFIXES = ["/ordine", "/account", "/checkout", "/admin", "/carrello"];
const ALLOWED_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "q", "uso", "categoria"];

export function isTrackablePath(pathname: string): boolean {
  return !PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function sanitizedPageLocation(href: string): string {
  try {
    const url = new URL(href);
    const clean = new URL(url.origin + url.pathname);
    for (const key of ALLOWED_PARAMS) {
      const value = url.searchParams.get(key);
      if (value) clean.searchParams.set(key, value.slice(0, 100));
    }
    return clean.toString();
  } catch {
    return "";
  }
}
