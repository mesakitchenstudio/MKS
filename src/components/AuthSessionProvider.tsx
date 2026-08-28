"use client";

import { SessionProvider, signOut as signOutGoogle, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { GuestTracker } from "@/components/GuestTracker";
import {
  getPresenceSessionKey,
  signOut as clearLocalSession,
  writeSession,
} from "@/lib/auth-client";
import { hydrateLikesFromProfile } from "@/lib/likes";

const HEARTBEAT_MS = 45_000;

function SessionSync() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const didRefreshProfile = useRef(false);
  const didEnrich = useRef(false);
  const didForceSignOut = useRef(false);

  useEffect(() => {
    if (status === "loading") return;

    if (session?.error === "MemberDeleted" || (status === "authenticated" && !session?.user?.email)) {
      if (!didForceSignOut.current) {
        didForceSignOut.current = true;
        clearLocalSession();
        void signOutGoogle({ redirect: false });
      }
      return;
    }

    didForceSignOut.current = false;

    if (!session?.user?.email) {
      clearLocalSession();
      return;
    }
    writeSession({
      name: session.user.name?.trim() || session.user.email,
      email: session.user.email,
    });

    if (session.staffRole) return;

    const sessionKey = getPresenceSessionKey();

    if (!didEnrich.current) {
      didEnrich.current = true;
      void fetch("/api/account/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrich: true, sessionKey }),
      }).then((response) => {
        if (response.status === 401) {
          clearLocalSession();
          void signOutGoogle({ redirect: false });
        }
      });
    }

    function beat() {
      if (document.visibilityState === "hidden") return;
      void fetch("/api/account/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrich: false, sessionKey }),
        keepalive: true,
      }).then((response) => {
        if (response.status === 401) {
          clearLocalSession();
          void signOutGoogle({ redirect: false });
        }
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
  }, [session, status]);

  useEffect(() => {
    if (!session?.user?.email || session.staffRole || session.error === "MemberDeleted") return;
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
