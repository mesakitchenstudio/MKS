"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { clearGuestAnalyticsBrowserStorage } from "@/lib/guest-tracking";
import {
  acceptAllOptionalConsent,
  createPrivacyConsentRecord,
  isAnalyticsConsentGranted,
  isGoogleSignInEnhancementConsentGranted,
  privacyConsentDecisionsEqual,
  type PrivacyConsentDecision,
  type PrivacyConsentRecord,
  readPrivacyConsentFromDocumentCookie,
  rejectAllOptionalConsent,
  UNDECIDED_CONSENT,
  writePrivacyConsentCookieClient,
} from "@/lib/privacy-consent";

type PrivacyConsentContextValue = {
  hydrated: boolean;
  decision: PrivacyConsentDecision;
  analyticsAllowed: boolean;
  googleSignInEnhancementsAllowed: boolean;
  showBanner: boolean;
  preferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  acceptOptional: () => Promise<void>;
  rejectOptional: () => Promise<void>;
  savePreferences: (input: {
    analytics: boolean;
    googleSignInEnhancements: boolean;
  }) => Promise<void>;
};

const PrivacyConsentContext = createContext<PrivacyConsentContextValue | null>(null);

async function persistConsent(record: PrivacyConsentRecord) {
  writePrivacyConsentCookieClient(record);
  const response = await fetch("/api/privacy/consent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      analytics: record.analytics,
      googleSignInEnhancements: record.googleSignInEnhancements,
    }),
  });
  if (!response.ok) {
    throw new Error("Could not save privacy preferences.");
  }
  if (!record.analytics) {
    clearGuestAnalyticsBrowserStorage();
  }
  return {
    status: "decided" as const,
    record,
  };
}

/**
 * Safe consent provider — ordinary React state only.
 * Do not reintroduce React sync-external-store snapshots here
 * (unstable getSnapshot objects caused the 1d3d848 production outage).
 */
export function PrivacyConsentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const [hydrated, setHydrated] = useState(false);
  const [decision, setDecision] = useState<PrivacyConsentDecision>(UNDECIDED_CONSENT);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [bannerDismissedThisSession, setBannerDismissedThisSession] = useState(false);
  const didHydrateRef = useRef(false);

  // Exactly once on client mount: read cookie → hydrate.
  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;
    const next = readPrivacyConsentFromDocumentCookie();
    setDecision((prev) => (privacyConsentDecisionsEqual(prev, next) ? prev : next));
    setHydrated(true);
  }, []);

  // Optional cross-tab sync on focus/visibility - no polling.
  useEffect(() => {
    if (!hydrated) return;

    function syncFromCookie() {
      const next = readPrivacyConsentFromDocumentCookie();
      setDecision((prev) => (privacyConsentDecisionsEqual(prev, next) ? prev : next));
    }

    function onVisible() {
      if (document.visibilityState === "visible") syncFromCookie();
    }

    window.addEventListener("focus", syncFromCookie);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", syncFromCookie);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated]);

  const applyRecord = useCallback(async (record: PrivacyConsentRecord) => {
    const next = await persistConsent(record);
    setDecision((prev) => (privacyConsentDecisionsEqual(prev, next) ? prev : next));
    setBannerDismissedThisSession(true);
    setPreferencesOpen(false);
  }, []);

  const acceptOptional = useCallback(async () => {
    await applyRecord(acceptAllOptionalConsent());
  }, [applyRecord]);

  const rejectOptional = useCallback(async () => {
    await applyRecord(rejectAllOptionalConsent());
  }, [applyRecord]);

  const savePreferences = useCallback(
    async (input: { analytics: boolean; googleSignInEnhancements: boolean }) => {
      await applyRecord(createPrivacyConsentRecord(input));
    },
    [applyRecord],
  );

  const isAdmin = pathname.startsWith("/admin");
  const showBanner =
    hydrated &&
    !isAdmin &&
    decision.status === "undecided" &&
    !bannerDismissedThisSession &&
    !preferencesOpen;

  const value = useMemo<PrivacyConsentContextValue>(
    () => ({
      hydrated,
      decision,
      analyticsAllowed: hydrated && isAnalyticsConsentGranted(decision),
      googleSignInEnhancementsAllowed:
        hydrated && isGoogleSignInEnhancementConsentGranted(decision),
      showBanner,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
      acceptOptional,
      rejectOptional,
      savePreferences,
    }),
    [
      hydrated,
      decision,
      showBanner,
      preferencesOpen,
      acceptOptional,
      rejectOptional,
      savePreferences,
    ],
  );

  return (
    <PrivacyConsentContext.Provider value={value}>{children}</PrivacyConsentContext.Provider>
  );
}

export function usePrivacyConsent() {
  const ctx = useContext(PrivacyConsentContext);
  if (!ctx) {
    throw new Error("usePrivacyConsent must be used within PrivacyConsentProvider");
  }
  return ctx;
}

/** Safe for optional gating outside the provider tree (returns deny-by-default). */
export function usePrivacyConsentOptional() {
  return useContext(PrivacyConsentContext);
}
