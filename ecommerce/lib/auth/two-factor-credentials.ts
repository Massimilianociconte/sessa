import { createHash, createHmac } from "node:crypto";
import { getAuthSecret } from "@/lib/auth/secret";

export const BACKUP_CODES_COUNT = 10;

function normalizedBackupCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, "");
}

export function hashBackupCode(code: string): string {
  return createHmac("sha256", getAuthSecret()).update(normalizedBackupCode(code)).digest("hex");
}

/** Read-only compatibility for recovery codes created before HMAC hardening. */
export function legacyBackupCodeHash(code: string): string {
  return createHash("sha256").update(normalizedBackupCode(code)).digest("hex");
}
