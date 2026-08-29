"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  claimGuestPageview,
  clearActiveGuestNavigation,
  getGuestConnectionKey,
  getSharedGuestVisitorKey,
  GUEST_EARLY_HEARTBEAT_MS,
  GUEST_HEARTBEAT_MS,
  guestNavigationFor,
  rememberSharedGuestVisitorKey,
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
    const connectionKey = getGuestConnectionKey();
    let stopped = false;
    let clientVisitorKey = "";
    let timer = 0;
    let early = 0;

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

    function send(
      pageview: boolean,
      opts?: { force?: boolean; keepalive?: boolean; disconnect?: boolean },
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

      const payload = JSON.stringify({
        path,
        referer: typeof document !== "undefined" ? document.referrer : "",
        pageview,
        connectionKey,
        clientVisitorKey,
        ...(pageview ? { navId } : {}),
        ...(opts?.disconnect ? { disconnect: true } : {}),
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
        .then((response) => {
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

    void (async () => {
      // Serialize first-key creation across tabs, then both send the same visitorKey.
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
