"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { AuthOrDivider, GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import {
  authFocusRing,
  authInputClass,
  authLinkClass,
  authPrimaryButtonClass,
} from "@/lib/auth-ui";

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
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus?.();
    };
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
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
          setBusy(false);
          return;
        }
      }
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setError(
          mode === "signup"
            ? "Account created, but sign-in failed. Try signing in."
            : "Email or password is not correct.",
        );
        setBusy(false);
        return;
      }
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/45 p-3 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative my-auto max-h-[calc(100vh-1.5rem)] w-full max-w-[28.125rem] overflow-y-auto overscroll-contain rounded-sm border border-line bg-paper px-5 pb-5 pt-4 shadow-[0_1px_2px_rgba(42,34,24,0.06)] sm:max-h-[calc(100vh-2rem)] sm:px-6 sm:pb-6 sm:pt-5"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-sm text-[1.35rem] leading-none text-muted transition-colors duration-150 hover:text-ink ${authFocusRing}`}
        >
          <span aria-hidden>×</span>
        </button>

        <h2
          id={titleId}
          className="pr-10 font-serif text-[1.875rem] leading-tight text-ink md:text-[2rem]"
        >
          {mode === "signup" ? "Sign up" : "Sign in"}
        </h2>
        <p id={descriptionId} className="mt-1.5 text-sm leading-5 text-muted">
          {mode === "signup"
            ? "Create an account with your name, email, and password."
            : "Welcome back — sign in with your email or username and password."}
        </p>

        {error ? (
          <p role="alert" className="mt-2.5 text-sm leading-5 text-terracotta">
            {error}
          </p>
        ) : null}

        <form onSubmit={submit} className="mt-3.5 grid gap-3">
          {mode === "signup" ? (
            <label className="grid gap-1.5 text-sm font-semibold text-ink">
              Full name
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="e.g. Jane Smith"
                className={authInputClass}
              />
            </label>
          ) : null}

          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            Email or username
            <input
              required
              type="text"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@email.com"
              className={authInputClass}
            />
          </label>

          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            Password
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={authInputClass}
            />
          </label>

          {mode === "signin" ? (
            <p className="text-sm">
              <a href="/forgot-password" className={`rounded-sm ${authLinkClass} ${authFocusRing}`}>
                Forgot password?
              </a>
            </p>
          ) : null}

          {mode === "signup" ? (
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm leading-none text-muted">
              <input
                type="checkbox"
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
                className={`size-4 shrink-0 accent-olive ${authFocusRing}`}
              />
              <span className="leading-5">Notify me about new content</span>
            </label>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className={`${authPrimaryButtonClass} ${authFocusRing}`}
          >
            {busy
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
                ? "Sign up"
                : "Sign in"}
          </button>
        </form>

        <div className="my-3">
          <AuthOrDivider />
        </div>

        <GoogleAuthButton
          label={mode === "signup" ? "Sign up with Google" : "Sign in with Google"}
          callbackUrl={typeof window !== "undefined" ? window.location.href : "/"}
          onBeforeStart={() => {
            setError("");
            if (pendingLike) sessionStorage.setItem("mesa-pending-like", "1");
          }}
          unconfiguredMessage="Google sign-in needs a Google Cloud OAuth client. Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to .env, then restart the app."
        />

        <p className="mt-3 text-center text-sm leading-5 text-muted">
          {mode === "signup" ? (
            <>
              Have an account?{" "}
              <button
                type="button"
                className={`rounded-sm ${authLinkClass} ${authFocusRing}`}
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className={`rounded-sm ${authLinkClass} ${authFocusRing}`}
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
              >
                Sign up
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
