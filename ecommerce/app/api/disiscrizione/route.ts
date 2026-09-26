import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeFromLink } from "@/lib/services/marketing-consent";

export const dynamic = "force-dynamic";

/** One-click unsubscribe (RFC 8058, header List-Unsubscribe-Post). */
export async function POST(request: NextRequest) {
  const ok = await unsubscribeFromLink(request.nextUrl.searchParams.get("c") ?? "", request.nextUrl.searchParams.get("s") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

/** Un GET (scanner antivirus, anteprime) non modifica il consenso: porta alla pagina di conferma. */
export async function GET(request: NextRequest) {
  const target = new URL("/account/disiscrizione", request.url);
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 303);
}
