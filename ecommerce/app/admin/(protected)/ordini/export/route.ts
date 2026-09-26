import { NextResponse, type NextRequest } from "next/server";
import { adminLocationScope, authorizeAdminRoute } from "@/lib/auth/session";
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
import { csvCell } from "@/lib/security/csv";
import { formatRomeDateTimeLocal, romeDayRange } from "@/lib/datetime";

/** "2026-12-24 10:30" in ora di Roma: i CSV li leggono persone in negozio, non sistemi UTC. */
function romeCell(date: Date | null): string {
  return date ? formatRomeDateTimeLocal(date).replace("T", " ") : "";
}

export const dynamic = "force-dynamic";

function parseDay(value: string | null): Date | undefined {
  return value ? romeDayRange(value)?.start : undefined;
}

/** Export CSV degli ordini filtrati. Middleware = primo cancello; qui la sessione admin è rivalidata a DB. */
export async function GET(request: NextRequest) {
  const auth = await authorizeAdminRoute("exports:download");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const user = auth.user;

  const params = request.nextUrl.searchParams;
  const placedTo = params.get("a") ? romeDayRange(params.get("a")!)?.end : undefined;
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
    placedTo,
    fulfillmentOn: parseDay(params.get("giorno")),
    allowedLocationIds: adminLocationScope(user)
  };

  const orders = await listOrdersForExport(filter);

  const header = [
    "Codice",
    "Data ordine (ora di Roma)",
    "Sede",
    "Cliente",
    "Email",
    "Telefono",
    "Stato",
    "Stato pagamento",
    "Metodo pagamento",
    "Rif. pagamento",
    "Modalità",
    "Ritiro/consegna (ora di Roma)",
    "Articoli",
    "Subtotale",
    "Sconto",
    "Gift card",
    "Consegna",
    "Totale",
    "Codice sconto",
    "Referral",
    "Rimborsato",
    "Fattura richiesta",
    "Note cliente"
  ];
  const rows = orders.map((order) => [
    order.code,
    romeCell(order.placedAt),
    order.location?.name ?? order.locationName,
    order.shipFullName,
    order.email,
    order.phone ?? "",
    ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status,
    order.paymentStatus,
    order.paymentMethod ?? "",
    order.paymentRef ?? "",
    FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType] ?? order.fulfillmentType,
    romeCell(order.fulfillmentAt),
    order.items.map((item) => `${item.qty}x ${item.productName} (${item.variantName})`).join(" | "),
    formatCents(order.subtotalCents),
    formatCents(order.discountCents),
    formatCents(order.giftCardCents),
    formatCents(order.shippingCents),
    formatCents(order.totalCents),
    order.discountCodeSnapshot ?? "",
    order.referralCodeSnapshot ?? "",
    formatCents(order.refundedCents),
    order.invoiceRequested ? "Sì" : "",
    order.customerNote ?? ""
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
