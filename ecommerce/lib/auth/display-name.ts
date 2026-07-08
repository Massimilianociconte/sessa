import "server-only";
import { cookies } from "next/headers";

/**
 * Cookie NON httpOnly col solo nome visualizzato del cliente ("Massimiliano").
 * Serve all'header per mostrare il nome su OGNI pagina senza query al database
 * (il DB sta in un'altra regione: una query in meno = ~100ms in meno a click).
 * Non è un dato di autenticazione: la sessione vera resta nel cookie httpOnly.
 */
export const CUSTOMER_DISPLAY_NAME_COOKIE = "sessa_dn";
const MAX_AGE_S = 30 * 24 * 60 * 60; // allineato alla durata sessione (30 giorni)

export async function setCustomerDisplayNameCookie(firstName: string | null): Promise<void> {
  const cookieStore = await cookies();
  const value = firstName?.trim().slice(0, 40);
  if (!value) {
    cookieStore.delete(CUSTOMER_DISPLAY_NAME_COOKIE);
    return;
  }
  cookieStore.set(CUSTOMER_DISPLAY_NAME_COOKIE, encodeURIComponent(value), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S
  });
}

export async function clearCustomerDisplayNameCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_DISPLAY_NAME_COOKIE);
}

/** Nome visualizzato (server-side, zero DB). Null se assente/anonimo. */
export async function readCustomerDisplayName(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CUSTOMER_DISPLAY_NAME_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded ? decoded.slice(0, 40) : null;
  } catch {
    return null;
  }
}
