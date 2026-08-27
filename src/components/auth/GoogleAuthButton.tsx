"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { authFocusRing, authGoogleButtonClass } from "@/lib/auth-ui";

export function GoogleMark({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.4c-.3 1.5-1.2 2.8-2.5 3.6v3h4.1c2.4-2.2 3.5-5.4 3.5-8.7z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-4.1-3c-1.1.8-2.6 1.2-3.9 1.2-3 0-5.6-2-6.5-4.7H1.3v3.1C3.3 21.3 7.4 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.5 14.6c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.3H1.3C.5 8.9 0 10.4 0 12.5s.5 3.6 1.3 5.2l4.2-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0 7.4 0 3.3 2.7 1.3 6.7l4.2 3.1C6.4 6.8 9 4.8 12 4.8z"
      />
    </svg>
  );
}

export function GoogleAuthButton({
  label,
  callbackUrl,
  onBeforeStart,
  unconfiguredMessage = "Google sign-in is not configured on this site yet.",
}: {
  label: string;
  callbackUrl: string;
  onBeforeStart?: () => void;
  unconfiguredMessage?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startGoogle() {
    setError("");
    setBusy(true);
    onBeforeStart?.();
    try {
      const providers = (await fetch("/api/auth/providers").then((res) => res.json())) as {
        google?: unknown;
      };
      if (!providers?.google) {
        setBusy(false);
        setError(unconfiguredMessage);
        return;
      }
      await signIn("google", { callbackUrl });
    } catch {
      setBusy(false);
      setError("Could not start Google sign-in. Please try again.");
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void startGoogle()}
        className={`${authGoogleButtonClass} ${authFocusRing}`}
      >
        <span className="inline-flex items-center gap-3">
          <GoogleMark />
          {busy ? "Redirecting to Google…" : label}
        </span>
      </button>
      {error ? (
        <p role="alert" className="text-sm leading-6 text-terracotta">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AuthOrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">
        Or
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
