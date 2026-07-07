"use client";

/** Bus eventi leggero per collegare "Aggiungi" (nel corpo pagina) al drawer (nell'header). */
const OPEN = "sessa-cart-open";
const CHANGED = "sessa-cart-changed";

export function openCart(): void {
  window.dispatchEvent(new CustomEvent(OPEN));
}

export function notifyCartChanged(): void {
  window.dispatchEvent(new CustomEvent(CHANGED));
}

export function onOpenCart(cb: () => void): () => void {
  window.addEventListener(OPEN, cb);
  return () => window.removeEventListener(OPEN, cb);
}

export function onCartChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}
