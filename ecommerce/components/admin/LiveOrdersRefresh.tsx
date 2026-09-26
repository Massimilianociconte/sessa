"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

function readPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/**
 * Tiene aggiornata la dashboard mentre e aperta in negozio: ricarica i dati
 * ogni minuto e, quando arriva un ordine nuovo, suona, cambia il titolo della
 * scheda e (se autorizzato) mostra una notifica di sistema. Complementare
 * all'email alla sede: il tablet in laboratorio non deve perdere ordini.
 */
export default function LiveOrdersRefresh({ latestOrderCode, intervalMs = 60_000 }: { latestOrderCode: string | null; intervalMs?: number }) {
  const router = useRouter();
  const previous = useRef(latestOrderCode);
  const [permissionVersion, setPermissionVersion] = useState(0);
  const permission = useSyncExternalStore(
    () => () => undefined,
    () => (permissionVersion >= 0 ? readPermission() : "default"),
    () => "default" as const
  );
  const [lastNew, setLastNew] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" || permission === "granted") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [router, intervalMs, permission]);

  useEffect(() => {
    if (!latestOrderCode || latestOrderCode === previous.current) return;
    previous.current = latestOrderCode;
    setLastNew(latestOrderCode);
    document.title = `● Nuovo ordine ${latestOrderCode} — Gestionale`;
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
    } catch {
      // Audio bloccato dal browser finché l'utente non interagisce: resta il titolo.
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Nuovo ordine Sessa", { body: `Ordine ${latestOrderCode}: apri il gestionale per prepararlo.` });
    }
  }, [latestOrderCode]);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink/55" aria-live="polite">
      <span className="inline-flex items-center gap-1">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brilliant" aria-hidden="true" />
        Aggiornamento automatico attivo
      </span>
      {lastNew && <span className="badge bg-terracotta text-ivory">Nuovo ordine {lastNew}</span>}
      {permission === "default" && (
        <button
          type="button"
          className="font-semibold text-terracotta underline"
          onClick={() => Notification.requestPermission().then(() => setPermissionVersion((value) => value + 1))}
        >
          Attiva notifiche nuovi ordini
        </button>
      )}
    </div>
  );
}
