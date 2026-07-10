import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAuthSecret } from "@/lib/auth/secret";

/**
 * Cookie di sola presentazione col nome visualizzato del cliente.
 * È leggibile dal client per mantenere cacheabili home e catalogo senza una
 * richiesta sessione per ogni Header. Non concede mai accesso: autenticazione e
 * autorizzazione usano esclusivamente la sessione httpOnly verificata a DB.
 * La firma serve alle eventuali letture server, mentre la UI tratta il payload
 * soltanto come testo non attendibile.
 */
export const CUSTOMER_DISPLAY_NAME_COOKIE = "sessa_dn";
const MAX_AGE_S = 30 * 24 * 60 * 60; // allineato alla durata sessione (30 giorni)

function sign(value: string): string {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

export async function setCustomerDisplayNameCookie(firstName: string | null): Promise<void> {
  const cookieStore = await cookies();
  const value = firstName?.trim().slice(0, 40);
  if (!value) {
    cookieStore.delete(CUSTOMER_DISPLAY_NAME_COOKIE);
    return;
  }
  const payload = Buffer.from(value, "utf8").toString("base64url");
  cookieStore.set(CUSTOMER_DISPLAY_NAME_COOKIE, `${payload}.${sign(payload)}`, {
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
    const dot = raw.lastIndexOf(".");
    if (dot < 1) return null;
    const payload = raw.slice(0, dot);
    const provided = Buffer.from(raw.slice(dot + 1));
    const expected = Buffer.from(sign(payload));
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const decoded = Buffer.from(payload, "base64url").toString("utf8").trim();
    return decoded ? decoded.slice(0, 40) : null;
  } catch {
    return null;
  }
}
