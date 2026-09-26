import { NextResponse } from "next/server";
import { authorizeInternalJob } from "@/lib/auth/internal-jobs";
import { processEmailQueue } from "@/lib/services/email";
import { runRetention } from "@/lib/services/retention";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!authorizeInternalJob(request)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const result = await processEmailQueue({ limit: 25 });
  // Manutenzione oraria (minuto 0): conservazione dati, nonce orfani,
  // ricifratura dopo una rotazione del segreto.
  const retention = new Date().getUTCMinutes() === 0 ? await runRetention().catch(() => null) : null;
  return NextResponse.json({ ok: true, result, retention }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
