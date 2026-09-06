"use client";

import { SessionProvider, signOut as signOutGoogle, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { GuestTracker } from "@/components/GuestTracker";
import { GoogleOneTap } from "@/components/GoogleOneTap";
import { usePrivacyConsentOptional } from "@/components/PrivacyConsentProvider";
import {
  getPresenceSessionKey,
  registerMemberPresenceKey,
  signalMemberPresenceDisconnect,
  signOut as clearLocalSession,
  subscribeMemberLogout,
  writeSession,
} from "@/lib/auth-client";
import { endAnonymousGuestPresenceOnAuth } from "@/lib/guest-tracking";
import { hydrateLikesFromProfile } from "@/lib/likes";
import { MEMBER_PRESENCE_HEARTBEAT_MS } from "@/lib/member-presence";

function ConsentGatedGuestTracker() {
  const consent = usePrivacyConsentOptional();
  if (!consent?.hydrated || !consent.analyticsAllowed) return null;
  return <GuestTracker />;
}

function ConsentGatedGoogleOneTap({
  enabled,
  clientId,
}: {
  enabled: boolean;
  clientId: string;
}) {
  const consent = usePrivacyConsentOptional();
  const oneTapAllowed =
    enabled && Boolean(consent?.hydrated && consent.googleSignInEnhancementsAllowed);
  return <GoogleOneTap enabled={oneTapAllowed} clientId={clientId} />;
}

function SessionSync() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const didRefreshProfile = useRef(false);
  const didEnrich = useRef(false);
  const didForceSignOut = useRef(false);
  const didEndGuestPresence = useRef(false);
  const stopMemberPresenceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (status === "loading") return;

    if (
      session?.error === "MemberDeleted" ||
      session?.error === "SessionRevoked" ||
      (status === "authenticated" && !session?.user?.email)
    ) {
      if (!didForceSignOut.current) {
        didForceSignOut.current = true;
        clearLocalSession();
        void import("@/components/GoogleOneTap").then(({ disableGoogleOneTapAutoSelect }) => {
          disableGoogleOneTapAutoSelect();
        });
        void signOutGoogle({ redirect: false });
      }
      return;
    }

    didForceSignOut.current = false;

    if (!session?.user?.email) {
      clearLocalSession();
      didEndGuestPresence.current = false;
      didEnrich.current = false;
      stopMemberPresenceRef.current?.();
      stopMemberPresenceRef.current = null;
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
    registerMemberPresenceKey(sessionKey);

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

    let stopped = false;
    let timer = 0;

    function stopMemberPresence() {
      if (stopped) return;
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", beat);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("pagehide", onPageHide);
    }

    function beat() {
      if (stopped) return;
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
    timer = window.setInterval(beat, MEMBER_PRESENCE_HEARTBEAT_MS);
    window.addEventListener("focus", beat);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("pagehide", onPageHide);
    stopMemberPresenceRef.current = stopMemberPresence;

    const unsubscribeLogout = subscribeMemberLogout(() => {
      // Sibling tab is logging out this browser session — stop heartbeats immediately.
      stopMemberPresence();
    });

    return () => {
      unsubscribeLogout();
      stopMemberPresence();
      stopMemberPresenceRef.current = null;
    };
  }, [session, status]);

  useEffect(() => {
    if (!session?.user?.email || session.staffRole || session.error === "MemberDeleted" || session.error === "SessionRevoked") return;
    void hydrateLikesFromProfile().then((favorites) => {
      if (pathname === "/profile" && favorites.length && !didRefreshProfile.current) {
        didRefreshProfile.current = true;
        router.refresh();
      }
    });
  }, [session, pathname, router]);

  return null;
}

export function AuthSessionProvider({
  children,
  googleOneTapEnabled = false,
  googleClientId = "",
}: {
  children: ReactNode;
  /** Off while SITE_PRIVATE (Coming Soon), including staff preview. */
  googleOneTapEnabled?: boolean;
  /** AUTH_GOOGLE_ID (or NEXT_PUBLIC) — required for GIS initialize. */
  googleClientId?: string;
}) {
  return (
    <SessionProvider>
      <SessionSync />
      <ConsentGatedGuestTracker />
      <ConsentGatedGoogleOneTap enabled={googleOneTapEnabled} clientId={googleClientId} />
      {children}
    </SessionProvider>
  );
}
