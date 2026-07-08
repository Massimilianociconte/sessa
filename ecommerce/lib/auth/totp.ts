import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP RFC 6238 (compatibile Google Authenticator, 1Password, Aegis, ecc.)
 * implementato con la sola crypto di Node: HMAC-SHA1, 6 cifre, periodo 30s.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segreto nuovo (160 bit, come raccomandato da RFC 4226). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const code =
    (((digest[offset]! & 0x7f) << 24) |
      ((digest[offset + 1]! & 0xff) << 16) |
      ((digest[offset + 2]! & 0xff) << 8) |
      (digest[offset + 3]! & 0xff)) %
    10 ** TOTP_DIGITS;
  return String(code).padStart(TOTP_DIGITS, "0");
}

export function currentTotpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * Verifica un codice con finestra ±1 step (deriva orologio ~30s).
 * Ritorna lo step accettato (per l'anti-replay) o null se non valido.
 */
export function verifyTotpCode(secretBase32: string, code: string, now = Date.now()): number | null {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const step = currentTotpStep(now);
  for (const candidate of [step, step - 1, step + 1]) {
    const expected = hotp(secretBase32, candidate);
    if (
      expected.length === normalized.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))
    ) {
      return candidate;
    }
  }
  return null;
}

/** URI otpauth per QR code (issuer + account, formato standard). */
export function otpauthUri(accountEmail: string, secretBase32: string): string {
  const issuer = "Sessa 1930";
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}`;
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS)
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Codice di recupero leggibile: XXXX-XXXX su alfabeto non ambiguo. */
export function generateBackupCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // niente I/L/O/0/1
  const pick = () => alphabet[randomBytes(1)[0]! % alphabet.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `${block()}-${block()}`;
}
