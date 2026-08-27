"use client";

import { FormEvent, useState } from "react";

export function ContactForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      <p className="border border-line bg-paper p-6 text-sm leading-6 text-olive" role="status">
        Thank you. We read every note — if we can help, we will write back.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        Name
        <input
          required
          name="name"
          autoComplete="name"
          className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Email
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Message
        <textarea
          required
          name="message"
          rows={5}
          className="rounded-sm border border-line bg-paper px-3 py-2 outline-none focus:border-terracotta"
        />
      </label>
      {error ? (
        <p className="text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={loading}
        className="justify-self-start rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
