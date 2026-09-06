"use client";

import { signIn, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  GOOGLE_ONETAP_PROVIDER_ID,
  isGoogleOneTapClientConfigured,
  isGoogleOneTapPathEligible,
  publicGoogleClientId,
} from "@/lib/google-onetap";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type CredentialResponse = {
  credential?: string;
  select_by?: string;
};

type PromptNotification = {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
};

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: string;
    itp_support?: boolean;
  }) => void;
  prompt: (listener?: (notification: PromptNotification) => void) => void;
  cancel: () => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
    __mesaGoogleOneTapDisableAutoSelect?: boolean;
  }
}

function loadGisScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("GIS script failed")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GIS script failed"));
    document.head.appendChild(script);
  });
}

/** Call after explicit Mesa sign-out so One Tap does not immediately auto-select. */
export function disableGoogleOneTapAutoSelect() {
  if (typeof window === "undefined") return;
  window.__mesaGoogleOneTapDisableAutoSelect = true;
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // GIS may not be loaded yet; flag is checked on next initialize.
  }
}

/**
 * Google Identity Services One Tap / FedCM prompt for signed-out public visitors.
 * Browser/Google own the UI; Mesa only consumes a verified ID token via Auth.js.
 */
export function GoogleOneTap({ enabled }: { enabled: boolean }) {
  const { status } = useSession();
  const pathname = usePathname() || "/";
  const handlingRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (status !== "unauthenticated") {
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // ignore
      }
      return;
    }
    if (!isGoogleOneTapClientConfigured()) return;
    if (!isGoogleOneTapPathEligible(pathname)) return;

    let cancelled = false;
    const clientId = publicGoogleClientId();

    async function start() {
      try {
        await loadGisScript();
      } catch {
        return;
      }
      if (cancelled || !window.google?.accounts?.id) return;

      const handleCredential = async (response: CredentialResponse) => {
        const credential = response.credential?.trim();
        if (!credential || handlingRef.current) return;
        handlingRef.current = true;
        try {
          const result = await signIn(GOOGLE_ONETAP_PROVIDER_ID, {
            credential,
            redirect: false,
          });
          if (result?.ok) {
            window.location.reload();
            return;
          }
        } catch {
          // Fall back to existing Sign in — no visible One Tap error chrome.
        } finally {
          handlingRef.current = false;
        }
      };

      try {
        if (!initializedRef.current) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => {
              void handleCredential(response);
            },
            auto_select: false,
            cancel_on_tap_outside: true,
            context: "signin",
            itp_support: true,
          });
          initializedRef.current = true;
        }

        if (window.__mesaGoogleOneTapDisableAutoSelect) {
          try {
            window.google.accounts.id.disableAutoSelect();
          } catch {
            // ignore
          }
          window.__mesaGoogleOneTapDisableAutoSelect = false;
        }

        window.google.accounts.id.prompt(() => {
          // Dismissed / skipped / not displayed — silent; Sign in remains.
        });
      } catch {
        // GIS unavailable — silent.
      }
    }

    void start();

    return () => {
      cancelled = true;
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // ignore
      }
    };
  }, [enabled, status, pathname]);

  return null;
}
