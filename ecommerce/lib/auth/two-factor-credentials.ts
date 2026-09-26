import { createHash, createHmac } from "node:crypto";
import { getAuthSecret, getAuthSecretsForVerification } from "@/lib/auth/secret";

export const BACKUP_CODES_COUNT = 10;

function normalizedBackupCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, "");
}

export function hashBackupCode(code: string): string {
  return createHmac("sha256", getAuthSecret()).update(normalizedBackupCode(code)).digest("hex");
}

/**
 * Hash accettati in verifica: segreto corrente, precedente (rotazione in
 * corso) e SHA-256 legacy. Il codice usato viene ri-hashato col corrente.
 */
export function backupCodeHashCandidates(code: string): string[] {
  const normalized = normalizedBackupCode(code);
  return [
    ...getAuthSecretsForVerification().map((secret) => createHmac("sha256", secret).update(normalized).digest("hex")),
    legacyBackupCodeHash(code)
  ];
}

/** Read-only compatibility for recovery codes created before HMAC hardening. */
export function legacyBackupCodeHash(code: string): string {
  return createHash("sha256").update(normalizedBackupCode(code)).digest("hex");
}
