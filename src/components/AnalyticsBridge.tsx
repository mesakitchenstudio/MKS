"use client";

import { useEffect } from "react";

type AnalyticsDetail = {
  event?: string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Forwards mesa:analytics CustomEvents to Plausible and/or GA4 when those scripts are present.
 * Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN and/or NEXT_PUBLIC_GA_MEASUREMENT_ID in the environment,
 * and load the corresponding snippet in layout (or via Vercel Analytics / GTM).
 */
export function AnalyticsBridge() {
  useEffect(() => {
    function onEvent(event: Event) {
      const detail = (event as CustomEvent<AnalyticsDetail>).detail;
      if (!detail?.event) return;
      const { event: name, at: _at, ...props } = detail;

      if (typeof window.plausible === "function") {
        window.plausible(name, { props });
      }
      if (typeof window.gtag === "function") {
        window.gtag("event", name, props);
      }
    }

    window.addEventListener("mesa:analytics", onEvent);
    return () => window.removeEventListener("mesa:analytics", onEvent);
  }, []);

  return null;
}
