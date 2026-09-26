"use client";

import { useEffect, useRef } from "react";
import { trackEcommerceEvent, type EcommerceEventPayload } from "@/lib/analytics";

/**
 * Invia un evento analytics al montaggio. Con `onceKey` l'evento parte una sola
 * volta per browser (es. "purchase" per ordine): ricaricare la pagina ordine o
 * riaprire il link dell'email non gonfia più il fatturato in Analytics.
 */
export default function AnalyticsBeacon({
  event,
  payload,
  onceKey
}: {
  event: string;
  payload: EcommerceEventPayload;
  onceKey?: string;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (onceKey) {
      const storageKey = `sessa_evt_${event}_${onceKey}`;
      try {
        if (window.localStorage.getItem(storageKey)) return;
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // Storage non disponibile: si invia comunque una volta per montaggio.
      }
    }
    trackEcommerceEvent(event, payload);
  }, [event, payload, onceKey]);

  return null;
}
