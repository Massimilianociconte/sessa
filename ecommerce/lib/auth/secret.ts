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

/** Segreto precedente durante una rotazione (SESSION_SECRET_PREVIOUS), se valido. */
export function getPreviousAuthSecret(): string | null {
  const previous = process.env.SESSION_SECRET_PREVIOUS?.trim();
  return previous && previous.length >= 32 && previous !== getAuthSecret() ? previous : null;
}

/**
 * Keyring per VERIFICARE o DECIFRARE: corrente e, durante una rotazione, il
 * precedente. Firme e cifrature nuove usano sempre e solo il corrente.
 * Senza keyring la rotazione del segreto rendeva illeggibili i segreti TOTP
 * e invalidi i codici di recupero: blocco totale degli accessi 2FA.
 */
export function getAuthSecretsForVerification(): string[] {
  const previous = getPreviousAuthSecret();
  return previous ? [getAuthSecret(), previous] : [getAuthSecret()];
}
