/**
 * Tutti gli importi viaggiano in centesimi (Int). Mai float sui prezzi.
 * I prezzi sono lordi (IVA inclusa), come da prassi B2C italiana:
 * l'IVA in Order.taxCents è uno scorporo informativo, non un'addizione.
 */

const formatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR"
});

export function formatCents(cents: number): string {
  return formatter.format(cents / 100);
}

/** "35,00" | "35.00" | "1.250,50" | "35" → centesimi. Lancia su input non valido. */
export function parseEuroToCents(input: string): number {
  let s = input.trim().replace(/[\s€]/g, "");
  if (/,\d{1,2}$/.test(s)) {
    // formato italiano: la virgola è il separatore decimale
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const value = Number(s);
  if (s === "" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Importo non valido: "${input}"`);
  }
  return Math.round(value * 100);
}

/** IVA inclusa in un importo lordo, dato il tasso in basis points (1000 = 10%). */
export function includedTax(grossCents: number, rateBps: number): number {
  if (rateBps <= 0) return 0;
  return Math.round(grossCents - (grossCents * 10000) / (10000 + rateBps));
}

/** Applica uno sconto percentuale espresso in basis points, arrotondando al centesimo. */
export function percentOf(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10000);
}
