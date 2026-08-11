export type ProductFunnelEvent =
  | "landing_gamification_view"
  | "landing_about_view"
  | "landing_shop_cta"
  | "cart_item_added"
  | "cart_reached_minimum"
  | "dashboard_qr_instruction_view"
  | "postcard_registered";

interface AnalyticsEvent {
  name: ProductFunnelEvent;
  at: string;
  path: string;
  metadata?: Record<string, string | number | boolean>;
}

const STORAGE_KEY = "podrozowka_funnel_events";

/** Privacy-safe local funnel log. It stores no identity or order data. */
export const trackEvent = (name: ProductFunnelEvent, metadata?: AnalyticsEvent["metadata"]) => {
  if (typeof window === "undefined") return;
  const event: AnalyticsEvent = { name, at: new Date().toISOString(), path: window.location.pathname, metadata };
  try {
    const current = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    const events = Array.isArray(current) ? current.slice(-199) : [];
    events.push(event);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Analytics must never interrupt shopping or registration.
  }
};
