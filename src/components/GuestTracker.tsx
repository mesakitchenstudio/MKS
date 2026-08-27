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
  shouldTrackGuestPath,
} from "@/lib/guest-tracking";

export function GuestTracker() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    // Signed-in members are recorded on Members, not Visitors.
    // Do not wait for status === "loading": on mobile that delay (or a stuck
    // session fetch) postpones or blocks presence. The API skips signed-in
    // requests via auth() even if a brief optimistic ping races the session.
    if (status === "authenticated" && session?.user?.email) {
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

    // One pageview claim per navigation id (covers Strict Mode double-mount).
    // Remounts still refresh lastSeen so Online does not depend on the interval alone.
    if (claimGuestPageview(navId)) {
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
  }, [pathname, session?.user?.email, status]);

  return null;
}
