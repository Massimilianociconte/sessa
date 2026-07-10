"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { centsToAnalyticsValue, trackEcommerceEvent } from "@/lib/analytics";
import type { CartDTO, CartLineDTO } from "@/lib/cart-types";
import { EMPTY_CART } from "@/lib/cart-types";
import { formatCents } from "@/lib/money";
import { notifyCartChanged, onCartChanged, onOpenCart } from "@/components/storefront/cart-events";

type CartLocationContext = {
  slug: string;
  name: string;
};

// Sopravvive alle navigazioni App Router: una lettura carrello per sessione
// client, non una chiamata serverless a ogni Header rimontato. Le funzioni
// tengono la mutazione fuori dal corpo del componente, come richiesto dalle
// regole React sui globali.
let latestCartSnapshot: CartDTO | undefined;

function readLatestCartSnapshot() {
  return latestCartSnapshot;
}

function saveLatestCartSnapshot(nextCart: CartDTO) {
  latestCartSnapshot = nextCart;
}

export default function CartWidget({
  initialCount,
  currentLocation
}: {
  initialCount: number;
  currentLocation?: CartLocationContext;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const trackedCartViewRef = useRef<string | null>(null);
  const cartRef = useRef<CartDTO | null>(readLatestCartSnapshot() ?? null);
  const cartReadVersionRef = useRef(0);
  const activeCartReadRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartDTO | null>(() => readLatestCartSnapshot() ?? null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [mounted, setMounted] = useState(false);

  const count = cart ? cart.itemCount : initialCount;

  useEffect(() => {
    const timeout = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const cancelCartRead = useCallback(() => {
    cartReadVersionRef.current += 1;
    activeCartReadRef.current?.abort();
    activeCartReadRef.current = null;
    setLoading(false);
  }, []);

  const acceptCart = useCallback((nextCart: CartDTO) => {
    cancelCartRead();
    saveLatestCartSnapshot(nextCart);
    cartRef.current = nextCart;
    setCart(nextCart);
    setError(null);
  }, [cancelCartRead]);

  const fetchCart = useCallback(async (silent = false) => {
    const requestId = cartReadVersionRef.current + 1;
    cartReadVersionRef.current = requestId;
    activeCartReadRef.current?.abort();
    const controller = new AbortController();
    activeCartReadRef.current = controller;
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/cart", { cache: "no-store", signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Carrello non disponibile (${res.status})`);
      }
      const nextCart = (await res.json()) as CartDTO;
      if (cartReadVersionRef.current !== requestId) return;
      saveLatestCartSnapshot(nextCart);
      cartRef.current = nextCart;
      setCart(nextCart);
      setError(null);
    } catch (readError) {
      if (readError instanceof DOMException && readError.name === "AbortError") return;
      if (cartReadVersionRef.current !== requestId || silent) return;
      setError(
        cartRef.current
          ? "Non riesco a verificare il carrello: mostro l'ultimo stato disponibile."
          : "Non riesco ad aggiornare il carrello. Riprova tra poco."
      );
    } finally {
      if (cartReadVersionRef.current === requestId) {
        activeCartReadRef.current = null;
        if (!silent) setLoading(false);
      }
    }
  }, []);

  useEffect(() => () => activeCartReadRef.current?.abort(), []);

  useEffect(() => {
    const offOpen = onOpenCart((nextCart) => {
      setOpen(true);
      if (nextCart) acceptCart(nextCart);
      else void fetchCart();
    });
    const offChanged = onCartChanged((nextCart) => {
      if (nextCart) {
        acceptCart(nextCart);
      } else {
        void fetchCart();
      }
    });
    return () => {
      offOpen();
      offChanged();
    };
  }, [acceptCart, fetchCart]);

  useEffect(() => {
    if (cart || readLatestCartSnapshot() !== undefined) return;
    let idle: number | undefined;
    const timeout = window.setTimeout(() => {
      idle = window.requestIdleCallback?.(() => void fetchCart(true), { timeout: 1800 });
      if (idle === undefined) void fetchCart(true);
    }, 2500);
    return () => {
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      window.clearTimeout(timeout);
    };
  }, [cart, fetchCart]);

  const closeDrawer = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeDrawer();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.setTimeout(() => {
        const previous = previousFocusRef.current;
        if (
          previous?.isConnected &&
          previous !== document.body &&
          !panel?.contains(previous)
        ) {
          previous.focus();
        } else {
          trigger?.focus();
        }
      }, 0);
    };
  }, [closeDrawer, open]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => closeButtonRef.current?.focus(), 260);
    return () => window.clearTimeout(timeout);
  }, [open]);

  async function mutate(url: string, body: Record<string, unknown>, successMessage = "Carrello aggiornato.") {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    cancelCartRead();
    setBusy(true);
    setError(null);
    setStatusMessage("Aggiorno il carrello.");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const nextCart = (await res.json()) as CartDTO;
        saveLatestCartSnapshot(nextCart);
        cartRef.current = nextCart;
        setCart(nextCart);
        notifyCartChanged(nextCart);
        setStatusMessage(successMessage);
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Non riesco ad aggiornare il carrello.");
        setStatusMessage("Aggiornamento non riuscito.");
      }
    } catch {
      setError("Errore di rete. Controlla la connessione e riprova.");
      setStatusMessage("Errore di rete durante l'aggiornamento del carrello.");
    } finally {
      mutationInFlightRef.current = false;
      setBusy(false);
    }
  }

  function openDrawer() {
    setOpen(true);
    void fetchCart();
  }

  const data = cart ?? EMPTY_CART;
  const payable = Math.max(0, data.subtotalCents - data.discountCents);
  const hasLines = data.lines.length > 0;
  const browsingLocationName = currentLocation?.name ?? null;
  const browsingLocationSlug = currentLocation?.slug ?? null;
  const cartLocationName = hasLines ? data.locationName ?? null : null;
  const cartLocationSlug = hasLines ? data.locationSlug ?? null : null;
  const visibleLocationName = browsingLocationName ?? cartLocationName ?? data.locationName ?? null;
  const visibleLocationSlug = browsingLocationSlug ?? cartLocationSlug ?? data.locationSlug ?? null;
  const hasLocationMismatch = Boolean(
    hasLines &&
    browsingLocationSlug &&
    cartLocationSlug &&
    browsingLocationSlug !== cartLocationSlug
  );
  const isLoadingInitial = loading && !cart;
  const itemLabel = useMemo(() => {
    if (data.itemCount === 1) return "1 pezzo scelto";
    if (data.itemCount > 1) return `${data.itemCount} pezzi scelti`;
    return "Pronto per essere riempito";
  }, [data.itemCount]);

  const analyticsItems = useMemo(
    () =>
      data.lines.map((line) => ({
        item_id: line.productId,
        item_name: line.productName,
        item_variant: line.variantName,
        price: centsToAnalyticsValue(line.unitCents),
        quantity: line.qty,
        location_name: data.locationName ?? undefined
      })),
    [data.lines, data.locationName]
  );

  useEffect(() => {
    if (!open) {
      trackedCartViewRef.current = null;
      return;
    }
    if (!hasLines) return;
    const signature = `${data.itemCount}:${data.subtotalCents}:${data.discountCents}`;
    if (trackedCartViewRef.current === signature) return;
    trackedCartViewRef.current = signature;
    trackEcommerceEvent("view_cart", {
      value: centsToAnalyticsValue(payable),
      coupon: data.discountCode ?? undefined,
      location_name: data.locationName ?? undefined,
      items: analyticsItems
    });
  }, [analyticsItems, data.discountCents, data.discountCode, data.itemCount, data.locationName, data.subtotalCents, hasLines, open, payable]);

  function removeLine(line: CartLineDTO) {
    if (mutationInFlightRef.current) return;
    trackEcommerceEvent("remove_from_cart", {
      value: centsToAnalyticsValue(line.totalCents),
      location_name: data.locationName ?? undefined,
      items: [
        {
          item_id: line.productId,
          item_name: line.productName,
          item_variant: line.variantName,
          price: centsToAnalyticsValue(line.unitCents),
          quantity: line.qty,
          location_name: data.locationName ?? undefined
        }
      ]
    });
    void mutate("/api/cart/remove", { itemId: line.itemId }, `${line.productName} rimosso dal carrello.`);
  }

  const drawer = (
    <div
      className={`cart-overlay fixed inset-0 z-[60] ${open ? "cart-overlay-open" : ""}`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="cart-overlay-backdrop absolute inset-0" onClick={closeDrawer} />

      <aside
        ref={panelRef}
        className={`cart-drawer-panel absolute right-0 top-0 flex h-full w-full max-w-[470px] flex-col overflow-hidden ${
          open ? "cart-drawer-panel-open" : ""
        }`}
        aria-busy={busy || loading}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        aria-describedby="cart-drawer-description"
        tabIndex={-1}
      >
        <header className="cart-drawer-header relative px-5 pb-5 pt-5 text-ivory sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-cream/75">Sessa 1930</p>
              <p id="cart-drawer-title" className="mt-1 font-script text-4xl leading-none sm:text-5xl">Il tuo carrello</p>
              <p id="cart-drawer-description" className="mt-2 max-w-[18rem] text-sm font-medium text-cream/85">
                {hasLocationMismatch
                  ? `Stai visitando ${browsingLocationName}; il carrello contiene prodotti da ${cartLocationName}.`
                  : visibleLocationName
                    ? `Stai sfogliando il catalogo di ${visibleLocationName}.`
                    : "Scegli una sede e componi il tuo vassoio."}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              aria-label="Chiudi"
              className="cart-icon-button shrink-0 border-cream/45 text-cream/90 hover:bg-white hover:text-terracotta"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="drawer-stat">
              <span>Selezione</span>
              <strong>{itemLabel}</strong>
            </div>
            <div className="drawer-stat">
              <span>Stai visitando</span>
              <strong>{browsingLocationName ?? "Sedi Sessa"}</strong>
            </div>
            <div className="drawer-stat">
              <span>Carrello</span>
              <strong>{cartLocationName ?? visibleLocationName ?? "Da riempire"}</strong>
            </div>
          </div>
        </header>

        <div className="cart-drawer-body flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <p className="sr-only" aria-live="polite">
            {statusMessage}
          </p>
          {error && (
            <p className="mb-4 rounded-2xl border border-terracotta/15 bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">
              {error}
            </p>
          )}

          {isLoadingInitial ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="cart-line-card animate-pulse">
                  <div className="h-[86px] w-[86px] shrink-0 rounded-2xl bg-cream" />
                  <div className="flex flex-1 flex-col justify-between py-1">
                    <div className="space-y-2">
                      <div className="h-4 w-2/3 rounded-full bg-ink/10" />
                      <div className="h-3 w-1/2 rounded-full bg-ink/10" />
                    </div>
                    <div className="h-8 w-full rounded-full bg-ink/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasLines ? (
            <div className="cart-empty-state flex min-h-full flex-col items-center justify-center gap-5 px-4 py-8 text-center">
              <span
                className="cart-empty-medallion grid h-28 w-28 place-items-center rounded-full text-terracotta"
                aria-hidden="true"
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19L6 8Zm3 0V6a3 3 0 0 1 6 0v2"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M9 12h6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <p className="font-serif text-2xl font-semibold text-ink">Il carrello aspetta il primo dolce</p>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-ink/60">
                  {visibleLocationName
                    ? `Aggiungi sfogliatelle, colazioni o box regalo dal catalogo di ${visibleLocationName}.`
                    : "Parti da una sede, scegli sfogliatelle, colazioni o box regalo e ritroverai tutto qui."}
                </p>
              </div>
              <Link href={visibleLocationSlug ? `/sede/${visibleLocationSlug}` : "/"} onClick={closeDrawer} className="btn-primary">
                {visibleLocationSlug ? "Continua in questa sede" : "Scopri le sedi"}
              </Link>
            </div>
          ) : (
            <>
              <div className="cart-care-note mb-4 rounded-2xl px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
                  {hasLocationMismatch ? "Carrello salvato in un'altra sede" : "Cornice Sessa"}
                </p>
                <p className="mt-1 text-sm text-ink/65">
                  {hasLocationMismatch
                    ? `Ora stai visitando ${browsingLocationName}, ma questi prodotti sono nel carrello di ${cartLocationName}. Checkout, prezzi e stock seguiranno quella sede.`
                    : `Prodotti nel carrello di ${cartLocationName ?? "Sessa"}. Ritiro e consegna si definiscono nel checkout.`}
                </p>
              </div>

              <ul className="space-y-3.5">
                {data.lines.map((line) => (
                  <li key={line.itemId} className="cart-line-card group">
                    <Link
                      href={`/sede/${data.locationSlug}/prodotti/${line.productSlug}`}
                      onClick={closeDrawer}
                      className="tile-frame cart-line-image grid h-[88px] w-[88px] shrink-0 place-items-center rounded-2xl"
                      style={{ ["--tile" as string]: 'url("/patterns/sessa-maiolica-orange.png")' }}
                    >
                      {line.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={line.image}
                          alt={line.productName}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-contain transition duration-500 group-hover:scale-105"
                        />
                      )}
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col py-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/sede/${data.locationSlug}/prodotti/${line.productSlug}`}
                            onClick={closeDrawer}
                            className="line-clamp-2 font-serif text-[18px] font-semibold leading-tight text-ink transition hover:text-terracotta"
                          >
                            {line.productName}
                          </Link>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
                            {line.variantName}
                          </p>
                          {hasLocationMismatch && (
                            <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-terracotta">
                              Salvato per {cartLocationName}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeLine(line)}
                          aria-label={`Rimuovi ${line.productName}`}
                          className="cart-icon-button cart-icon-button-muted shrink-0 disabled:opacity-40"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7m-6 0 .7 12A1.5 1.5 0 0 0 10.2 20h3.6a1.5 1.5 0 0 0 1.5-1.4L16 7"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                        <div className="cart-qty-control inline-flex items-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => mutate("/api/cart/update", { itemId: line.itemId, qty: line.qty - 1 }, `Quantità di ${line.productName} aggiornata.`)}
                            className="grid h-8 w-8 place-items-center rounded-full text-base text-ink/60 transition hover:bg-white hover:text-terracotta disabled:opacity-40"
                            aria-label={`Diminuisci quantità di ${line.productName}`}
                          >
                            -
                          </button>
                          <span className="min-w-7 text-center text-sm font-extrabold">{line.qty}</span>
                          <button
                            type="button"
                            disabled={busy || line.qty >= line.maxQty}
                            onClick={() => mutate("/api/cart/update", { itemId: line.itemId, qty: line.qty + 1 }, `Quantità di ${line.productName} aggiornata.`)}
                            className="grid h-8 w-8 place-items-center rounded-full text-base text-ink/60 transition hover:bg-white hover:text-terracotta disabled:opacity-40"
                            aria-label={`Aumenta quantità di ${line.productName}`}
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <span className="block font-serif text-lg font-bold leading-none text-terracotta">
                            {formatCents(line.totalCents)}
                          </span>
                          <span className="text-[11px] font-medium text-ink/40">
                            {formatCents(line.unitCents)} cad.
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {hasLines && (
          <footer className="cart-drawer-footer border-t border-ink/10 px-5 pb-5 pt-4 sm:px-6">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink/60">Subtotale</span>
                <span className="font-semibold">{formatCents(data.subtotalCents)}</span>
              </div>
              {data.discountCents > 0 && (
                <div className="flex justify-between font-semibold text-brilliant">
                  <span>Sconto {data.discountCode}</span>
                  <span>-{formatCents(data.discountCents)}</span>
                </div>
              )}
              {data.giftCardCode && (
                <div className="flex justify-between font-semibold text-ceramic">
                  <span>Gift card {data.giftCardCode}</span>
                  <span>saldo {formatCents(data.giftCardBalanceCents)}</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-ink/10 pt-4">
              <span className="font-serif text-lg font-semibold">Totale parziale</span>
              <span className="font-serif text-3xl font-bold text-terracotta">{formatCents(payable)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
              <span className="cart-footer-chip">IVA inclusa</span>
              <span className="cart-footer-chip">{cartLocationName ?? "Ritiro o consegna"}</span>
            </div>

            <div className="mt-4 grid grid-cols-[0.9fr_1.35fr] gap-3">
              <Link href="/carrello" onClick={closeDrawer} className="btn-secondary !px-3">
                Dettagli
              </Link>
              <Link href="/checkout" onClick={closeDrawer} className="btn-primary">
                Checkout
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12h14m-5-5 5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </div>
          </footer>
        )}
      </aside>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDrawer}
        aria-label={`Apri il carrello${count > 0 ? `, ${count} articoli` : ""}`}
        className="cart-trigger group relative inline-flex min-h-10 items-center gap-2 rounded-full bg-cream/95 px-4 py-1.5 text-sm font-semibold text-terracotta transition hover:bg-white"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="relative opacity-85" aria-hidden="true">
          <path
            d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19L6 8Zm3 0V6a3 3 0 0 1 6 0v2"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="relative hidden sm:inline">Carrello</span>
        {count > 0 && (
          <span className="cart-trigger-count relative inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-terracotta px-1.5 text-xs font-bold text-ivory">
            {count}
          </span>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {count > 0 ? `${count} articoli nel carrello` : "Carrello vuoto"}
      </span>

      {mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
