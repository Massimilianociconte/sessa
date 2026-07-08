import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type FulfillmentType,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus
} from "@/lib/domain";
import { formatCents } from "@/lib/money";
import { listOrdersForExport, type OrderFilter } from "@/lib/services/orders";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /[",;\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function parseDay(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Export CSV degli ordini filtrati. Middleware = primo cancello; qui la sessione admin è rivalidata a DB. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const placedTo = parseDay(params.get("a"));
  const filter: OrderFilter = {
    status: ORDER_STATUSES.includes(params.get("stato") as OrderStatus)
      ? (params.get("stato") as OrderStatus)
      : undefined,
    query: params.get("q") ?? undefined,
    locationId: params.get("sede") || undefined,
    paymentStatus: PAYMENT_STATUSES.includes(params.get("pagamento") as PaymentStatus)
      ? (params.get("pagamento") as string)
      : undefined,
    paymentMethod: PAYMENT_METHODS.includes(params.get("metodo") as PaymentMethod)
      ? (params.get("metodo") as string)
      : undefined,
    fulfillmentType: params.get("evasione") === "PICKUP" || params.get("evasione") === "DELIVERY"
      ? (params.get("evasione") as string)
      : undefined,
    discountCode: params.get("codice") ?? undefined,
    placedFrom: parseDay(params.get("da")),
    placedTo: placedTo ? new Date(placedTo.getTime() + 24 * 60 * 60 * 1000) : undefined,
    fulfillmentOn: parseDay(params.get("giorno"))
  };

  const orders = await listOrdersForExport(filter);

  const header = [
    "Codice",
    "Data ordine",
    "Sede",
    "Cliente",
    "Email",
    "Telefono",
    "Stato",
    "Stato pagamento",
    "Metodo pagamento",
    "Rif. pagamento",
    "Modalità",
    "Ritiro/consegna il",
    "Articoli",
    "Subtotale",
    "Sconto",
    "Gift card",
    "Consegna",
    "Totale",
    "Codice sconto",
    "Referral"
  ];
  const rows = orders.map((order) => [
    order.code,
    order.placedAt.toISOString(),
    order.location?.name ?? order.locationName,
    order.shipFullName,
    order.email,
    order.phone ?? "",
    ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status,
    order.paymentStatus,
    order.paymentMethod ?? "",
    order.paymentRef ?? "",
    FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType] ?? order.fulfillmentType,
    order.fulfillmentAt ? order.fulfillmentAt.toISOString() : "",
    order.items.map((item) => `${item.qty}x ${item.productName} (${item.variantName})`).join(" | "),
    formatCents(order.subtotalCents),
    formatCents(order.discountCents),
    formatCents(order.giftCardCents),
    formatCents(order.shippingCents),
    formatCents(order.totalCents),
    order.discountCodeSnapshot ?? "",
    order.referralCodeSnapshot ?? ""
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  await audit(user.email, "order.export", "Order", "csv", { count: orders.length });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ordini-sessa-${stamp}.csv"`
    }
  });
}
