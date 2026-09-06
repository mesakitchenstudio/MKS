"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import {
  funnelPayloadFromAnalyticsDetail,
  recordFunnelEvent,
} from "@/lib/funnel-analytics";
import {
  getSharedGuestVisitorKey,
  shouldSkipGuestAnalytics,
} from "@/lib/guest-tracking";

/**
 * Persists website → YouTube funnel events from mesa:analytics CustomEvents.
 * Skips signed-in members and staff (same client rule as GuestTracker).
 * Server also enforces admin-session skip via shouldSkipGuestAnalyticsIngest.
 */
export function FunnelAnalyticsBridge() {
  const { data: session } = useSession();
  const skipRef = useRef(false);

  useEffect(() => {
    skipRef.current = shouldSkipGuestAnalytics({
      email: session?.user?.email,
      staffRole: session?.staffRole,
    });
  }, [session?.user?.email, session?.staffRole]);

  useEffect(() => {
    function onEvent(event: Event) {
      if (skipRef.current) return;
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail?.event) return;
      const payload = funnelPayloadFromAnalyticsDetail(detail);
      if (!payload) return;

      void getSharedGuestVisitorKey()
        .then((clientVisitorKey) => {
          recordFunnelEvent({ ...payload, clientVisitorKey });
        })
        .catch(() => {
          recordFunnelEvent(payload);
        });
    }

    window.addEventListener("mesa:analytics", onEvent);
    return () => window.removeEventListener("mesa:analytics", onEvent);
  }, []);

  return null;
}
