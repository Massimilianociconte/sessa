import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAuthSecret, getAuthSecretsForVerification } from "@/lib/auth/secret";

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
 * (refreshEncryptedValue), poi la chiave previous può essere rimossa.
 */

const V1_PREFIX = "enc:v1:";
const V2_PREFIX = "enc:v2:";

function keyFromSecret(version: "v1" | "v2", secret: string): Buffer {
  const domain = version === "v1" ? "" : "sessa-secret-box:v2";
  return createHash("sha256").update(domain ? `${domain}\u0000${secret}` : secret).digest();
}

/** AES-256-GCM envelope used for short-lived secrets stored by the application. */
export function encryptSensitiveValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret("v2", getAuthSecret()), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${V2_PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptWith(key: Buffer, ivValue: string, tagValue: string, ciphertextValue: string): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

function parseEnvelope(stored: string) {
  const [, version, ivValue, tagValue, ciphertextValue] = stored.split(":");
  if ((version !== "v1" && version !== "v2") || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("INVALID_ENCRYPTED_VALUE");
  }
  return { version: version as "v1" | "v2", ivValue, tagValue, ciphertextValue };
}

/**
 * Decifra con il keyring (segreto corrente, poi SESSION_SECRET_PREVIOUS):
 * durante una rotazione i valori cifrati con il vecchio segreto restano
 * leggibili finché non vengono ricifrati. Valori legacy in chiaro passano.
 */
export function decryptSensitiveValue(stored: string): string {
  if (!stored.startsWith(V1_PREFIX) && !stored.startsWith(V2_PREFIX)) return stored;
  const envelope = parseEnvelope(stored);
  let lastError: unknown;
  for (const secret of getAuthSecretsForVerification()) {
    try {
      return decryptWith(keyFromSecret(envelope.version, secret), envelope.ivValue, envelope.tagValue, envelope.ciphertextValue);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("DECRYPT_FAILED");
}

/** true se il valore e già nel formato corrente e cifrato con il segreto corrente. */
export function isCurrentEnvelope(stored: string): boolean {
  if (!stored.startsWith(V2_PREFIX)) return false;
  try {
    const envelope = parseEnvelope(stored);
    decryptWith(keyFromSecret("v2", getAuthSecret()), envelope.ivValue, envelope.tagValue, envelope.ciphertextValue);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ricifra al formato e al segreto correnti un valore legacy (chiaro, v1 o v2
 * con il segreto precedente). Ritorna il valore invariato se già aggiornato.
 */
export function refreshEncryptedValue(stored: string): string {
  if (isCurrentEnvelope(stored)) return stored;
  return encryptSensitiveValue(decryptSensitiveValue(stored));
}

export function isEncryptedSensitiveValue(value: string): boolean {
  return value.startsWith(V1_PREFIX) || value.startsWith(V2_PREFIX);
}
