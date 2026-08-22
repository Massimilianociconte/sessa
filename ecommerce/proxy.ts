import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_SESSION_COOKIE, SESSION_COOKIE } from "@/lib/auth/constants";

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
  "/account/verifica-email"
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
  matcher: ["/admin/:path*", "/account/:path*"]
};
