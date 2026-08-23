"use client";

import { FormEvent, useState } from "react";

export function NewsletterForm({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    const key = "mesa-newsletter";
    const existing = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    localStorage.setItem(key, JSON.stringify([...new Set([...existing, email.trim()])]));
    setDone(true);
  }

  if (done) {
    return (
      <p className={tone === "dark" ? "text-sm text-sand" : "text-sm text-olive"}>
        You are on the list. We will write when there is something good to cook.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor={`newsletter-${tone}`}>
        Email address
      </label>
      <input
        id={`newsletter-${tone}`}
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Your email"
        className={
          tone === "dark"
            ? "min-w-0 flex-1 rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-cream outline-none placeholder:text-sand/50 focus:border-terracotta"
            : "min-w-0 flex-1 rounded-full border border-line bg-paper px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-terracotta"
        }
      />
      <button
        type="submit"
        className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark"
      >
        Subscribe
      </button>
    </form>
  );
}
