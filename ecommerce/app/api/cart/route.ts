import { NextResponse, type NextRequest } from "next/server";
import { CART_COOKIE } from "@/lib/services/cart";
import { loadCartDTO } from "@/lib/services/cart-dto";
import { getSessionCustomer } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(CART_COOKIE)?.value;
  const customer = await getSessionCustomer();
  const dto = await loadCartDTO(token, customer?.id);
    return NextResponse.json(dto);
  } catch (error) {
    console.error("[cart.read] Carrello non disponibile", { errorType: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json(
      { error: "Carrello temporaneamente non disponibile." },
      { status: 503, headers: { "Retry-After": "2" } }
    );
  }
}
