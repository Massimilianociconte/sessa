import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { CartDTO } from "@/lib/cart-types";
import { DomainError } from "@/lib/domain";
import { addItemToCart, CART_COOKIE, getOrCreateCartForLocation } from "@/lib/services/cart";
import { loadCartDTO } from "@/lib/services/cart-dto";
import { enforceCartRateLimit } from "@/lib/services/cart-rate-limit";
import { getSessionCustomer } from "@/lib/auth/customer-session";

export const dynamic = "force-dynamic";

const schema = z.object({
  locationId: z.string().min(1),
  storeVariantId: z.string().min(1),
  qty: z.coerce.number().int().min(1).max(99).default(1)
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  }

  let token = request.cookies.get(CART_COOKIE)?.value;
  let setCookie = false;
  if (!token) {
    token = randomBytes(24).toString("hex");
    setCookie = true;
  }

  try {
    await enforceCartRateLimit(request.headers, token, "mutation");
    const cart = await getOrCreateCartForLocation(token, parsed.data.locationId);
    await addItemToCart(cart.id, parsed.data.storeVariantId, parsed.data.qty);
  } catch (error) {
    const message = error instanceof DomainError ? error.message : "Impossibile aggiungere il prodotto.";
    return NextResponse.json(
      { error: message },
      { status: error instanceof DomainError && error.code === "RATE_LIMITED" ? 429 : 400 }
    );
  }

  let dto: CartDTO;
  try {
    const customer = await getSessionCustomer();
    dto = await loadCartDTO(token, customer?.id);
  } catch (error) {
    console.error("[cart.add] Aggiornamento eseguito ma risposta non disponibile", {
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json(
      { error: "Il prodotto potrebbe essere stato aggiunto, ma non riusciamo a verificare il carrello. Aprilo prima di riprovare." },
      { status: 503, headers: { "Retry-After": "2" } }
    );
  }
  const response = NextResponse.json(dto);
  if (setCookie) {
    response.cookies.set(CART_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }
  return response;
}
