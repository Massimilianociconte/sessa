import { buildCartView, getCartByToken, getCartGiftCard } from "@/lib/services/cart";
import { EMPTY_CART, type CartDTO } from "@/lib/cart-types";

/** Costruisce il DTO leggero del carrello per le API del drawer. */
export async function loadCartDTO(token: string | null | undefined): Promise<CartDTO> {
  if (!token) return EMPTY_CART;
  const cart = await getCartByToken(token);
  if (!cart) return EMPTY_CART;
  const view = buildCartView(cart);
  const giftCard = await getCartGiftCard(cart);

  return {
    empty: view.lines.length === 0,
    itemCount: view.itemCount,
    subtotalCents: view.subtotalCents,
    discountCents: view.discountCents,
    discountCode: view.discountCents > 0 ? view.discountCode : null,
    giftCardCode: giftCard && giftCard.valid ? giftCard.code : null,
    giftCardBalanceCents: giftCard && giftCard.valid ? giftCard.balanceCents : 0,
    locationSlug: view.locationSlug,
    locationName: view.locationName,
    lines: view.lines.map((l) => ({
      itemId: l.itemId,
      productId: l.productId,
      productName: l.productName,
      productSlug: l.productSlug,
      variantName: l.variantName,
      image: l.image,
      unitCents: l.unitCents,
      qty: l.qty,
      totalCents: l.totalCents,
      maxQty: l.maxQty
    }))
  };
}
