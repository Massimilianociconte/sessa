import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Primo cancello (difesa in profondità) su edge. NON è l'unico controllo:
 * i layout rivalidano la sessione a DB e le server action richiamano
 * requireAdmin()/requireCustomer(). Qui si verifica solo la presenza del cookie.
 */

// Pagine account pubbliche (nessuna sessione richiesta).
const PUBLIC_ACCOUNT = new Set([
  "/account/login",
  "/account/registrati",
  "/account/recupera",
  "/account/reset"
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Area gestionale
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    if (!request.cookies.has(SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Area cliente
  if (pathname.startsWith("/account")) {
    if (PUBLIC_ACCOUNT.has(pathname)) return NextResponse.next();
    if (!request.cookies.has(CUSTOMER_SESSION_COOKIE)) {
      return NextResponse.redirect(new URL("/account/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"]
};
