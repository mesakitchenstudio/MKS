"use client";

import { useState } from "react";

export function AdminPhotoField({
  name = "photoUrl",
  defaultValue = "",
}: {
  name?: string;
  defaultValue?: string;
}) {
  const [url, setUrl] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File) {
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("file", file);
    body.set("folder", "admins");
    try {
      const response = await fetch("/api/admin/upload", { method: "POST", body });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Could not upload photo.");
      }
      setUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-center">
      <input type="hidden" name={name} value={url} />
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-line bg-sand">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Photo</span>
        )}
      </div>
      <div className="grid gap-2">
        <label className="cursor-pointer text-sm font-semibold text-terracotta hover:underline">
          {busy ? "Uploading…" : url ? "Change profile photo" : "Upload profile photo"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
        </label>
        <p className="text-xs leading-5 text-muted">
          Shown on recipe comment replies. Google sign-in sets this by default; square photos work
          best for custom uploads.
        </p>
        {url ? (
          <button
            type="button"
            onClick={() => setUrl("")}
            className="justify-self-start text-xs font-semibold text-muted hover:text-terracotta"
          >
            Remove photo
          </button>
        ) : null}
        {error ? <p className="text-xs text-terracotta">{error}</p> : null}
      </div>
    </div>
  );
}
