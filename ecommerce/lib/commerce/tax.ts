import { includedTax } from "@/lib/money";

/**
 * IVA inclusa nei prezzi (B2C). Lo sconto viene ripartito SOLO sulle righe a
 * cui si applica (codici per categoria/prodotto) e la spedizione, prestazione
 * accessoria (art. 12 DPR 633/72), segue le aliquote dei beni in proporzione
 * al loro valore scontato.
 */
export type TaxLine = {
  grossCents: number;
  taxRateBps: number;
  /** true se lo sconto si applica a questa riga */
  discountEligible: boolean;
};

export type TaxBreakdown = {
  taxCents: number;
  /** Lordo scontato per riga, stesso ordine di input */
  discountedLines: number[];
  byRate: Array<{ rateBps: number; grossCents: number; taxCents: number }>;
};

/** Ripartizione di un importo in centesimi interi proporzionale ai pesi (metodo dei resti). */
export function allocateProportionally(amountCents: number, weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (amountCents <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (amountCents * weight) / total);
  const floors = raw.map(Math.floor);
  let remainder = amountCents - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

export function computeIncludedTax(lines: TaxLine[], discountCents: number, shippingCents: number): TaxBreakdown {
  const eligibleWeights = lines.map((line) => (line.discountEligible ? line.grossCents : 0));
  const discounts = allocateProportionally(discountCents, eligibleWeights);
  const discountedLines = lines.map((line, index) => Math.max(0, line.grossCents - discounts[index]));
  const shippingShares = allocateProportionally(shippingCents, discountedLines);

  const groups = new Map<number, number>();
  lines.forEach((line, index) => {
    groups.set(line.taxRateBps, (groups.get(line.taxRateBps) ?? 0) + discountedLines[index] + shippingShares[index]);
  });
  const byRate = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBps, grossCents]) => ({ rateBps, grossCents, taxCents: includedTax(grossCents, rateBps) }));
  return {
    taxCents: byRate.reduce((sum, row) => sum + row.taxCents, 0),
    discountedLines,
    byRate
  };
}
