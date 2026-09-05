"use client";

import { FormEvent, useState } from "react";
import { subscribeToNewsletter } from "@/lib/newsletter";

export function NewsletterForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    const result = await subscribeToNewsletter(email);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDone(true);
    setMessage(
      result.duplicate
        ? "You’re already on the list. We’ll write when there’s something good to cook."
        : "You’re on the list. We’ll be in touch when there’s something good to cook. 🎉",
    );
  }

  if (done && message) {
    return (
      <p className={tone === "dark" ? "text-sm text-sand" : "text-sm text-olive"} role="status">
        {message}
      </p>
    );
  }

  const inputId = `newsletter-${tone}`;

  return (
    <form
      onSubmit={onSubmit}
      className={
        tone === "dark"
          ? "flex flex-col gap-2 sm:flex-row sm:items-start"
          : "flex flex-col gap-2 sm:flex-row"
      }
      noValidate
    >
      <div className={tone === "dark" ? "min-w-0 flex-[1.45]" : "min-w-0 flex-1"}>
        <label className="sr-only" htmlFor={inputId}>
          Email address
        </label>
        <input
          id={inputId}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(null);
          }}
          placeholder="Your email"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={
            tone === "dark"
              ? "min-h-11 w-full rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-cream outline-none placeholder:text-sand/60 focus:border-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              : "min-h-11 w-full rounded-full border border-line bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
          }
        />
        {error ? (
          <p id={`${inputId}-error`} className="mt-1.5 text-xs text-terracotta" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="min-h-11 shrink-0 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Subscribing…" : "Subscribe"}
      </button>
    </form>
  );
}
