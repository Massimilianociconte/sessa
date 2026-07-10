import { NextResponse, type NextRequest } from "next/server";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { exportCustomerData } from "@/lib/services/customer-gdpr";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { clearAttempts, isRateLimited, registerFailedAttempt } from "@/lib/auth/rate-limit";
import { getClientIp, rateLimitKey } from "@/lib/auth/request-context";

export const dynamic = "force-dynamic";

/** Download GDPR: oltre alla sessione richiede reautenticazione della password. */
export async function POST(request: NextRequest) {
  const customer = await getSessionCustomer();
  if (!customer) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const rateKey = rateLimitKey("account-export", await getClientIp(), customer.id);
  if ((await isRateLimited(rateKey)) !== null) {
    return NextResponse.redirect(
      new URL(`/account/sicurezza?err=${encodeURIComponent("Troppi tentativi. Riprova più tardi.")}`, request.url),
      303
    );
  }
  const row = await prisma.customer.findUnique({
    where: { id: customer.id },
    select: { passwordHash: true }
  });
  if (!row?.passwordHash || !verifyPassword(password, row.passwordHash)) {
    await registerFailedAttempt(rateKey);
    return NextResponse.redirect(
      new URL(`/account/sicurezza?err=${encodeURIComponent("Password non valida per l'esportazione.")}`, request.url),
      303
    );
  }
  await clearAttempts(rateKey);

  const data = await exportCustomerData(customer.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sessa1930-dati-account-${stamp}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/account/sicurezza#password", request.url), 303);
}
