"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isTrackablePath, sanitizedPageLocation } from "@/lib/analytics-location";
import {
  getServerConsentSnapshot,
  OPEN_CONSENT_EVENT,
  persistConsent,
  readConsentCookie,
  subscribeConsent
} from "@/lib/consent";

export default function AnalyticsConsent({ gaId }: { gaId?: string }) {
  const pathname = usePathname();
  const consent = useSyncExternalStore(subscribeConsent, readConsentCookie, getServerConsentSnapshot);
  const ready = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analyticsDraft, setAnalyticsDraft] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const openPreferences = () => {
      const current = readConsentCookie();
      setAnalyticsDraft(current?.analytics ?? false);
      setPreferencesOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, openPreferences);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, openPreferences);
  }, []);

  useEffect(() => {
    window.sessaAnalyticsConsent = consent?.analytics === true;
    window.gtag?.("consent", "update", {
      analytics_storage: consent?.analytics ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
  }, [consent]);

  // Page view manuali con URL ripulito: la configurazione GA non invia page view
  // automatiche (che includerebbero query string con token di ordini e reset).
  useEffect(() => {
    if (!consent?.analytics || !gaId || !isTrackablePath(pathname)) return;
    const location = sanitizedPageLocation(window.location.href);
    const send = () =>
      window.gtag?.("event", "page_view", { page_location: location, page_path: pathname, page_title: document.title });
    if (window.gtag) send();
    else {
      const timer = window.setTimeout(send, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [pathname, consent?.analytics, gaId]);

  useEffect(() => {
    if (!preferencesOpen) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreferencesOpen(false);
      if (event.key !== "Tab") return;
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [preferencesOpen]);

  function save(analytics: boolean) {
    const next = persistConsent(analytics);
    setAnalyticsDraft(next.analytics);
    setPreferencesOpen(false);
  }

  if (pathname.startsWith("/admin")) return null;

  return (
    <>
      {gaId && consent?.analytics ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="sessa-ga4-consented" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('consent', 'default', {
                analytics_storage: 'granted',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied'
              });
              gtag('js', new Date());
              gtag('config', '${gaId}', {
                send_page_view: false,
                allow_google_signals: false,
                page_location: window.location.origin + window.location.pathname
              });
            `}
          </Script>
        </>
      ) : null}

      {ready && !consent && !preferencesOpen ? (
        <section className="cookie-banner" aria-label="Preferenze cookie" role="region">
          <div>
            <p className="cookie-kicker">La tua privacy, con chiarezza</p>
            <h2>Un assaggio, non un inseguimento.</h2>
            <p>
              Usiamo cookie tecnici per far funzionare account, carrello e checkout. Gli analytics facoltativi ci
              aiutano a migliorare lo shop solo con il tuo consenso.{" "}
              <a href="/cookie" className="underline">Cookie policy</a>
            </p>
          </div>
          <div className="cookie-actions">
            <button type="button" className="btn-primary" onClick={() => save(true)}>
              Accetta analytics
            </button>
            <button type="button" className="btn-secondary" onClick={() => save(false)}>
              Solo necessari
            </button>
            <button type="button" className="cookie-text-button" onClick={() => setPreferencesOpen(true)}>
              Personalizza
            </button>
          </div>
        </section>
      ) : null}

      {preferencesOpen ? (
        <div className="cookie-modal-backdrop" role="presentation" onMouseDown={() => setPreferencesOpen(false)}>
          <section
            ref={modalRef}
            className="cookie-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cookie-preferences-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="cookie-modal-close"
              aria-label="Chiudi preferenze cookie"
              onClick={() => setPreferencesOpen(false)}
            >
              ×
            </button>
            <p className="cookie-kicker">Centro preferenze</p>
            <h2 id="cookie-preferences-title">Scegli cosa condividere</h2>
            <div className="cookie-choice-list">
              <div className="cookie-choice">
                <div>
                  <strong>Cookie necessari</strong>
                  <span>Sessione, sicurezza, carrello e checkout. Sempre attivi.</span>
                </div>
                <span className="cookie-required">Necessari</span>
              </div>
              <label className="cookie-choice">
                <span>
                  <strong>Analytics</strong>
                  <span>Misurazione aggregata di navigazione e funnel tramite Google Analytics.</span>
                </span>
                <input
                  type="checkbox"
                  checked={analyticsDraft}
                  onChange={(event) => setAnalyticsDraft(event.target.checked)}
                />
              </label>
              <div className="cookie-choice is-disabled">
                <div>
                  <strong>Marketing</strong>
                  <span>Nessun pixel pubblicitario e attualmente attivo.</span>
                </div>
                <span className="cookie-required">Non usati</span>
              </div>
            </div>
            <div className="cookie-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => save(false)}>
                Rifiuta facoltativi
              </button>
              <button type="button" className="btn-primary" onClick={() => save(analyticsDraft)}>
                Salva preferenze
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
