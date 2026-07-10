import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/domain";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { consumeCustomerToken } from "@/lib/services/customer-verification";
import { clearCustomerDisplayNameCookie } from "@/lib/auth/display-name";

export const dynamic = "force-dynamic";

/**
 * Link cliccato dall'email di verifica/cambio email. Il token È l'autenticazione:
 * la rotta resta pubblica (il cliente può aprirla da un dispositivo senza sessione).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const base = request.nextUrl.origin;
  if (!token) {
    return NextResponse.redirect(`${base}/account/login?err=${encodeURIComponent("Link non valido.")}`);
  }
  try {
    const type = await consumeCustomerToken(token);
    if (type === "CHANGE_EMAIL") await clearCustomerDisplayNameCookie();
    const message =
      type === "CHANGE_EMAIL" ? "Email aggiornata e verificata." : "Email verificata, grazie!";
    const session = await getSessionCustomer();
    const target = session ? "/account/profilo?msg=" : "/account/login?msg=";
    return NextResponse.redirect(`${base}${target}${encodeURIComponent(message)}`);
  } catch (error) {
    const message = error instanceof DomainError ? error.message : "Link non valido o scaduto.";
    const session = await getSessionCustomer();
    const target = session ? "/account/profilo?err=" : "/account/login?err=";
    return NextResponse.redirect(`${base}${target}${encodeURIComponent(message)}`);
  }
}
