/**
 * Accesso alla pagina ordine senza token nell'URL.
 *
 * Il link nelle email e il ritorno da Stripe contengono `?t=<token>`: il proxy
 * lo sposta in un cookie httpOnly limitato al path dell'ordine e ripulisce
 * l'indirizzo. Cosi il token non resta in cronologia, screenshot, analytics
 * (page_location) o header Referer. Nessuna dipendenza server: usato anche
 * dal proxy edge.
 */
export const ORDER_TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const ORDER_CODE_PATTERN = /^[A-Za-z0-9-]{3,40}$/;

export function isValidOrderCode(code: string): boolean {
  return ORDER_CODE_PATTERN.test(code);
}

export function orderTokenCookieName(code: string): string {
  return `sessa_ot_${code.replace(/[^A-Za-z0-9-]/g, "")}`;
}

export function orderTokenCookieOptions(code: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: `/ordine/${code}`,
    maxAge: 60 * 60 * 24 * 180
  };
}

/** Token dalla query (compatibilità) o dal cookie dedicato all'ordine. */
export function resolveOrderToken(
  code: string,
  queryToken: string | undefined,
  readCookie: (name: string) => string | undefined
): string | null {
  if (queryToken && ORDER_TOKEN_PATTERN.test(queryToken)) return queryToken;
  const fromCookie = readCookie(orderTokenCookieName(code));
  return fromCookie && ORDER_TOKEN_PATTERN.test(fromCookie) ? fromCookie : null;
}
