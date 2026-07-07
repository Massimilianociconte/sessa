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

    let cancelled = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) return;
        await registration.update().catch(() => undefined);
      } catch (error) {
        console.error("Registrazione service worker fallita:", error);
      }
    };

    const idleWindow = window as IdleWindow;
    if (typeof idleWindow.requestIdleCallback === "function" && typeof idleWindow.cancelIdleCallback === "function") {
      const idleId = idleWindow.requestIdleCallback(() => void register(), { timeout: 2200 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timeout = globalThis.setTimeout(() => void register(), 900);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeout);
    };
  }, []);

  return null;
}
