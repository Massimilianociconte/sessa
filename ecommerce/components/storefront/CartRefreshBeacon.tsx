"use client";

import { useEffect } from "react";
import { notifyCartChanged } from "@/components/storefront/cart-events";

/**
 * Il checkout elimina il cookie cart in una Server Action. Una navigazione App
 * Router può però conservare lo snapshot client del vecchio drawer: chiediamo
 * una rilettura autoritativa quando si apre una pagina ordine.
 */
export default function CartRefreshBeacon() {
  useEffect(() => {
    const timeout = window.setTimeout(() => notifyCartChanged(), 0);
    return () => window.clearTimeout(timeout);
  }, []);
  return null;
}
