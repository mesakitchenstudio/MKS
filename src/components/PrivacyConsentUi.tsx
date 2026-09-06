"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { usePrivacyConsent } from "@/components/PrivacyConsentProvider";
import { authFocusRing } from "@/lib/auth-ui";
import { PRIVACY_CONSENT_SAFE_AREA_CSS_VAR, privacyConsentSafeAreaPx } from "@/lib/privacy-consent";

const focusRing = authFocusRing;

/** Reject / Accept visual twins — terracotta hairline, paper fill, no Accept bias. */
const choiceButtonClass = `inline-flex h-10 min-h-11 w-full items-center justify-center rounded-full border border-terracotta bg-paper px-3 text-sm font-semibold text-terracotta transition-colors hover:bg-cream disabled:opacity-60 sm:min-h-10 ${focusRing}`;

/** Manage — text-only secondary, usable hit area. */
const manageButtonClass = `inline-flex min-h-10 items-center justify-center self-start bg-transparent px-0.5 text-sm font-semibold text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-60 ${focusRing}`;

export function PrivacyConsentUi() {
  const pathname = usePathname() || "/";
  const { data: session, status } = useSession();
  const {
    showBanner,
    preferencesOpen,
    closePreferences,
    openPreferences,
    acceptOptional,
    rejectOptional,
    savePreferences,
    decision,
  } = usePrivacyConsent();

  if (pathname.startsWith("/admin")) return null;

  // Optional categories only matter for signed-out guests. Do not show the
  // first-choice banner while authenticated (member or staff). Session loading
  // stays suppressed to avoid a signed-in flash. Existing decisions are untouched.
  const isSignedIn =
    status === "authenticated" && Boolean(session?.user?.email || session?.staffRole);
  const displayFirstChoiceBanner =
    showBanner && status !== "loading" && !isSignedIn;

  return (
    <>
      {displayFirstChoiceBanner ? (
        <PrivacyConsentBanner
          onAccept={() => void acceptOptional()}
          onReject={() => void rejectOptional()}
          onManage={openPreferences}
        />
      ) : null}
      {preferencesOpen ? (
        <PrivacyPreferencesDialog
          initialAnalytics={
            decision.status === "decided" ? decision.record.analytics : false
          }
          initialGoogle={
            decision.status === "decided"
              ? decision.record.googleSignInEnhancements
              : false
          }
          onClose={closePreferences}
          onSave={(prefs) => void savePreferences(prefs)}
        />
      ) : null}
    </>
  );
}

function PrivacyConsentBanner({
  onAccept,
  onReject,
  onManage,
}: {
  onAccept: () => void;
  onReject: () => void;
  onManage: () => void;
}) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const headingId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  // Publish measured height + bottom inset + content gap for layout safe-area.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof document === "undefined") return;
    const root = document.documentElement;

    function publish() {
      if (!card) return;
      const height = card.getBoundingClientRect().height;
      root.style.setProperty(
        PRIVACY_CONSENT_SAFE_AREA_CSS_VAR,
        `${privacyConsentSafeAreaPx(height)}px`,
      );
    }

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(card);
    window.addEventListener("resize", publish);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", publish);
      root.style.removeProperty(PRIVACY_CONSENT_SAFE_AREA_CSS_VAR);
    };
  }, []);

  async function run(kind: "accept" | "reject", action: () => void | Promise<void>) {
    if (busy) return;
    setBusy(kind);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-[80] w-[calc(100%-2rem)] max-w-[392px] sm:bottom-6 sm:left-6 sm:w-[min(392px,calc(100vw-3rem))]"
      role="region"
      aria-labelledby={headingId}
    >
      <div
        ref={cardRef}
        className="pointer-events-auto rounded border border-line bg-paper px-5 pb-4 pt-4 text-ink"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-olive">
          Privacy
        </p>
        <p
          id={headingId}
          role="heading"
          aria-level={2}
          className="mt-1.5 font-serif text-lg leading-snug text-ink sm:text-xl"
        >
          Your privacy
        </p>
        <p className="mt-1.5 max-w-[40ch] text-sm leading-[1.5] text-muted">
          Mesa uses essential technologies to keep the site working. Optional analytics and
          Google sign-in enhancements run only if you allow them.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run("reject", onReject)}
              className={choiceButtonClass}
            >
              {busy === "reject" ? "Saving…" : "Reject optional"}
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run("accept", onAccept)}
              className={choiceButtonClass}
            >
              {busy === "accept" ? "Saving…" : "Accept optional"}
            </button>
          </div>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={onManage}
            className={manageButtonClass}
          >
            Manage preferences
          </button>
        </div>
      </div>
    </div>
  );
}

function PrivacyPreferencesDialog({
  initialAnalytics,
  initialGoogle,
  onClose,
  onSave,
}: {
  initialAnalytics: boolean;
  initialGoogle: boolean;
  onClose: () => void;
  onSave: (input: {
    analytics: boolean;
    googleSignInEnhancements: boolean;
  }) => void | Promise<void>;
}) {
  const titleId = useId();
  const analyticsId = useId();
  const googleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [google, setGoogle] = useState(initialGoogle);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await onSave({ analytics, googleSignInEnhancements: google });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink/35"
        aria-label="Close privacy preferences"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] max-h-[min(90dvh,40rem)] w-full max-w-lg overflow-y-auto border border-line bg-paper px-5 py-5 text-ink sm:px-6 sm:py-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
              Privacy
            </p>
            <h2 id={titleId} className="mt-1 font-serif text-2xl leading-snug text-ink">
              Privacy preferences
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded-sm px-2 py-1 text-sm font-semibold text-muted hover:text-ink ${focusRing}`}
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-5 border-t border-line pt-5">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
              Essential
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">Always on</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              Used for security, authentication, and core site functions.
            </p>
          </div>

          <div className="border-t border-line pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor={analyticsId} className="text-sm font-semibold text-ink">
                  Optional analytics
                </label>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Helps Mesa understand page visits and how the site is used.
                </p>
              </div>
              <input
                id={analyticsId}
                type="checkbox"
                checked={analytics}
                onChange={(event) => setAnalytics(event.target.checked)}
                className={`mt-1 h-5 w-5 shrink-0 accent-terracotta ${focusRing}`}
              />
            </div>
          </div>

          <div className="border-t border-line pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor={googleId} className="text-sm font-semibold text-ink">
                  Google sign-in enhancements
                </label>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Allows automatic Google One Tap sign-in prompts on eligible pages. Explicit
                  Google sign-in remains available even when this is off.
                </p>
              </div>
              <input
                id={googleId}
                type="checkbox"
                checked={google}
                onChange={(event) => setGoogle(event.target.checked)}
                className={`mt-1 h-5 w-5 shrink-0 accent-terracotta ${focusRing}`}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex min-h-11 items-center justify-center border border-line px-4 text-sm font-semibold text-ink ${focusRing}`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className={`inline-flex min-h-11 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:opacity-60 ${focusRing}`}
          >
            {busy ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PrivacyPreferencesFooterLink({ className }: { className?: string }) {
  const consent = usePrivacyConsent();
  return (
    <button type="button" onClick={() => consent.openPreferences()} className={className}>
      Privacy preferences
    </button>
  );
}
