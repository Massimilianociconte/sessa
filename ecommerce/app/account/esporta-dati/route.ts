import { NextResponse } from "next/server";
import { getSessionCustomer } from "@/lib/auth/customer-session";
import { exportCustomerData } from "@/lib/services/customer-gdpr";

export const dynamic = "force-dynamic";

/** Download JSON di tutti i dati personali del cliente autenticato (GDPR portabilità). */
export async function GET() {
  const customer = await getSessionCustomer();
  if (!customer) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const data = await exportCustomerData(customer.id);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sessa1930-dati-account-${stamp}.json"`,
      "Cache-Control": "no-store"
    }
  });
}
