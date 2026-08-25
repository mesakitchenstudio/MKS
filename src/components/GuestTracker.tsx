"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const HEARTBEAT_MS = 45_000;

function shouldTrackPath(pathname: string) {
  return Boolean(pathname) && !pathname.startsWith("/admin") && !pathname.startsWith("/api");
}

export function GuestTracker() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const lastPageviewPath = useRef("");

  useEffect(() => {
    if (status === "loading") return;
    if (session?.user?.email) return;
    if (!shouldTrackPath(pathname)) return;

    function send(pageview: boolean) {
      if (document.visibilityState === "hidden" && !pageview) return;
      void fetch("/api/analytics/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          referer: typeof document !== "undefined" ? document.referrer : "",
          pageview,
        }),
        keepalive: true,
      });
    }

    const isNewPage = lastPageviewPath.current !== pathname;
    if (isNewPage) {
      lastPageviewPath.current = pathname;
      send(true);
    } else {
      send(false);
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
