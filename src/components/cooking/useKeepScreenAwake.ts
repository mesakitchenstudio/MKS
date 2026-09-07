"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/**
 * Opt-in Screen Wake Lock. Hidden when unsupported.
 * Reacquires after visibility change when preference remains enabled.
 */
export function useKeepScreenAwake(enabled: boolean) {
  const [supported] = useState(() => wakeLockSupported());
  const [active, setActive] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState<string | null>(null);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  const release = useCallback(async () => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    setActive(false);
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // ignore
      }
    }
  }, []);

  const request = useCallback(async () => {
    if (!wakeLockSupported()) {
      setUnavailableMessage("Screen awake isn't available in this browser.");
      return false;
    }
    try {
      const wakeLock = navigator.wakeLock;
      const sentinel = (await wakeLock.request("screen")) as WakeLockSentinelLike;
      sentinelRef.current = sentinel;
      setActive(true);
      setUnavailableMessage(null);
      sentinel.addEventListener?.("release", () => {
        if (sentinelRef.current === sentinel) {
          sentinelRef.current = null;
          setActive(false);
        }
      });
      return true;
    } catch {
      setUnavailableMessage("Screen awake isn't available right now.");
      setActive(false);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (enabled) void request();
      else void release();
    }, 0);

    function onVisibility() {
      if (document.visibilityState === "visible" && enabled) {
        void request();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [enabled, request, release]);

  return { supported, active, unavailableMessage, request, release };
}
