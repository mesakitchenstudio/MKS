"use client";

import { SessionProvider, signOut as signOutGoogle, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { GuestTracker } from "@/components/GuestTracker";
import {
  getPresenceSessionKey,
  signalMemberPresenceDisconnect,
  signOut as clearLocalSession,
  writeSession,
} from "@/lib/auth-client";
import { endAnonymousGuestPresenceOnAuth } from "@/lib/guest-tracking";
import { hydrateLikesFromProfile } from "@/lib/likes";
import { MEMBER_PRESENCE_HEARTBEAT_MS } from "@/lib/member-presence";

function SessionSync() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const didRefreshProfile = useRef(false);
  const didEnrich = useRef(false);
  const didForceSignOut = useRef(false);
  const didEndGuestPresence = useRef(false);

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
      didEndGuestPresence.current = false;
      return;
    }
    writeSession({
      name: session.user.name?.trim() || session.user.email,
      email: session.user.email,
    });

    if (session.staffRole) return;

    // Visitor → Member: drop anonymous Online presence immediately (history kept).
    if (!didEndGuestPresence.current) {
      didEndGuestPresence.current = true;
      void endAnonymousGuestPresenceOnAuth();
    }

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
      // Do not treat tab blur / screen lock as Offline — heartbeat TTL covers suspend.
      if (document.visibilityState === "hidden") return;
      void fetch("/api/account/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrich: false, sessionKey }),
      }).then((response) => {
        if (response.status === 401) {
          clearLocalSession();
          void signOutGoogle({ redirect: false });
        }
      });
    }

    function onVisible() {
      if (document.visibilityState === "visible") beat();
    }

    function onPageShow() {
      beat();
    }

    function onPageHide() {
      signalMemberPresenceDisconnect();
    }

    beat();
    const timer = window.setInterval(beat, MEMBER_PRESENCE_HEARTBEAT_MS);
    window.addEventListener("focus", beat);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", beat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
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
