const DEVELOPMENT_SECRET = "sessa-development-only-secret-change-me";

/**
 * Segreto condiviso per firme/HMAC applicative. In produzione non esiste un
 * fallback noto: una configurazione incompleta deve fallire chiusa.
 */
export function getAuthSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Configurazione di sicurezza incompleta: SESSION_SECRET non valido.");
  }
  return configured || DEVELOPMENT_SECRET;
}
