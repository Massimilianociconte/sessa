export const CONSENT_COOKIE = "sessa_consent_v1";
export const CONSENT_EVENT = "sessa:consent-change";
export const OPEN_CONSENT_EVENT = "sessa:open-consent";

export type ConsentPreferences = {
  version: 1;
  analytics: boolean;
  marketing: false;
  updatedAt: string;
};

let cachedRaw: string | null | undefined;
let cachedConsent: ConsentPreferences | null = null;

function rawConsentCookie(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
      ?.slice(CONSENT_COOKIE.length + 1) ?? null
  );
}

export function readConsentCookie(): ConsentPreferences | null {
  const raw = rawConsentCookie();
  if (raw === cachedRaw) return cachedConsent;
  cachedRaw = raw;
  if (!raw) {
    cachedConsent = null;
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentPreferences>;
    if (parsed.version !== 1 || typeof parsed.analytics !== "boolean") return null;
    cachedConsent = {
      version: 1,
      analytics: parsed.analytics,
      marketing: false,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString()
    };
    return cachedConsent;
  } catch {
    cachedConsent = null;
    return null;
  }
}

export function subscribeConsent(listener: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, listener);
  return () => window.removeEventListener(CONSENT_EVENT, listener);
}

export function getServerConsentSnapshot(): null {
  return null;
}

export function persistConsent(analytics: boolean): ConsentPreferences {
  const consent: ConsentPreferences = {
    version: 1,
    analytics,
    marketing: false,
    updatedAt: new Date().toISOString()
  };
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`;
  cachedRaw = undefined;
  window.dispatchEvent(new Event(CONSENT_EVENT));
  return consent;
}
