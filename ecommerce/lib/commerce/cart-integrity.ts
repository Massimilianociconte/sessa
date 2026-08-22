export type LiveCartLine = {
  available: boolean;
  productActive: boolean;
  variantActive: boolean;
  stockQty: number;
  unitCents: number;
  previousUnitCents?: number;
};

export type CartIntegrityInput = {
  itemId: string;
  storeVariantId: string;
  qty: number;
  productName?: string;
  live: LiveCartLine;
};

export const CART_LINE_MAX_QTY = 99;

/** Quantita dopo un add: somma con riga esistente, senza superare stock. */
export function planCartQuantity(input: {
  alreadyInCart: number;
  addQty: number;
  stockQty: number;
}): { qty: number; requested: number; clamped: boolean } {
  const requested = input.alreadyInCart + input.addQty;
  const qty = Math.min(Math.max(0, requested), Math.max(0, input.stockQty), CART_LINE_MAX_QTY);
  return { qty, requested, clamped: qty < requested };
}

/** Quantita dopo un set esplicito. */
export function planSetCartQuantity(input: {
  requestedQty: number;
  stockQty: number;
}): { qty: number; requested: number; clamped: boolean } {
  const requested = input.requestedQty;
  const qty = Math.min(Math.max(0, requested), Math.max(0, input.stockQty), CART_LINE_MAX_QTY);
  return { qty, requested, clamped: requested > 0 && qty < requested };
}

export function describeStockClamp(input: { productName?: string; requested: number; kept: number }): string {
  const subject = input.productName?.trim() ? `"${input.productName.trim()}"` : "Il prodotto";
  const keptLabel = input.kept === 1 ? "pezzo" : "pezzi";
  return `${subject}: nel carrello ci sono ${input.kept} ${keptLabel}, non ${input.requested}, per lo stock attuale.`;
}

export function describeCartIntegrityWarnings(
  result: Pick<CartIntegrityResult, "removed" | "clamped">,
  names: Record<string, string> = {}
): string[] {
  return [
    ...result.removed.map((item) => {
      const name = names[item.itemId] ?? item.productName;
      const subject = name ? `"${name}"` : "Un prodotto";
      return item.reason === "unavailable"
        ? `${subject} non e piu disponibile in questa sede ed e stato rimosso.`
        : `${subject} e esaurito ed e stato rimosso dal carrello.`;
    }),
    ...result.clamped.map((item) =>
      describeStockClamp({
        productName: names[item.itemId] ?? item.productName,
        requested: item.from,
        kept: item.to
      })
    )
  ];
}

export type SanitizedCartLine = {
  itemId: string;
  storeVariantId: string;
  qty: number;
  unitCents: number;
};

export type CartIntegrityResult = {
  kept: SanitizedCartLine[];
  removed: Array<{ itemId: string; reason: "unavailable" | "sold_out"; productName?: string }>;
  clamped: Array<{ itemId: string; from: number; to: number; productName?: string }>;
  priceChanges: Array<{ itemId: string; from: number; to: number }>;
};

export function isPurchasable(live: LiveCartLine): boolean {
  return live.available && live.productActive && live.variantActive && live.stockQty > 0;
}

/** Allinea il carrello a stock, visibilità e prezzo correnti senza fidarsi del client. */
export function sanitizeCartLines(lines: CartIntegrityInput[]): CartIntegrityResult {
  const kept: SanitizedCartLine[] = [];
  const removed: CartIntegrityResult["removed"] = [];
  const clamped: CartIntegrityResult["clamped"] = [];
  const priceChanges: CartIntegrityResult["priceChanges"] = [];

  for (const line of lines) {
    if (!line.live.available || !line.live.productActive || !line.live.variantActive) {
      removed.push({ itemId: line.itemId, reason: "unavailable", productName: line.productName });
      continue;
    }
    const qty = Math.min(Math.max(0, Math.trunc(line.qty)), line.live.stockQty, CART_LINE_MAX_QTY);
    if (qty <= 0) {
      removed.push({ itemId: line.itemId, reason: "sold_out", productName: line.productName });
      continue;
    }
    if (qty !== line.qty) {
      clamped.push({ itemId: line.itemId, from: line.qty, to: qty, productName: line.productName });
    }
    if (
      line.live.previousUnitCents !== undefined &&
      line.live.previousUnitCents !== line.live.unitCents
    ) {
      priceChanges.push({
        itemId: line.itemId,
        from: line.live.previousUnitCents,
        to: line.live.unitCents
      });
    }
    kept.push({
      itemId: line.itemId,
      storeVariantId: line.storeVariantId,
      qty,
      unitCents: line.live.unitCents
    });
  }

  return { kept, removed, clamped, priceChanges };
}
