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
  "/account/reset",
  "/account/verifica-email" // il token nel link è l'autenticazione
]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const loginRedirect = (loginPath: "/admin/login" | "/account/login") => {
    const target = request.nextUrl.clone();
    target.pathname = loginPath;
    target.search = "";
    target.searchParams.set("expired", "1");
    target.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(target);
  };

  // Area gestionale
  if (pathname.startsWith("/admin")) {
    // /admin/setup è il bootstrap del primo account: si autodisattiva a DB
    // (redirect a login se esiste già un admin) + token env in produzione.
    if (pathname === "/admin/login" || pathname === "/admin/setup") return NextResponse.next();
    if (!request.cookies.has(SESSION_COOKIE)) {
      return loginRedirect("/admin/login");
    }
    return NextResponse.next();
  }

  // Area cliente
  if (pathname.startsWith("/account")) {
    if (PUBLIC_ACCOUNT.has(pathname)) return NextResponse.next();
    if (!request.cookies.has(CUSTOMER_SESSION_COOKIE)) {
      return loginRedirect("/account/login");
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*"]
};
