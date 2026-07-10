"use client";

import { useEffect } from "react";

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      const cleanLocalWorkerState = async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));

          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((key) => key.startsWith("sessa-shop-")).map((key) => caches.delete(key)));
          }
        } catch {
          // In sviluppo la pulizia e' best-effort: non deve bloccare il rendering locale.
        }
      };

      void cleanLocalWorkerState();
      return;
    }

    let cancelled = false;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        if (cancelled) return;
        console.error("Registrazione service worker fallita:", error);
      }
    };

    const idleWindow = window as IdleWindow;
    let idleId: number | undefined;
    const timeout = globalThis.setTimeout(() => {
      if (typeof idleWindow.requestIdleCallback === "function") {
        idleId = idleWindow.requestIdleCallback(() => void register(), { timeout: 1800 });
      } else {
        void register();
      }
    }, 2000);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeout);
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
    };
  }, []);

  return null;
}
