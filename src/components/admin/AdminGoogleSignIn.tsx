"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function AdminGoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startGoogle() {
    setError("");
    setBusy(true);
    try {
      const providers = (await fetch("/api/auth/providers").then((res) => res.json())) as {
        google?: unknown;
      };
      if (!providers?.google) {
        setBusy(false);
        setError("Google sign-in is not configured on this site yet.");
        return;
      }
      await signIn("google", { callbackUrl: "/admin/session" });
    } catch {
      setBusy(false);
      setError("Google sign-in did not start. Try again.");
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void startGoogle()}
        className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-terracotta disabled:opacity-70"
      >
        {busy ? "Redirecting to Google…" : "Sign in with Google"}
      </button>
      {error ? <p className="text-sm text-terracotta">{error}</p> : null}
    </div>
  );
}
