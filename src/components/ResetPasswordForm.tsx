"use client";

import Link from "next/link";
import { useState } from "react";
import { completePasswordResetAction } from "@/app/account/reset-actions";
import { PasswordField } from "@/components/auth/PasswordField";
import {
  MEMBER_PASSWORD_MIN_LENGTH,
  MEMBER_PASSWORD_REQUIREMENT,
} from "@/lib/auth-credentials";
import { authFocusRing, authLinkClass, authPrimaryButtonClass } from "@/lib/auth-ui";

export function ResetPasswordForm({
  kind,
  token,
  error,
}: {
  kind: "admin" | "member";
  token: string;
  error?: string;
}) {
  const minLength = kind === "admin" ? 10 : MEMBER_PASSWORD_MIN_LENGTH;
  const requirement =
    kind === "admin" ? "At least 10 characters" : MEMBER_PASSWORD_REQUIREMENT;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const message =
    error === "match"
      ? "Those passwords did not match."
      : error === "short"
        ? `Use at least ${minLength} characters.`
        : error
          ? "This reset link isn't valid anymore. It may have expired or already been used."
          : "";

  return (
    <div className="mx-auto max-w-md border border-line bg-paper p-8">
      <h1 className="font-serif text-3xl">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">Choose a new password for your account.</p>
      {message ? (
        <p className="mt-4 text-sm text-terracotta" role="alert">
          {message}
        </p>
      ) : null}
      {error && error !== "match" && error !== "short" ? (
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className={`font-semibold ${authLinkClass} ${authFocusRing}`}>
            Request a new reset link
          </Link>
        </p>
      ) : null}
      <form action={completePasswordResetAction} className="mt-6 grid gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="kind" value={kind} />
        <PasswordField
          name="password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={minLength}
          requirement={requirement}
        />
        <PasswordField
          name="confirm"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          minLength={minLength}
        />
        <button type="submit" className={`${authPrimaryButtonClass} ${authFocusRing}`}>
          Update password
        </button>
      </form>
    </div>
  );
}
