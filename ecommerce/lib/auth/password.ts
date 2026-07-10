import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$0123456789abcdef0123456789abcdef$9564d5a180593f4f60ac8b2db7e8966b37a1d6fc22b396d69f4f71972c1820f80cec190209c19b5603fae554eee5a6318a4cadcbc5b3892fd40e2d8df24c3997";

const MAX_PASSWORD_BYTES = 1_024;

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
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const cost = Number(N);
  const blockSize = Number(r);
  const parallelization = Number(p);
  if (
    !Number.isInteger(cost) || cost < 16_384 || cost > 65_536 ||
    !Number.isInteger(blockSize) || blockSize < 1 || blockSize > 16 ||
    !Number.isInteger(parallelization) || parallelization < 1 || parallelization > 8 ||
    !/^[a-f0-9]{32,128}$/i.test(salt) ||
    !/^[a-f0-9]{64,256}$/i.test(hash) || hash.length % 2 !== 0
  ) {
    return false;
  }
  try {
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization
    });
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Mantiene il costo del confronto anche quando l'account non esiste. */
export function verifyPasswordOrDummy(password: string, stored: string | null | undefined): boolean {
  return verifyPassword(password, stored ?? DUMMY_PASSWORD_HASH);
}
