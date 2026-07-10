import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CART_COOKIE, getCartByToken, setItemQty } from "@/lib/services/cart";
import { loadCartDTO } from "@/lib/services/cart-dto";
import { DomainError } from "@/lib/domain";
import { enforceCartRateLimit } from "@/lib/services/cart-rate-limit";
import { getSessionCustomer } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

const schema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().int().min(0).max(99)
});

export async function POST(request: NextRequest) {
  const token = request.cookies.get(CART_COOKIE)?.value;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!token || !parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  try {
    await enforceCartRateLimit(request.headers, token, "mutation");
    const cart = await getCartByToken(token);
    if (cart) await setItemQty(cart.id, parsed.data.itemId, parsed.data.qty);
    const customer = await getSessionCustomer();
    return NextResponse.json(await loadCartDTO(token, customer?.id));
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "RATE_LIMITED" ? 429 : 400 }
      );
    }
    console.error("[cart.update] Aggiornamento carrello non confermato", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json(
      { error: "Aggiornamento non confermato. Ricarica il carrello prima di riprovare." },
      { status: 503, headers: { "Retry-After": "2" } }
    );
  }
}
