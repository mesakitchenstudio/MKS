"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  broadcastGuestVisitorRotated,
  claimGuestPageview,
  clearActiveGuestNavigation,
  endAnonymousGuestPresenceOnAuth,
  getGuestConnectionKey,
  getSharedGuestVisitorKey,
  GUEST_EARLY_HEARTBEAT_MS,
  GUEST_HEARTBEAT_MS,
  guestNavigationFor,
  rememberSharedGuestVisitorKey,
  rotateSharedGuestVisitorKey,
  shouldSendGuestPresence,
  shouldSkipGuestAnalytics,
  shouldTrackGuestPath,
  subscribeGuestConvertedToMember,
  subscribeGuestVisitorRotated,
} from "@/lib/guest-tracking";
import { guestUtmFieldsAreEmpty, parseGuestUtmFromLocationSearch } from "@/lib/guest-utm";

declare global {
  interface Window {
    /** Set by ComingSoonGuestBeacon before React hydrates — avoids duplicate pageviews. */
    __mesaGuestDocumentPv?: number;
  }
}

export function GuestTracker() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const endedPresenceForAuth = useRef(false);

  useEffect(() => {
    // Members → Members page. Staff are skipped client-side when staffRole is set;
    // admin-session-only staff are still blocked server-side (Phase 2A).
    if (
      shouldSkipGuestAnalytics({
        email: session?.user?.email,
        staffRole: session?.staffRole,
      })
    ) {
      clearActiveGuestNavigation();
      if (!endedPresenceForAuth.current) {
        endedPresenceForAuth.current = true;
        void endAnonymousGuestPresenceOnAuth();
      }
      return;
    }

    endedPresenceForAuth.current = false;
    if (!shouldTrackGuestPath(pathname)) return;

    const { path, navId } = guestNavigationFor(pathname);
    const connectionKey = getGuestConnectionKey();
    let stopped = false;
    let clientVisitorKey = "";
    let timer = 0;
    let early = 0;
    let rotating = false;

    function stopAnonymousTracking() {
      stopped = true;
      window.clearTimeout(early);
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
      clearActiveGuestNavigation();
    }

    function rememberFromResponse(response: Response) {
      void response
        .clone()
        .json()
        .then((data: { visitorKey?: string }) => {
          if (data?.visitorKey) {
            rememberSharedGuestVisitorKey(data.visitorKey);
            clientVisitorKey = data.visitorKey;
          }
        })
        .catch(() => undefined);
    }

    async function recoverStaleVisitorIdentity() {
      if (rotating || stopped) return false;
      rotating = true;
      try {
        const fresh = await rotateSharedGuestVisitorKey(clientVisitorKey);
        if (!fresh) return false;
        clientVisitorKey = fresh;
        broadcastGuestVisitorRotated(fresh);
        return true;
      } finally {
        rotating = false;
      }
    }

    function send(
      pageview: boolean,
      opts?: {
        force?: boolean;
        keepalive?: boolean;
        disconnect?: boolean;
        isRetry?: boolean;
      },
    ) {
      if (stopped && !opts?.disconnect) return;
      if (
        !opts?.disconnect &&
        !shouldSendGuestPresence({
          pageview,
          visibilityState: document.visibilityState,
          force: opts?.force,
        })
      ) {
        return;
      }

      const utm = parseGuestUtmFromLocationSearch(
        typeof window !== "undefined" ? window.location.search : "",
      );
      const payload = JSON.stringify({
        path,
        referer: typeof document !== "undefined" ? document.referrer : "",
        pageview,
        connectionKey,
        clientVisitorKey,
        ...(pageview ? { navId } : {}),
        ...(opts?.disconnect ? { disconnect: true } : {}),
        ...(!guestUtmFieldsAreEmpty(utm)
          ? {
              utmSource: utm.utmSource,
              utmMedium: utm.utmMedium,
              utmCampaign: utm.utmCampaign,
            }
          : {}),
      });

      if (opts?.disconnect && typeof navigator !== "undefined" && navigator.sendBeacon) {
        const ok = navigator.sendBeacon(
          "/api/analytics/guest",
          new Blob([payload], { type: "application/json" }),
        );
        if (ok) return;
      }

      void fetch("/api/analytics/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: payload,
        keepalive: Boolean(opts?.keepalive || opts?.disconnect),
      })
        .then(async (response) => {
          if (response.status === 409 && !opts?.isRetry && !opts?.disconnect) {
            let data: { rotate?: boolean; code?: string } = {};
            try {
              data = (await response.json()) as { rotate?: boolean; code?: string };
            } catch {
              data = {};
            }
            if (data.rotate || data.code === "stale_visitor") {
              const recovered = await recoverStaleVisitorIdentity();
              if (recovered) send(pageview, { ...opts, force: true, isRetry: true });
            }
            return;
          }
          rememberFromResponse(response);
        })
        .catch(() => undefined);
    }

    function onVisible() {
      if (document.visibilityState === "visible") send(false);
    }
    function onPageShow() {
      send(false);
    }
    function onPageHide() {
      send(false, { force: true, keepalive: true, disconnect: true });
    }

    const unsubscribeConverted = subscribeGuestConvertedToMember(() => {
      // Sibling tab completed Member sign-in — stop anonymous heartbeats immediately.
      stopAnonymousTracking();
    });

    const unsubscribeRotated = subscribeGuestVisitorRotated((visitorKey) => {
      clientVisitorKey = visitorKey;
    });

    void (async () => {
      clientVisitorKey = await getSharedGuestVisitorKey();
      if (stopped) return;

      const documentAlreadyTracked = Boolean(window.__mesaGuestDocumentPv);
      if (claimGuestPageview(navId) && !documentAlreadyTracked) {
        send(true);
      } else {
        send(false);
      }

      early = window.setTimeout(() => send(false), GUEST_EARLY_HEARTBEAT_MS);
      timer = window.setInterval(() => send(false), GUEST_HEARTBEAT_MS);
      window.addEventListener("focus", onVisible);
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("pageshow", onPageShow);
      window.addEventListener("pagehide", onPageHide);
    })();

    return () => {
      unsubscribeConverted();
      unsubscribeRotated();
      stopAnonymousTracking();
    };
  }, [pathname, session?.user?.email, session?.staffRole, status]);

  return null;
}
