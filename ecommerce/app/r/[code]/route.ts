import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { REFERRAL_COOKIE } from "@/lib/services/referral";

export const dynamic = "force-dynamic";

/**
 * Landing del link referral: valida il codice, imposta il cookie e porta alla
 * registrazione. Il collegamento vero avviene alla registrazione (anti-abuso lì).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrer = await prisma.customer.findUnique({ where: { referralCode: code } });
  const target = new URL(referrer ? "/account/registrati?ref=1" : "/", request.url);
  const response = NextResponse.redirect(target);
  if (referrer) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }
  return response;
}
