import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/money";
import { effectivePrice } from "@/lib/services/catalog";
import { listInventory } from "@/lib/services/inventory";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",;\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** Export CSV dello stock per sede (rispetta i filtri correnti della pagina magazzino). */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const rows = await listInventory({
    locationId: params.get("sede") || undefined,
    query: params.get("q") || undefined,
    lowOnly: params.get("soglia") === "1"
  });

  const header = ["Sede", "Prodotto", "Variante", "SKU", "Stato prodotto", "Prezzo", "Stock", "Soglia", "Disponibile"];
  const lines = rows.map((sv) => [
    sv.location.name,
    sv.variant.product.name,
    sv.variant.name,
    sv.variant.sku,
    sv.variant.product.status,
    formatCents(effectivePrice(sv.priceCentsOverride, sv.variant.basePriceCents)),
    sv.stockQty,
    sv.lowStockThreshold,
    sv.isAvailable ? "Sì" : "No"
  ]);

  const csv = [header, ...lines].map((row) => row.map(csvCell).join(";")).join("\n");
  await audit(user.email, "inventory.export", "StoreVariant", "csv", { count: rows.length });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="magazzino-sessa-${stamp}.csv"`
    }
  });
}
