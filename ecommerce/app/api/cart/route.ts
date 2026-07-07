import { NextResponse, type NextRequest } from "next/server";
import { CART_COOKIE } from "@/lib/services/cart";
import { loadCartDTO } from "@/lib/services/cart-dto";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(CART_COOKIE)?.value;
  const dto = await loadCartDTO(token);
  return NextResponse.json(dto);
}
