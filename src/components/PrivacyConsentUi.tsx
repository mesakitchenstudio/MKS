"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { usePrivacyConsent } from "@/components/PrivacyConsentProvider";
import { authFocusRing } from "@/lib/auth-ui";

const focusRing = authFocusRing;

/** Shared primary actions — equal visual weight (no Accept bias). */
const choiceButtonClass = `inline-flex min-h-11 items-center justify-center border border-line bg-cream px-4 text-sm font-semibold text-ink transition-colors hover:border-ink/30 disabled:opacity-60 ${focusRing}`;

/** Secondary manage control — quieter than Accept/Reject. */
const manageButtonClass = `inline-flex min-h-11 items-center justify-center border border-transparent bg-transparent px-3 text-sm font-semibold text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-60 ${focusRing}`;

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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-4"
      role="region"
      aria-labelledby={headingId}
    >
      <div className="pointer-events-auto mx-auto flex max-w-5xl flex-col gap-3 border border-line bg-paper px-4 py-3 text-ink sm:px-5 sm:py-3.5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0 lg:max-w-2xl">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
            Privacy
          </p>
          <h2 id={headingId} className="mt-0.5 font-serif text-xl leading-snug text-ink sm:text-2xl">
            Your privacy
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-muted">
            Mesa uses essential technologies to keep the site working. With your permission, we
            also use optional analytics to understand how the site is used and Google sign-in
            enhancements to make signing in easier.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
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
            onClick={onManage}
            className={manageButtonClass}
          >
            Manage preferences
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
