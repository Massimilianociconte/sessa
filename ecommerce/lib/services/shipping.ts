import type { ShippingRate } from "@prisma/client";
import { prisma } from "@/lib/db";

export type QuotedRate = ShippingRate & {
  /** Costo effettivo per questo carrello (0 se scatta la soglia gratis). */
  effectiveCents: number;
  isFree: boolean;
};

/**
 * Tariffe disponibili per un paese, con il costo effettivo calcolato
 * sul subtotale già scontato (la soglia "gratis sopra X" guarda quello).
 */
export async function quoteRatesForCountry(
  country: string,
  discountedSubtotalCents: number
): Promise<QuotedRate[]> {
  const zones = await prisma.shippingZone.findMany({
    where: { isActive: true },
    include: { rates: { where: { isActive: true }, orderBy: { position: "asc" } } },
    orderBy: { position: "asc" }
  });
  const normalized = country.trim().toUpperCase();
  const zone = zones.find((z) =>
    z.countries.split(",").map((c) => c.trim().toUpperCase()).includes(normalized)
  );
  if (!zone) return [];
  return zone.rates.map((rate) => {
    const isFree = rate.freeAboveCents !== null && discountedSubtotalCents >= rate.freeAboveCents;
    return { ...rate, effectiveCents: isFree ? 0 : rate.amountCents, isFree };
  });
}

export async function getQuotedRate(
  rateId: string,
  country: string,
  discountedSubtotalCents: number
): Promise<QuotedRate | null> {
  const rates = await quoteRatesForCountry(country, discountedSubtotalCents);
  return rates.find((r) => r.id === rateId) ?? null;
}
