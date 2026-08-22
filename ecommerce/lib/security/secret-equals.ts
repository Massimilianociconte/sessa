import { timingSafeEqual } from "node:crypto";

/** Confronto a tempo costante: evita leak su token di tracking e segreti opachi. */
export function secretEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
