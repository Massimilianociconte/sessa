import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CART_COOKIE, getCartByToken, removeItem } from "@/lib/services/cart";
import { loadCartDTO } from "@/lib/services/cart-dto";

export const dynamic = "force-dynamic";

const schema = z.object({ itemId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const token = request.cookies.get(CART_COOKIE)?.value;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!token || !parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const cart = await getCartByToken(token);
  if (cart) await removeItem(cart.id, parsed.data.itemId);
  return NextResponse.json(await loadCartDTO(token));
}
