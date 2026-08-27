"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  claimGuestPageview,
  clearActiveGuestNavigation,
  guestNavigationFor,
  shouldTrackGuestPath,
} from "@/lib/guest-tracking";

const HEARTBEAT_MS = 45_000;

export function GuestTracker() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.email) {
      // After sign-out, allow a fresh pageview for the current public path.
      clearActiveGuestNavigation();
      return;
    }
    if (!shouldTrackGuestPath(pathname)) return;

    const { path, navId } = guestNavigationFor(pathname);

    function send(pageview: boolean) {
      if (document.visibilityState === "hidden" && !pageview) return;
      void fetch("/api/analytics/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          referer: typeof document !== "undefined" ? document.referrer : "",
          pageview,
          ...(pageview ? { navId } : {}),
        }),
        keepalive: true,
      });
    }

    // One pageview claim per navigation id (covers Strict Mode double-mount).
    if (claimGuestPageview(navId)) {
      send(true);
    }

    const timer = window.setInterval(() => send(false), HEARTBEAT_MS);
    const onFocus = () => send(false);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pathname, session?.user?.email, status]);

  return null;
}
