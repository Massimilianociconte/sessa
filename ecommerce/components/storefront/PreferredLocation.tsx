"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Sede preferita senza sessione lato server: la home resta statica e
 * servibile dalla CDN, il suggerimento compare solo nel browser.
 * Cookie non di tracciamento (preferenza tecnica, nessun dato personale).
 */
const COOKIE = "sessa_loc";

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  const value = match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : "";
  return /^[a-z0-9-]{1,60}\|.{1,80}$/.test(value) ? value : null;
}

/** Da montare nelle pagine sede: ricorda l'ultima sede visitata. */
export function RememberLocation({ slug, name }: { slug: string; name: string }) {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE}=${encodeURIComponent(`${slug}|${name.slice(0, 80)}`)}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`;
  }, [slug, name]);
  return null;
}

/** Suggerimento in home per tornare all'ultima sede. */
export function PreferredLocationHint() {
  const value = useSyncExternalStore(
    () => () => undefined,
    readCookie,
    () => null
  );
  if (!value) return null;
  const [slug, name] = value.split("|");
  return (
    <p className="mb-4 rounded-2xl border border-terracotta/20 bg-white/70 px-4 py-3 text-sm text-ink/70">
      Bentornato! L&apos;ultima volta hai scelto <strong>{name}</strong>.{" "}
      <Link href={`/sede/${slug}`} className="font-semibold text-terracotta hover:underline">
        Apri il catalogo →
      </Link>
    </p>
  );
}
