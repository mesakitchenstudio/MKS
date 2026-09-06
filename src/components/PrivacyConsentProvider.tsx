"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { clearGuestAnalyticsBrowserStorage } from "@/lib/guest-tracking";
import {
  acceptAllOptionalConsent,
  createPrivacyConsentRecord,
  isAnalyticsConsentGranted,
  isGoogleSignInEnhancementConsentGranted,
  type PrivacyConsentDecision,
  type PrivacyConsentRecord,
  readPrivacyConsentFromDocumentCookie,
  rejectAllOptionalConsent,
  writePrivacyConsentCookieClient,
} from "@/lib/privacy-consent";

type PrivacyConsentContextValue = {
  ready: boolean;
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

let consentEpoch = 0;
const consentListeners = new Set<() => void>();

function subscribeConsent(listener: () => void) {
  consentListeners.add(listener);
  return () => consentListeners.delete(listener);
}

function getConsentSnapshot(): PrivacyConsentDecision {
  return readPrivacyConsentFromDocumentCookie();
}

function getConsentServerSnapshot(): PrivacyConsentDecision {
  return { status: "undecided" };
}

function bumpConsentEpoch() {
  consentEpoch += 1;
  for (const listener of consentListeners) listener();
}

async function persistConsent(record: PrivacyConsentRecord) {
  writePrivacyConsentCookieClient(record);
  bumpConsentEpoch();
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
  bumpConsentEpoch();
  return record;
}

export function PrivacyConsentProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const decision = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );
  // Epoch forces re-subscribe reads after cookie writes in this tab.
  useSyncExternalStore(
    subscribeConsent,
    () => consentEpoch,
    () => 0,
  );
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [bannerDismissedThisSession, setBannerDismissedThisSession] = useState(false);

  const applyRecord = useCallback(async (record: PrivacyConsentRecord) => {
    await persistConsent(record);
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
    ready &&
    !isAdmin &&
    decision.status === "undecided" &&
    !bannerDismissedThisSession &&
    !preferencesOpen;

  const value = useMemo<PrivacyConsentContextValue>(
    () => ({
      ready,
      decision,
      analyticsAllowed: isAnalyticsConsentGranted(decision),
      googleSignInEnhancementsAllowed: isGoogleSignInEnhancementConsentGranted(decision),
      showBanner,
      preferencesOpen,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
      acceptOptional,
      rejectOptional,
      savePreferences,
    }),
    [
      ready,
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
