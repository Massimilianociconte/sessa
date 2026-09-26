import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret, getAuthSecretsForVerification } from "@/lib/auth/secret";

/**
 * Link firmati senza stato (es. disiscrizione marketing): chi riceve l'email
 * può agire sul proprio consenso senza login, nessun altro può farlo per lui.
 */
function signature(purpose: string, subject: string, secret: string): string {
  return createHmac("sha256", secret).update(`sessa-link:${purpose}:${subject}`).digest("base64url");
}

export function signLink(purpose: string, subject: string): string {
  return signature(purpose, subject, getAuthSecret());
}

export function verifyLink(purpose: string, subject: string, provided: string): boolean {
  const given = Buffer.from(provided);
  return getAuthSecretsForVerification().some((secret) => {
    const expected = Buffer.from(signature(purpose, subject, secret));
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
