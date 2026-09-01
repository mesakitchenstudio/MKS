"use client";

import { useState } from "react";
import { EMAIL_CONSENT_LABEL } from "@/lib/auth-credentials";
import { authFocusRing, authPrimaryButtonClass } from "@/lib/auth-ui";

export function EmailUpdatesPreference({ initialNotify }: { initialNotify: boolean }) {
  const [notify, setNotify] = useState(initialNotify);
  const [savedNotify, setSavedNotify] = useState(initialNotify);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function savePreference(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const response = await fetch("/api/account/notify", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify }),
      });
      const data = (await response.json()) as { error?: string; notify?: boolean };
      if (!response.ok) {
        setError(data.error || "Could not update your preference.");
        setBusy(false);
        return;
      }
      setSavedNotify(Boolean(data.notify));
      setNotify(Boolean(data.notify));
      setStatus("Email update preference saved.");
      setBusy(false);
    } catch {
      setError("Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 border-t border-line pt-7 md:mt-8 md:pt-8">
      <h2 className="font-serif text-3xl text-ink">Email updates</h2>
      <form onSubmit={savePreference} className="mt-4 max-w-xl space-y-4">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-muted">
          <input
            type="checkbox"
            checked={notify}
            onChange={(event) => setNotify(event.target.checked)}
            className={`mt-0.5 size-4 shrink-0 accent-olive ${authFocusRing}`}
          />
          <span className="font-semibold text-ink">{EMAIL_CONSENT_LABEL}</span>
        </label>
        <button
          type="submit"
          disabled={busy || notify === savedNotify}
          aria-busy={busy}
          className={`${authPrimaryButtonClass} max-w-xs ${authFocusRing}`}
        >
          {busy ? "Saving…" : "Save preference"}
        </button>
        {status ? (
          <p role="status" className="text-sm text-olive">
            {status}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-terracotta">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
