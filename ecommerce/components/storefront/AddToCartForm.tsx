"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { centsToAnalyticsValue, trackEcommerceEvent } from "@/lib/analytics";
import type { CartDTO } from "@/lib/cart-types";
import { formatCents } from "@/lib/money";
import { notifyCartChanged, openCart } from "@/components/storefront/cart-events";

export type AddVariant = {
  storeVariantId: string;
  name: string;
  priceCents: number;
  stockQty: number;
  lowStockThreshold: number;
};

export default function AddToCartForm({
  locationId,
  variants,
  analytics,
  className = "mt-8 space-y-6",
  submitLabel = "Aggiungi al carrello",
  busyLabel = "Aggiungo…",
  stickySubmit = false,
  openDrawerOnAdded = true,
  onAdded
}: {
  locationId: string;
  variants: AddVariant[];
  analytics: {
    productId: string;
    productName: string;
    category?: string;
    locationName: string;
  };
  className?: string;
  submitLabel?: string;
  busyLabel?: string;
  stickySubmit?: boolean;
  openDrawerOnAdded?: boolean;
  onAdded?: () => void;
}) {
  const firstAvailable = variants.find((v) => v.stockQty > 0);
  const [selected, setSelected] = useState(firstAvailable?.storeVariantId ?? "");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedVariant = variants.find((v) => v.storeVariantId === selected);
  const maxQty = Math.max(1, selectedVariant?.stockQty ?? 1);
  const safeQty = Math.min(Math.max(1, qty), maxQty);

  function clampQty(value: number) {
    return Math.max(1, Math.min(maxQty, value || 1));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationId, storeVariantId: selected, qty: safeQty })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Impossibile aggiungere il prodotto.");
        return;
      }
      const nextCart = (await res.json().catch(() => null)) as CartDTO | null;
      const variant = variants.find((v) => v.storeVariantId === selected);
      if (variant) {
        trackEcommerceEvent("add_to_cart", {
          value: centsToAnalyticsValue(variant.priceCents * safeQty),
          location_id: locationId,
          location_name: analytics.locationName,
          items: [
            {
              item_id: analytics.productId,
              item_name: analytics.productName,
              item_category: analytics.category,
              item_variant: variant.name,
              price: centsToAnalyticsValue(variant.priceCents),
              quantity: safeQty,
              location_id: locationId,
              location_name: analytics.locationName
            }
          ]
        });
      }
      notifyCartChanged(nextCart ?? undefined);
      if (openDrawerOnAdded) openCart(nextCart ?? undefined);
      onAdded?.();
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={className}>
      <fieldset>
        <legend className="label-field">Scegli la variante</legend>
        <div className="space-y-2">
          {variants.map((variant) => {
            const soldOut = variant.stockQty <= 0;
            return (
              <label
                key={variant.storeVariantId}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                  soldOut
                    ? "cursor-not-allowed border-ink/10 bg-ink/5 text-ink/40"
                    : selected === variant.storeVariantId
                      ? "border-terracotta bg-white"
                      : "border-ink/15 bg-white hover:border-terracotta"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="storeVariantId"
                    value={variant.storeVariantId}
                    checked={selected === variant.storeVariantId}
                    onChange={() => setSelected(variant.storeVariantId)}
                    disabled={soldOut}
                    className="accent-terracotta"
                  />
                  <span className="font-medium">{variant.name}</span>
                  {soldOut && <span className="badge bg-ink/10 text-ink/50">Esaurito</span>}
                  {!soldOut && variant.stockQty <= variant.lowStockThreshold && (
                    <span className="badge bg-majolica/30 text-ink/70">Ultimi {variant.stockQty}</span>
                  )}
                </span>
                <span className="font-bold">{formatCents(variant.priceCents)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p className="rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">{error}</p>
      )}

      <div className={`flex items-end gap-4 ${stickySubmit ? "quick-add-form-footer" : ""}`}>
        <div>
          <label htmlFor="qty" className="label-field">
            Quantità
          </label>
          <input
            id="qty"
            type="number"
            min={1}
            max={maxQty}
            value={safeQty}
            onChange={(e) => setQty(clampQty(Number(e.target.value)))}
            className="input-field w-24"
          />
        </div>
        <button type="submit" disabled={busy || !selected} className="btn-primary flex-1">
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
