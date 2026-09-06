"use client";

import { useEffect } from "react";
import { usePrivacyConsentOptional } from "@/components/PrivacyConsentProvider";

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
 * Requires analytics consent — scripts themselves are also consent-gated.
 */
export function AnalyticsBridge() {
  const consent = usePrivacyConsentOptional();

  useEffect(() => {
    if (!consent?.analyticsAllowed) return;

    function onEvent(event: Event) {
      const detail = (event as CustomEvent<AnalyticsDetail>).detail;
      if (!detail?.event) return;
      const { event: name, at: _ignoredAt, ...props } = detail;
      void _ignoredAt;

      if (typeof window.plausible === "function") {
        window.plausible(name, { props });
      }
      if (typeof window.gtag === "function") {
        window.gtag("event", name, props);
      }
    }

    window.addEventListener("mesa:analytics", onEvent);
    return () => window.removeEventListener("mesa:analytics", onEvent);
  }, [consent?.analyticsAllowed]);

  return null;
}
