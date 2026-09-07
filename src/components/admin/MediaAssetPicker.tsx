"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  adminFocusRing,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import { mediaAssetDisplayTitle, type MediaAssetRecord } from "@/lib/media-asset";

type PickerAsset = Pick<
  MediaAssetRecord,
  "id" | "url" | "title" | "altText" | "kind" | "source" | "updatedAt"
>;

export function MediaAssetPickerButton({
  onSelect,
  label = "Choose from library",
}: {
  onSelect: (asset: PickerAsset) => void;
  label?: string;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assets, setAssets] = useState<PickerAsset[]>([]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setBusy(true);
      setError("");
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      void fetch(`/api/admin/media?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          const data = (await response.json()) as { assets?: PickerAsset[]; error?: string };
          if (!response.ok) throw new Error(data.error || "Could not load media.");
          setAssets(data.assets ?? []);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setError(err instanceof Error ? err.message : "Could not load media.");
          setAssets([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-line bg-paper shadow-lg"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 id={titleId} className="font-serif text-xl text-ink">
                  Media library
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Pick a registered asset. Storage bytes are unchanged.
                </p>
              </div>
              <button
                type="button"
                className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="border-b border-line px-4 py-3">
              <label className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold text-muted">Search</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Title, alt, URL…"
                  className="h-10 rounded-sm border border-line bg-paper px-3 text-sm text-ink"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {busy ? <p className="text-sm text-muted">Loading…</p> : null}
              {error ? (
                <p className="text-sm font-semibold text-terracotta" role="alert">
                  {error}
                </p>
              ) : null}
              {!busy && !error && assets.length === 0 ? (
                <p className="text-sm text-muted">
                  No active assets yet. Upload from Media or register a URL.
                </p>
              ) : null}
              <ul className="grid gap-2 sm:grid-cols-2">
                {assets.map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      className={`flex w-full gap-3 rounded-md border border-line bg-cream/30 p-2 text-left transition-colors hover:border-olive/50 ${adminFocusRing}`}
                      onClick={() => {
                        onSelect(asset);
                        setOpen(false);
                      }}
                    >
                      <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-sm bg-sand">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {mediaAssetDisplayTitle(asset)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {asset.altText || asset.kind}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-line px-4 py-3">
              <Link
                href="/admin/media"
                className={`${adminPrimaryButtonClass} ${adminFocusRing} inline-flex`}
              >
                Open Media library
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
