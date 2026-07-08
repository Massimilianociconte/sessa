"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AddToCartForm from "@/components/storefront/AddToCartForm";
import { centsToAnalyticsValue, trackEcommerceEvent } from "@/lib/analytics";
import { formatCents } from "@/lib/money";
import type { StoreProductView } from "@/lib/services/catalog";

type ProductQuickAddButtonProps = {
  product: StoreProductView;
  locationId: string;
  locationName: string;
  productUrl: string;
  tile: string;
};

export default function ProductQuickAddButton({
  product,
  locationId,
  locationName,
  productUrl,
  tile
}: ProductQuickAddButtonProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const availableVariants = useMemo(() => product.variants.filter((variant) => variant.stockQty > 0), [product.variants]);
  const soldOut = availableVariants.length === 0;
  const priceLabel =
    product.priceMin === product.priceMax
      ? formatCents(product.priceMin)
      : `${formatCents(product.priceMin)} - ${formatCents(product.priceMax)}`;

  useEffect(() => {
    const mountTimer = window.setTimeout(() => setMounted(true), 0);
    return () => {
      window.clearTimeout(mountTimer);
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    setClosing(true);
    closeTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimeoutRef.current = null;
    }, 180);
  }, []);

  function openModal() {
    if (soldOut) return;
    setClosing(false);
    setOpen(true);
    trackEcommerceEvent("view_quick_add", {
      value: centsToAnalyticsValue(product.priceMin),
      location_id: locationId,
      location_name: locationName,
      items: [
        {
          item_id: product.id,
          item_name: product.name,
          item_category: product.category?.name,
          price: centsToAnalyticsValue(product.priceMin),
          location_id: locationId,
          location_name: locationName
        }
      ]
    });
  }

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusClose = window.setTimeout(() => closeButtonRef.current?.focus(), 90);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusClose);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      window.setTimeout(() => {
        const previous = previousFocusRef.current;
        if (previous?.isConnected && previous !== document.body && !panel?.contains(previous)) {
          previous.focus();
        } else {
          trigger?.focus();
        }
      }, 0);
    };
  }, [open, requestClose]);

  const dialog = (
    <div className={`quick-add-overlay ${closing ? "quick-add-overlay-closing" : ""}`} aria-hidden={closing}>
      <button type="button" className="quick-add-backdrop" aria-label="Chiudi aggiunta rapida" onClick={requestClose} />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`quick-add-title-${product.id}`}
        aria-describedby={`quick-add-description-${product.id}`}
        tabIndex={-1}
        className={`quick-add-panel ${closing ? "quick-add-panel-closing" : ""}`}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={requestClose}
          aria-label="Chiudi"
          className="cart-icon-button absolute right-4 top-4 z-10 border-ink/10 bg-white/80 text-ink/55 hover:bg-terracotta hover:text-ivory"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="quick-add-media">
          <div className="tile-frame quick-add-image" style={{ ["--tile" as string]: tile }}>
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt={product.name} loading="lazy" decoding="async" className="h-full w-full object-contain" />
            ) : (
              <span className="font-script text-6xl text-terracotta/40">Sessa</span>
            )}
          </div>
        </div>

        <div className="quick-add-content">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-terracotta">Aggiunta rapida</p>
          <h2 id={`quick-add-title-${product.id}`} className="mt-2 font-serif text-3xl font-semibold leading-tight text-ink sm:text-4xl">
            {product.name}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {product.category && <span className="badge bg-majolica/25 text-ink/70">{product.category.name}</span>}
            <span className="badge bg-brilliant/12 text-emerald-800">Stock {locationName}</span>
            <span className="font-serif text-2xl font-semibold text-terracotta">{priceLabel}</span>
          </div>
          <p id={`quick-add-description-${product.id}`} className="mt-4 text-sm leading-6 text-ink/65">
            {product.shortDescription ?? product.description}
          </p>

          <div className="quick-add-trust mt-4" aria-label="Dettagli di acquisto">
            <span>
              <strong>Fresco</strong>
              Preparato per la fascia scelta
            </span>
            <span>
              <strong>Sede</strong>
              Disponibile a {locationName}
            </span>
            <span>
              <strong>Regalo</strong>
              Note e dedica in checkout
            </span>
          </div>

          {(product.ingredients || product.allergens) && (
            <div className="quick-add-notes mt-4 grid gap-2 text-sm">
              {product.ingredients && (
                <p>
                  <span className="font-semibold text-ink">Ingredienti:</span> {product.ingredients}
                </p>
              )}
              {product.allergens && (
                <p>
                  <span className="font-semibold text-terracotta">Allergeni:</span> {product.allergens}
                </p>
              )}
            </div>
          )}

          <AddToCartForm
            locationId={locationId}
            variants={product.variants.map((variant) => ({
              storeVariantId: variant.storeVariantId,
              name: variant.name,
              priceCents: variant.priceCents,
              stockQty: variant.stockQty,
              lowStockThreshold: variant.lowStockThreshold
            }))}
            analytics={{
              productId: product.id,
              productName: product.name,
              category: product.category?.name,
              locationName
            }}
            className="mt-5 space-y-5"
            stickySubmit
            openDrawerOnAdded={false}
            onAdded={requestClose}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 pt-4">
            <p className="text-xs leading-5 text-ink/45">Resti nel catalogo della sede: puoi continuare ad aggiungere altri prodotti senza tornare indietro.</p>
            <Link href={productUrl} onClick={requestClose} className="btn-ghost !px-0 text-sm">
              Scheda completa
            </Link>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={soldOut}
        onClick={openModal}
        className="quick-add-trigger inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition focus:outline-none focus:ring-2 focus:ring-terracotta focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={soldOut ? `${product.name} esaurito` : `Aggiungi rapidamente ${product.name}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19L6 8Zm3 0V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 11v5m-2.5-2.5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {soldOut ? "Esaurito" : "Aggiungi"}
      </button>

      {mounted && open ? createPortal(dialog, document.body) : null}
    </>
  );
}
