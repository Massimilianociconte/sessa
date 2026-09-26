import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { resolveOrderToken } from "@/lib/order-access";
import { getOrderForTracking } from "@/lib/services/orders";

export const dynamic = "force-dynamic";

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Promemoria calendario (.ics) per ritiro o consegna: riduce i ritiri mancati. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code);
  const cookieStore = await cookies();
  const token = resolveOrderToken(code, request.nextUrl.searchParams.get("t") ?? undefined, (name) => cookieStore.get(name)?.value);
  const order = token ? await getOrderForTracking(code, token) : null;
  if (!order?.fulfillmentAt) return new NextResponse("Non trovato", { status: 404 });

  const start = order.fulfillmentAt;
  const end = new Date(start.getTime() + 30 * 60_000);
  const isPickup = order.fulfillmentType === "PICKUP";
  const where = isPickup && order.location
    ? `Sessa 1930 ${order.locationName}, ${order.location.address}, ${order.location.city}`
    : `${order.shipLine1}, ${order.shipPostalCode} ${order.shipCity}`;
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sessa 1930//Ordini//IT",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${order.code}@sessa1930`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(`${isPickup ? "Ritiro" : "Consegna"} ordine ${order.code} — Sessa 1930`)}`,
    `LOCATION:${icsText(where)}`,
    `DESCRIPTION:${icsText(order.items.map((item) => `${item.qty} x ${item.productName} (${item.variantName})`).join("\n"))}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(`Ordine ${order.code} tra 2 ore`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="ordine-${order.code}.ics"`,
      "Cache-Control": "private, no-store"
    }
  });
}
