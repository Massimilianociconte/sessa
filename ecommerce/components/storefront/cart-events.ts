"use client";

import type { CartDTO } from "@/lib/cart-types";

/** Bus eventi leggero per collegare "Aggiungi" (nel corpo pagina) al drawer (nell'header). */
const OPEN = "sessa-cart-open";
const CHANGED = "sessa-cart-changed";

export function openCart(cart?: CartDTO): void {
  window.dispatchEvent(new CustomEvent<CartDTO | undefined>(OPEN, { detail: cart }));
}

export function notifyCartChanged(cart?: CartDTO): void {
  window.dispatchEvent(new CustomEvent<CartDTO | undefined>(CHANGED, { detail: cart }));
}

export function onOpenCart(cb: (cart?: CartDTO) => void): () => void {
  const listener = (event: Event) => cb((event as CustomEvent<CartDTO | undefined>).detail);
  window.addEventListener(OPEN, listener);
  return () => window.removeEventListener(OPEN, listener);
}

export function onCartChanged(cb: (cart?: CartDTO) => void): () => void {
  const listener = (event: Event) => cb((event as CustomEvent<CartDTO | undefined>).detail);
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}
