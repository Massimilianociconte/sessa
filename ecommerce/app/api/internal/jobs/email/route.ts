import { NextResponse } from "next/server";
import { authorizeInternalJob } from "@/lib/auth/internal-jobs";
import { processEmailQueue, pruneEmailHistory } from "@/lib/services/email";
import { pruneCheckoutNonces } from "@/lib/services/checkout";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!authorizeInternalJob(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const result = await processEmailQueue({ limit: 3 });
  // Manutenzione oraria: storico email inviate/dead + nonce di checkout
  // orfani (tentativi non conclusi oltre la finestra di retry).
  const pruned = new Date().getUTCMinutes() === 0
    ? {
        ...(await pruneEmailHistory()),
        checkoutNonces: await pruneCheckoutNonces().catch(() => 0)
      }
    : { sent: 0, dead: 0, checkoutNonces: 0 };
  return NextResponse.json({ ok: true, result, pruned }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
