import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash password con scrypt (built-in Node, nessuna dipendenza nativa).
 * Formato: scrypt$N$r$p$salt$hash — i parametri viaggiano nell'hash,
 * quindi si possono irrobustire in futuro senza invalidare gli hash esistenti.
 *
 * Parametri correnti: N=65536 (2^16), r=8, p=1 → 64 MiB per hash, allineati
 * alla guidance OWASP. Il default maxmem di Node (32 MiB) non basta: va
 * impostato esplicitamente sia in hash sia in verifica.
 *
 * Gli hash legacy N=16384 restano verificabili (verifyPassword) e vengono
 * ri-hashati al costo corrente al prossimo login riuscito (passwordNeedsRehash).
 */

const SCRYPT_N = 65_536;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// 128*N*r byte di memoria richiesta + margine; il limite Node e' 32 MiB.
const SCRYPT_MAXMEM = 132 * 1024 * 1024;

/** Costi N accettati in verifica: corrente + legacy (hash creati prima dell'upgrade). */
const ACCEPTED_N = new Set([16_384, SCRYPT_N]);

export const DUMMY_PASSWORD_HASH =
  "scrypt$65536$8$1$5b0ff9bf62f6f90e5e7faef0c92803bd$7106cf85d8009f2220478de8ce48dc5a32b6d10e9a1239db13112740f85a32288f44299a490d409fc63d5c74531291474fae8c47118c12ff3b8ad7d7d18489fe";

const MAX_PASSWORD_BYTES = 1_024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM
  }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const cost = Number(N);
  const blockSize = Number(r);
  const parallelization = Number(p);
  // Clamp rigoroso: solo i parametri emessi da hashPassword (corrente o legacy).
  // Un hash con parametri gonfiati (fino a ~256 MiB per tentativo) viene rigettato.
  if (
    !ACCEPTED_N.has(cost) ||
    blockSize !== SCRYPT_R ||
    parallelization !== SCRYPT_P ||
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
      p: parallelization,
      maxmem: SCRYPT_MAXMEM
    });
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** true se l'hash esiste ma usa un costo precedente: va ri-hashato dopo una verifica riuscita. */
export function passwordNeedsRehash(stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const cost = Number(parts[1]);
  return Number.isInteger(cost) && cost < SCRYPT_N;
}

/** Mantiene il costo del confronto anche quando l'account non esiste. */
export function verifyPasswordOrDummy(password: string, stored: string | null | undefined): boolean {
  return verifyPassword(password, stored ?? DUMMY_PASSWORD_HASH);
}
