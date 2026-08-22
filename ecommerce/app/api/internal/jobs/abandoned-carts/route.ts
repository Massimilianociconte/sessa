import { NextResponse } from "next/server";
import { authorizeInternalJob } from "@/lib/auth/internal-jobs";
import { notifyAbandonedCarts } from "@/lib/services/abandoned-carts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!authorizeInternalJob(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const result = await notifyAbandonedCarts();
  return NextResponse.json({ ok: true, result });
}
