import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { percentOf } from "@/lib/money";

/**
 * Motore sconti granulare. La validità e l'importo dipendono da:
 * - sede (locations link, vuoto = tutte le sedi)
 * - sottoinsieme idoneo (categories/products link, vuoto = tutto il carrello)
 * - vincoli: min subtotale, finestra temporale, usi totali, per-utente,
 *   primo ordine, codice riservato a un cliente.
 *
 * Gli sconti per categoria/prodotto si applicano SOLO alle righe idonee,
 * non all'intero subtotale (comportamento granulare corretto).
 */

const discountInclude = {
  locations: true,
  categories: true,
  products: true
} satisfies Prisma.DiscountCodeInclude;

export type DiscountWithLinks = Prisma.DiscountCodeGetPayload<{ include: typeof discountInclude }>;

export type DiscountLine = {
  productId: string | null;
  categoryId: string | null;
  lineCents: number;
};

export type DiscountContext = {
  locationId: string;
  subtotalCents: number;
  lines: DiscountLine[];
  customerId?: string | null;
  /** Gating autoritativo dal checkout (in anteprima carrello può mancare). */
  isFirstOrder?: boolean;
  customerRedemptions?: number;
};

export type DiscountEval =
  | { ok: true; discount: DiscountWithLinks; amountCents: number; eligibleBaseCents: number }
  | { ok: false; reason: string };

export async function loadDiscount(code: string): Promise<DiscountWithLinks | null> {
  return prisma.discountCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: discountInclude
  });
}

export function evaluateDiscount(discount: DiscountWithLinks, ctx: DiscountContext): DiscountEval {
  if (!discount.isActive) return { ok: false, reason: "Codice sconto non valido." };

  const now = new Date();
  if (discount.startsAt && discount.startsAt > now) {
    return { ok: false, reason: "Codice non ancora attivo." };
  }
  if (discount.endsAt && discount.endsAt < now) {
    return { ok: false, reason: "Codice scaduto." };
  }
  if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
    return { ok: false, reason: "Codice esaurito." };
  }
  if (discount.customerId && discount.customerId !== ctx.customerId) {
    return { ok: false, reason: "Codice riservato a un altro cliente." };
  }
  if (
    discount.minSubtotalCents !== null &&
    ctx.subtotalCents < discount.minSubtotalCents
  ) {
    return { ok: false, reason: "Il carrello non raggiunge il minimo richiesto." };
  }
  // Vincolo di sede
  if (discount.locations.length > 0 && !discount.locations.some((l) => l.locationId === ctx.locationId)) {
    return { ok: false, reason: "Codice non valido per questa sede." };
  }
  // Primo ordine / limite per utente (verificati quando il dato è disponibile)
  if (discount.firstOrderOnly && ctx.isFirstOrder === false) {
    return { ok: false, reason: "Codice valido solo per il primo ordine." };
  }
  if (
    discount.perUserLimit !== null &&
    ctx.customerRedemptions !== undefined &&
    ctx.customerRedemptions >= discount.perUserLimit
  ) {
    return { ok: false, reason: "Hai già utilizzato questo codice." };
  }

  // Base idonea: intero subtotale, o solo le righe che matchano categorie/prodotti.
  const hasProductFilter = discount.products.length > 0;
  const hasCategoryFilter = discount.categories.length > 0;
  let base = ctx.subtotalCents;
  if (hasProductFilter || hasCategoryFilter) {
    const prodIds = new Set(discount.products.map((p) => p.productId));
    const catIds = new Set(discount.categories.map((c) => c.categoryId));
    base = ctx.lines
      .filter(
        (l) =>
          (l.productId !== null && prodIds.has(l.productId)) ||
          (l.categoryId !== null && catIds.has(l.categoryId))
      )
      .reduce((sum, l) => sum + l.lineCents, 0);
  }
  if (base <= 0) {
    return { ok: false, reason: "Lo sconto non si applica ai prodotti nel carrello." };
  }

  const raw =
    discount.type === "PERCENT" ? percentOf(base, discount.value) : Math.min(discount.value, base);
  const amountCents = Math.min(raw, ctx.subtotalCents);
  return { ok: true, discount, amountCents, eligibleBaseCents: base };
}

/** Comodità: carica + valuta in un colpo (per anteprima carrello). */
export async function checkDiscount(code: string, ctx: DiscountContext): Promise<DiscountEval> {
  const discount = await loadDiscount(code);
  if (!discount) return { ok: false, reason: "Codice sconto non valido." };
  return evaluateDiscount(discount, ctx);
}
