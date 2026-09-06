"use client";

import { FormEvent, useId, useState } from "react";
import {
  authFocusRing,
  authInputClass,
  authLabelClass,
} from "@/lib/auth-ui";

export function ContactForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const errorId = useId();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") || ""),
          email: String(data.get("email") || ""),
          message: String(data.get("message") || ""),
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || !payload.ok) {
        setError(payload.message || "We could not send your note. Please try again.");
        setLoading(false);
        return;
      }
      setDone(true);
    } catch {
      setError("We could not send your note. Please try again.");
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div
        className="border border-line bg-paper px-5 py-6 text-sm leading-7 text-ink"
        role="status"
      >
        <p className="font-semibold text-ink">Thanks for writing to us.</p>
        <p className="mt-2 text-muted">We&apos;ll get back to you as soon as we can.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate={false}>
      <label className={authLabelClass}>
        Name
        <input
          required
          name="name"
          autoComplete="name"
          className={authInputClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      <label className={authLabelClass}>
        Email
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          className={authInputClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      <label className={authLabelClass}>
        Message
        <textarea
          required
          name="message"
          rows={6}
          className={`${authInputClass} h-auto min-h-[9rem] py-3`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </label>
      {error ? (
        <p id={errorId} className="text-sm leading-6 text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className={`inline-flex min-h-11 w-full items-center justify-center rounded-full bg-terracotta px-6 text-sm font-semibold text-paper transition-[color,transform,background-color] duration-150 hover:bg-terracotta-dark active:scale-[0.995] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${authFocusRing}`}
      >
        {loading ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
