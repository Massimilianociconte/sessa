/** Tipi del carrello condivisi client/server (nessun import server). */

export type CartLineDTO = {
  itemId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  image: string | null;
  unitCents: number;
  qty: number;
  totalCents: number;
  maxQty: number;
};

export type CartDTO = {
  empty: boolean;
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  discountCode: string | null;
  giftCardCode: string | null;
  giftCardBalanceCents: number;
  locationSlug: string | null;
  locationName: string | null;
  lines: CartLineDTO[];
};

export const EMPTY_CART: CartDTO = {
  empty: true,
  itemCount: 0,
  subtotalCents: 0,
  discountCents: 0,
  discountCode: null,
  giftCardCode: null,
  giftCardBalanceCents: 0,
  locationSlug: null,
  locationName: null,
  lines: []
};
