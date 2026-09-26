import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/constants";
import { isValidOrderCode, ORDER_TOKEN_PATTERN, orderTokenCookieName, orderTokenCookieOptions } from "@/lib/order-access";

/**
 * Primo cancello di difesa su edge. I layout e le server action rivalidano
 * comunque la sessione sul database: qui si evita solo lavoro inutile quando
 * manca del tutto il cookie.
 */
const PUBLIC_ACCOUNT = new Set([
  "/account/login",
  "/account/registrati",
  "/account/recupera",
  "/account/reset",
  "/account/attiva",
  "/account/verifica-email",
  "/account/disiscrizione"
]);

/** /ordine/<code>?t=<token> → cookie httpOnly sul path dell'ordine + URL pulito. */
function moveOrderTokenToCookie(request: NextRequest): NextResponse | null {
  const match = request.nextUrl.pathname.match(/^\/ordine\/([^/]+)(\/ricevuta)?\/?$/);
  const token = request.nextUrl.searchParams.get("t");
  if (!match || !token) return null;
  const code = decodeURIComponent(match[1]);
  if (!isValidOrderCode(code) || !ORDER_TOKEN_PATTERN.test(token)) return null;
  const target = request.nextUrl.clone();
  target.searchParams.delete("t");
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(orderTokenCookieName(code), token, orderTokenCookieOptions(code));
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ordine/")) {
    return moveOrderTokenToCookie(request) ?? NextResponse.next();
  }

  const loginRedirect = (loginPath: "/admin/login" | "/account/login") => {
    const target = request.nextUrl.clone();
    target.pathname = loginPath;
    target.search = "";
    target.searchParams.set("expired", "1");
    target.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(target);
  };

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login" || pathname === "/admin/setup") return NextResponse.next();
    if (!request.cookies.has(SESSION_COOKIE)) return loginRedirect("/admin/login");
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-sessa-pathname", pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith("/account")) {
    if (PUBLIC_ACCOUNT.has(pathname)) return NextResponse.next();
    if (!request.cookies.has(CUSTOMER_SESSION_COOKIE)) return loginRedirect("/account/login");
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/ordine/:path*"]
};
