import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAuthSecret } from "@/lib/auth/secret";

/**
 * Busta AES-256-GCM con versionamento della chiave.
 *
 * - v2 (corrente): chiave derivata dal SESSION_SECRET attuale con dominio
 *   dedicato. Ogni nuova cifratura usa questa versione.
 * - v1 (legacy): chiave derivata dallo stesso segreto senza dominio. Resta
 *   leggibile; se SESSION_SECRET_PREVIOUS e' impostato, si usa quello —
 *   cosi la rotazione del SESSION_SECRET (nuovo valore in SESSION_SECRET,
 *   vecchio in SESSION_SECRET_PREVIOUS) non distrugge i dati cifrati
 *   (segreti TOTP, corpi email in coda).
 *
 * Procedura di rotazione documentata in docs/SECRET_ROTATION_RUNBOOK.md:
 * i valori v1 vengono ri-cifrati in v2 in modo opportunistico dalle letture
 * (refreshEncryptedValue), poi la chiave previous puo essere rimossa.
 */

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";

function keyForVersion(version: "v1" | "v2"): Buffer {
  const secret =
    version === "v1"
      ? process.env.SESSION_SECRET_PREVIOUS?.trim() || getAuthSecret()
      : getAuthSecret();
  const domain = version === "v1" ? "" : "sessa-secret-box:v2";
  return createHash("sha256").update(domain ? `${domain}\u0000${secret}` : secret).digest();
}

/** AES-256-GCM envelope used for short-lived secrets stored by the application. */
export function encryptSensitiveValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyForVersion("v2"), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${V2_PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

/** Legacy plaintext values remain readable and are upgraded on the next write. */
export function decryptSensitiveValue(stored: string): string {
  if (!stored.startsWith(V1_PREFIX) && !stored.startsWith(V2_PREFIX)) return stored;
  const [, version, ivValue, tagValue, ciphertextValue] = stored.split(":");
  if ((version !== "v1" && version !== "v2") || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("INVALID_ENCRYPTED_VALUE");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyForVersion(version),
    Buffer.from(ivValue, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

/**
 * Ri-cifra al formato corrente un valore legacy (plaintext o v1).
 * Ritorna il valore invariato se gia aggiornato: pensato per essere scritto
 * subito dopo una lettura (upgrade opportunistico senza job dedicato).
 */
export function refreshEncryptedValue(stored: string): string {
  if (!stored.startsWith(V1_PREFIX)) return stored;
  return encryptSensitiveValue(decryptSensitiveValue(stored));
}

export function isEncryptedSensitiveValue(value: string): boolean {
  return value.startsWith(V1_PREFIX) || value.startsWith(V2_PREFIX);
}
