/** Regole di ambito consegna, pure (usate da server e checkout client). */
export type ShippingScope = "LOCAL" | "NATIONAL";

/**
 * CAP serviti dalla consegna locale del fresco: voci separate da virgola,
 * CAP completi (80044) o prefissi (800 = tutti i CAP che iniziano per 800).
 */
export function isPostalCodeServed(postalCode: string | null | undefined, servedCsv: string): boolean {
  const cap = (postalCode ?? "").trim();
  if (!/^\d{5}$/.test(cap)) return false;
  return servedCsv
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^\d{2,5}$/.test(entry))
    .some((entry) => cap.startsWith(entry));
}

/**
 * Ambiti di consegna ammessi per un carrello:
 * - NATIONAL (corriere) solo se TUTTI i prodotti sono spedibili;
 * - LOCAL (consegna del fresco dalla sede) solo nei CAP serviti dalla sede.
 */
export function allowedShippingScopes(input: {
  allItemsShippable: boolean;
  postalCode: string | null | undefined;
  localDeliveryPostalCodes: string;
}): Set<ShippingScope> {
  const scopes = new Set<ShippingScope>();
  if (input.allItemsShippable) scopes.add("NATIONAL");
  if (isPostalCodeServed(input.postalCode, input.localDeliveryPostalCodes)) scopes.add("LOCAL");
  return scopes;
}
