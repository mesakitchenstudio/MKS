"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  claimGuestPageview,
  clearActiveGuestNavigation,
  GUEST_EARLY_HEARTBEAT_MS,
  GUEST_HEARTBEAT_MS,
  guestNavigationFor,
  shouldSendGuestPresence,
  shouldSkipGuestAnalytics,
  shouldTrackGuestPath,
} from "@/lib/guest-tracking";

declare global {
  interface Window {
    /** Set by ComingSoonGuestBeacon before React hydrates — avoids duplicate pageviews. */
    __mesaGuestDocumentPv?: number;
  }
}

export function GuestTracker() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    // Members → Members page. Staff may still be tracked as Visitors for public QA.
    if (
      shouldSkipGuestAnalytics({
        email: session?.user?.email,
        staffRole: session?.staffRole,
      })
    ) {
      clearActiveGuestNavigation();
      return;
    }
    if (!shouldTrackGuestPath(pathname)) return;

    const { path, navId } = guestNavigationFor(pathname);
    let stopped = false;

    function send(pageview: boolean, opts?: { force?: boolean; keepalive?: boolean }) {
      if (stopped) return;
      if (
        !shouldSendGuestPresence({
          pageview,
          visibilityState: document.visibilityState,
          force: opts?.force,
        })
      ) {
        return;
      }
      void fetch("/api/analytics/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          path,
          referer: typeof document !== "undefined" ? document.referrer : "",
          pageview,
          ...(pageview ? { navId } : {}),
        }),
        // keepalive only for unload — routine heartbeats share Chrome's 64KiB
        // keepalive budget with third-party analytics and can fail silently.
        keepalive: Boolean(opts?.keepalive),
      }).catch(() => undefined);
    }

    // Coming Soon beacon already recorded a document pageview before hydration.
    const documentAlreadyTracked = Boolean(window.__mesaGuestDocumentPv);
    if (claimGuestPageview(navId) && !documentAlreadyTracked) {
      send(true);
    } else {
      send(false);
    }

    const early = window.setTimeout(() => send(false), GUEST_EARLY_HEARTBEAT_MS);
    const timer = window.setInterval(() => send(false), GUEST_HEARTBEAT_MS);

    function onVisible() {
      if (document.visibilityState === "visible") send(false);
    }
    function onPageShow() {
      send(false);
    }
    function onPageHide() {
      send(false, { force: true, keepalive: true });
    }

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      stopped = true;
      window.clearTimeout(early);
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname, session?.user?.email, session?.staffRole, status]);

  return null;
}
