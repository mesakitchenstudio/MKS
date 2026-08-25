"use client";

import { SessionProvider, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { GuestTracker } from "@/components/GuestTracker";
import { writeSession } from "@/lib/auth-client";
import { hydrateLikesFromProfile } from "@/lib/likes";

const HEARTBEAT_MS = 45_000;

function SessionSync() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const didRefreshProfile = useRef(false);
  const didEnrich = useRef(false);

  useEffect(() => {
    if (!session?.user?.email) return;
    writeSession({
      name: session.user.name?.trim() || session.user.email,
      email: session.user.email,
    });

    if (session.staffRole) return;

    if (!didEnrich.current) {
      didEnrich.current = true;
      void fetch("/api/account/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrich: true }),
      });
    }

    function beat() {
      if (document.visibilityState === "hidden") return;
      void fetch("/api/account/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrich: false }),
        keepalive: true,
      });
    }

    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    window.addEventListener("focus", beat);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", beat);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [session]);

  useEffect(() => {
    if (!session?.user?.email || session.staffRole) return;
    void hydrateLikesFromProfile().then((favorites) => {
      if (pathname === "/profile" && favorites.length && !didRefreshProfile.current) {
        didRefreshProfile.current = true;
        router.refresh();
      }
    });
  }, [session, pathname, router]);

  return null;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionSync />
      <GuestTracker />
      {children}
    </SessionProvider>
  );
}
