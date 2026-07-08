"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iPadOs = ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document;
  return /iPhone|iPad|iPod/.test(ua) || iPadOs;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Bottone "Installa app" del gestionale.
 * - Android/desktop Chromium: usa il prompt nativo (beforeinstallprompt).
 * - iOS/iPadOS: Safari non ha prompt programmatico → mostra le istruzioni
 *   (Condividi → Aggiungi alla schermata Home).
 * - Già installata (standalone): non rende nulla.
 */
export default function AdminPwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    setVisible(true);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const install = async () => {
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setVisible(false);
      setPrompt(null);
      return;
    }
    setShowIosHint((value) => !value);
  };

  // Senza prompt nativo il bottone ha senso solo su iOS (istruzioni manuali).
  if (!prompt && !isIos()) return null;

  return (
    <div className="admin-pwa-install">
      <button type="button" onClick={install} className="admin-pwa-install-btn">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Installa app
      </button>
      {showIosHint && (
        <p className="admin-pwa-install-hint">
          Su iPhone/iPad: apri questa pagina in <strong>Safari</strong>, tocca{" "}
          <strong>Condividi</strong> e poi <strong>&ldquo;Aggiungi alla schermata Home&rdquo;</strong>.
        </p>
      )}
    </div>
  );
}
