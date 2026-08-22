import { NextResponse } from "next/server";
import { authorizeInternalJob } from "@/lib/auth/internal-jobs";
import { expireStockReservations } from "@/lib/services/stock-reservations";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!authorizeInternalJob(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const result = await expireStockReservations(10);
  return NextResponse.json({ ok: true, result }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
