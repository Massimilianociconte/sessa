export const ISOLATED_CART_TOKEN_PREFIX = "isolated:";
export const CONVERTED_CART_TOKEN_PREFIX = "converted:";
export const MERGED_CART_TOKEN_PREFIX = "merged:";

/** Token da browser: non riusare cookie di carrelli già isolati, convertiti o fusi. */
export function isBrowserReusableCartToken(token: string): boolean {
  const value = token.trim();
  if (value.length < 16) return false;
  return (
    !value.startsWith(ISOLATED_CART_TOKEN_PREFIX) &&
    !value.startsWith(CONVERTED_CART_TOKEN_PREFIX) &&
    !value.startsWith(MERGED_CART_TOKEN_PREFIX)
  );
}

/** Nuovo token dopo logout: il cookie precedente non può più aprire il carrello. */
export function buildIsolatedCartToken(cartId: string, entropy: string): string {
  return `${ISOLATED_CART_TOKEN_PREFIX}${cartId}:${entropy}`;
}
