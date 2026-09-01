"use client";

import { useId, useState } from "react";
import { authFocusRing, authInputClass } from "@/lib/auth-ui";

export function PasswordField({
  id,
  name,
  label = "Password",
  value,
  onChange,
  autoComplete,
  minLength,
  requirement,
  error,
  describedBy,
}: {
  id?: string;
  name?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  minLength?: number;
  requirement?: string;
  error?: string;
  describedBy?: string;
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const requirementId = `${inputId}-requirement`;
  const errorId = error ? `${inputId}-error` : undefined;
  const [visible, setVisible] = useState(false);
  const describedIds = [requirement ? requirementId : null, errorId, describedBy]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-1.5 text-sm font-semibold text-ink">
      <label htmlFor={inputId}>{label}</label>
      <div className="relative">
        <input
          id={inputId}
          name={name}
          required
          type={visible ? "text" : "password"}
          minLength={minLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedIds || undefined}
          className={`${authInputClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className={`absolute right-1 top-1/2 inline-flex h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-sm px-2 text-xs font-semibold text-muted transition-colors hover:text-ink ${authFocusRing}`}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {requirement ? (
        <p id={requirementId} className="text-xs font-normal leading-5 text-muted">
          {requirement}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-normal leading-5 text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
