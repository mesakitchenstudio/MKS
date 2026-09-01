"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { PasswordField } from "@/components/auth/PasswordField";
import { AuthOrDivider, GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import {
  EMAIL_CONSENT_HELPER,
  EMAIL_CONSENT_LABEL,
  MEMBER_EXISTING_ACCOUNT_API_ERROR,
  MEMBER_EXISTING_ACCOUNT_MESSAGE,
  MEMBER_PASSWORD_MIN_LENGTH,
  MEMBER_PASSWORD_REQUIREMENT,
  MEMBER_WRONG_CREDENTIALS_MESSAGE,
  PRIVACY_ACKNOWLEDGMENT,
  SIGNUP_SUBTITLE,
  validateSignupFields,
} from "@/lib/auth-credentials";
import { FORGOT_PASSWORD_GENERIC_MESSAGE } from "@/lib/reset-password";
import {
  authFocusRing,
  authInputClass,
  authLinkClass,
  authPrimaryButtonClass,
} from "@/lib/auth-ui";

type AuthMode = "signup" | "signin" | "forgot";

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  identifier?: string;
};

export function AuthModal({
  onClose,
  onSignedIn,
  pendingLike = false,
}: {
  onClose: () => void;
  onSignedIn: () => void;
  pendingLike?: boolean;
}) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [notify, setNotify] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  function switchMode(next: AuthMode) {
    setMode(next);
    setFormError("");
    setFieldErrors({});
    setExistingAccount(false);
    setForgotSent(false);
    if (next === "forgot") {
      setIdentifier(email.trim() || identifier);
    }
  }

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const main = document.getElementById("main-content");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (main) main.setAttribute("inert", "");

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
      if (main) main.removeAttribute("inert");
      previousFocus.current?.focus?.();
    };
  }, [onClose]);

  async function submitSignUp(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    setExistingAccount(false);

    const validation = validateSignupFields({ name, email, password });
    if (validation) {
      setFieldErrors({ [validation.field]: validation.message });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, notify }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        if (
          response.status === 409 ||
          data.error === MEMBER_EXISTING_ACCOUNT_API_ERROR ||
          data.error?.includes("already exists")
        ) {
          setExistingAccount(true);
          setFormError(MEMBER_EXISTING_ACCOUNT_MESSAGE);
        } else if (data.error?.toLowerCase().includes("valid email")) {
          setFieldErrors({ email: "Enter a valid email." });
        } else {
          setFormError(data.error || "Couldn't create your account. Try again.");
        }
        setBusy(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setFormError("Account created, but sign-in failed. Try signing in.");
        setBusy(false);
        return;
      }
      onSignedIn();
    } catch {
      setFormError("Check your connection and try again.");
      setBusy(false);
    }
  }

  async function submitSignIn(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});

    if (!email.trim()) {
      setFieldErrors({ email: "Enter your email or username." });
      return;
    }
    if (!password) {
      setFieldErrors({ password: "Enter your password." });
      return;
    }

    setBusy(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setFormError(MEMBER_WRONG_CREDENTIALS_MESSAGE);
        setBusy(false);
        return;
      }
      onSignedIn();
    } catch {
      setFormError("Check your connection and try again.");
      setBusy(false);
    }
  }

  async function submitForgot(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});
    if (!identifier.trim()) {
      setFieldErrors({ identifier: "Enter your email or username." });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      if (!response.ok) {
        setFormError("Check your connection and try again.");
        setBusy(false);
        return;
      }
      setForgotSent(true);
      setBusy(false);
    } catch {
      setFormError("Check your connection and try again.");
      setBusy(false);
    }
  }

  const title =
    mode === "signup" ? "Sign up" : mode === "signin" ? "Sign in" : "Forgot password";
  const description =
    mode === "signup"
      ? SIGNUP_SUBTITLE
      : mode === "signin"
        ? "Welcome back — sign in with your email or username and password."
        : "Enter the email or username on the account. If we find it, we will send a reset link.";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-ink/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${formError || forgotSent ? statusId : ""}`.trim()}
        className="relative my-0 flex max-h-[min(100dvh,100vh)] w-full max-w-[28.125rem] flex-col overflow-hidden rounded-none border border-line bg-paper shadow-[0_1px_2px_rgba(42,34,24,0.06)] sm:my-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-sm"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close sign-in dialog"
            className={`absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-sm text-[1.35rem] leading-none text-muted transition-colors duration-150 hover:text-ink ${authFocusRing}`}
          >
            <span aria-hidden>×</span>
          </button>

          <h2
            id={titleId}
            className="pr-12 font-serif text-[1.875rem] leading-tight text-ink md:text-[2rem]"
          >
            {title}
          </h2>
          <p id={descriptionId} className="mt-1.5 text-sm leading-5 text-muted">
            {description}
          </p>

          {formError ? (
            <p id={statusId} role="alert" className="mt-2.5 text-sm leading-5 text-terracotta">
              {formError}
              {existingAccount ? (
                <>
                  {" "}
                  <button
                    type="button"
                    className={`rounded-sm font-semibold underline ${authFocusRing}`}
                    onClick={() => switchMode("signin")}
                  >
                    Sign in
                  </button>
                </>
              ) : null}
            </p>
          ) : null}

          {forgotSent ? (
            <p id={statusId} role="status" className="mt-3 text-sm leading-6 text-olive">
              {FORGOT_PASSWORD_GENERIC_MESSAGE}
            </p>
          ) : null}

          {mode === "signup" ? (
            <form onSubmit={submitSignUp} className="mt-3.5 grid gap-3" noValidate>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="e.g. Jane Smith"
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={fieldErrors.name ? "auth-name-error" : undefined}
                  className={authInputClass}
                />
                {fieldErrors.name ? (
                  <span id="auth-name-error" className="text-xs font-normal text-terracotta" role="alert">
                    {fieldErrors.name}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@email.com"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
                  className={authInputClass}
                />
                {fieldErrors.email ? (
                  <span id="auth-email-error" className="text-xs font-normal text-terracotta" role="alert">
                    {fieldErrors.email}
                  </span>
                ) : null}
              </label>

              <PasswordField
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                minLength={MEMBER_PASSWORD_MIN_LENGTH}
                requirement={MEMBER_PASSWORD_REQUIREMENT}
                error={fieldErrors.password}
              />

              <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-muted">
                <input
                  type="checkbox"
                  checked={notify}
                  onChange={(event) => setNotify(event.target.checked)}
                  className={`mt-0.5 size-4 shrink-0 accent-olive ${authFocusRing}`}
                />
                <span>
                  <span className="font-semibold text-ink">{EMAIL_CONSENT_LABEL}</span>
                  <span className="mt-0.5 block text-xs leading-5">{EMAIL_CONSENT_HELPER}</span>
                </span>
              </label>

              <p className="text-xs leading-5 text-muted">
                {PRIVACY_ACKNOWLEDGMENT}{" "}
                <Link href="/privacy" className={`font-semibold ${authLinkClass} ${authFocusRing}`}>
                  Privacy Policy
                </Link>
              </p>

              <button
                type="submit"
                disabled={busy}
                aria-busy={busy}
                className={`${authPrimaryButtonClass} ${authFocusRing}`}
              >
                {busy ? "Creating account…" : "Sign up"}
              </button>
            </form>
          ) : null}

          {mode === "signin" ? (
            <form onSubmit={submitSignIn} className="mt-3.5 grid gap-3" noValidate>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Email or username
                <input
                  required
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@email.com"
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={fieldErrors.email ? "auth-signin-id-error" : undefined}
                  className={authInputClass}
                />
                {fieldErrors.email ? (
                  <span id="auth-signin-id-error" className="text-xs font-normal text-terracotta" role="alert">
                    {fieldErrors.email}
                  </span>
                ) : null}
              </label>

              <PasswordField
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                error={fieldErrors.password}
              />

              <p className="text-sm">
                <button
                  type="button"
                  className={`rounded-sm ${authLinkClass} ${authFocusRing}`}
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </button>
              </p>

              <button
                type="submit"
                disabled={busy}
                aria-busy={busy}
                className={`${authPrimaryButtonClass} ${authFocusRing}`}
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          ) : null}

          {mode === "forgot" && !forgotSent ? (
            <form onSubmit={submitForgot} className="mt-3.5 grid gap-3" noValidate>
              <label className="grid gap-1.5 text-sm font-semibold text-ink">
                Email or username
                <input
                  required
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  aria-invalid={fieldErrors.identifier ? true : undefined}
                  aria-describedby={fieldErrors.identifier ? "auth-forgot-id-error" : undefined}
                  className={authInputClass}
                />
                {fieldErrors.identifier ? (
                  <span id="auth-forgot-id-error" className="text-xs font-normal text-terracotta" role="alert">
                    {fieldErrors.identifier}
                  </span>
                ) : null}
              </label>

              <button
                type="submit"
                disabled={busy}
                aria-busy={busy}
                className={`${authPrimaryButtonClass} ${authFocusRing}`}
              >
                {busy ? "Sending reset link…" : "Send reset link"}
              </button>
            </form>
          ) : null}

          {mode !== "forgot" ? (
            <>
              <div className="my-3">
                <AuthOrDivider />
              </div>

              <GoogleAuthButton
                label="Continue with Google"
                callbackUrl={typeof window !== "undefined" ? window.location.href : "/"}
                onBeforeStart={() => {
                  setFormError("");
                  if (pendingLike) sessionStorage.setItem("mesa-pending-like", "1");
                }}
                unconfiguredMessage="Google sign-in needs a Google Cloud OAuth client. Add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to .env, then restart the app."
              />
            </>
          ) : null}

          <p className="mt-3 text-center text-sm leading-5 text-muted">
            {mode === "signup" ? (
              <>
                Have an account?{" "}
                <button
                  type="button"
                  className={`rounded-sm ${authLinkClass} ${authFocusRing}`}
                  onClick={() => switchMode("signin")}
                >
                  Sign in
                </button>
              </>
            ) : mode === "signin" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className={`rounded-sm ${authLinkClass} ${authFocusRing}`}
                  onClick={() => switchMode("signup")}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`rounded-sm ${authLinkClass} ${authFocusRing}`}
                  onClick={() => switchMode("signin")}
                >
                  Back to sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
