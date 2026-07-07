export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
  location_id?: string;
  location_name?: string;
};

export type EcommerceEventPayload = {
  currency?: "EUR";
  value?: number;
  item_list_id?: string;
  item_list_name?: string;
  location_id?: string;
  location_name?: string;
  search_term?: string;
  filter_name?: string;
  payment_type?: string;
  coupon?: string;
  items?: AnalyticsItem[];
  [key: string]: unknown;
};

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
    sessaAnalyticsQueue?: Array<Record<string, unknown>>;
  }
}

export function centsToAnalyticsValue(cents: number): number {
  return Math.round(cents) / 100;
}

export function trackEcommerceEvent(event: string, payload: EcommerceEventPayload = {}): void {
  if (typeof window === "undefined") return;
  const normalized = { currency: "EUR", ...payload };
  const entry = { event, ecommerce: normalized, timestamp: new Date().toISOString() };
  window.sessaAnalyticsQueue = [...(window.sessaAnalyticsQueue ?? []), entry].slice(-50);
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ event, ecommerce: normalized });
  window.gtag?.("event", event, normalized);
}
