"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

export function AuthModal({
  onClose,
  onSignedIn,
  pendingLike = false,
}: {
  onClose: () => void;
  onSignedIn: () => void;
  pendingLike?: boolean;
}) {
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);

  async function startGoogle() {
    setError("");
    setGoogleBusy(true);
    if (pendingLike) {
      sessionStorage.setItem("mesa-pending-like", "1");
    }
    try {
      const providers = (await fetch("/api/auth/providers").then((res) => res.json())) as {
        google?: unknown;
      };
      if (!providers?.google) {
        setGoogleBusy(false);
        setError(
          "Google sign-in needs a Google Cloud OAuth client. Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to .env, then restart the app.",
        );
        return;
      }
      await signIn("google", { callbackUrl: window.location.href });
    } catch {
      setGoogleBusy(false);
      setError("Could not start Google sign-in. Please try again.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (mode === "signup") {
        const response = await fetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, notify }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(data.error || "Could not create account.");
          return;
        }
      }
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(mode === "signup" ? "Account created, but sign-in failed. Try signing in." : "Email or password is not correct.");
        return;
      }
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-sm bg-paper shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-end bg-olive px-4 py-3">
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-paper">
            ×
          </button>
        </div>

        <div className="px-8 pb-8 pt-6">
          <h2 className="text-2xl font-bold text-ink">{mode === "signup" ? "Sign up" : "Sign in"}</h2>
          <p className="mt-2 text-sm text-ink">
            {mode === "signup"
              ? "Enter your email and password below to create your account"
              : "Welcome back — enter your email and password"}
          </p>

          {error ? <p className="mt-4 text-sm text-terracotta">{error}</p> : null}

          <form onSubmit={submit} className="mt-6 grid gap-4">
            {mode === "signup" ? (
              <label className="relative block">
                <span className="absolute -top-2 left-3 bg-paper px-1 text-xs text-muted">Full Name</span>
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="w-full rounded-sm border-2 border-olive px-3 py-3 text-sm outline-none"
                />
              </label>
            ) : null}
            <input
              required
              type="text"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email or username"
              className="w-full rounded-sm border border-line px-3 py-3 text-sm outline-none focus:border-olive"
            />
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              className="w-full rounded-sm border border-line px-3 py-3 text-sm outline-none focus:border-olive"
            />
            {mode === "signin" ? (
              <p className="text-sm">
                <a href="/forgot-password" className="font-semibold text-olive">
                  Forgot password?
                </a>
              </p>
            ) : null}

            {mode === "signup" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) => setNotify(event.target.checked)}
                  className="h-4 w-4 accent-olive"
                />
                Notify me about new content
              </label>
            ) : null}

            <button
              type="submit"
              className="w-full bg-olive py-3 text-sm font-bold uppercase tracking-wide text-paper hover:bg-olive-dark"
            >
              {mode === "signup" ? "Sign up" : "Sign in"}
            </button>
          </form>

          <p className="my-4 text-center text-xs uppercase tracking-widest text-muted">Or</p>

          <button
            type="button"
            disabled={googleBusy}
            onClick={startGoogle}
            className="flex w-full items-center bg-[#4285F4] text-sm font-semibold text-white disabled:opacity-80"
          >
            <span className="flex h-11 w-11 items-center justify-center bg-white">
              <GoogleMark />
            </span>
            <span className="flex-1 py-3 pr-11 text-center">
              {googleBusy
                ? "Redirecting to Google…"
                : `Sign ${mode === "signup" ? "up" : "in"} with Google`}
            </span>
          </button>

          <p className="mt-6 text-center text-sm">
            {mode === "signup" ? (
              <>
                <span className="font-bold">Have an account? </span>
                <button type="button" className="font-bold text-olive" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </>
            ) : (
              <>
                <span className="font-bold">New here? </span>
                <button type="button" className="font-bold text-olive" onClick={() => setMode("signup")}>
                  Sign up
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
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
