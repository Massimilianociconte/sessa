import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash password con scrypt (built-in Node, nessuna dipendenza nativa).
 * Formato: scrypt$N$r$p$salt$hash — i parametri viaggiano nell'hash,
 * quindi si possono irrobustire in futuro senza invalidare gli hash esistenti.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$16384$8$1$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p)
  });
  return timingSafeEqual(actual, expected);
}
