"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  adminFocusRing,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";
import type { SeriesAiMergeMode, SeriesAiMeta } from "@/lib/series-ai/types";

const secondaryBtn =
  "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function SeriesEditorialAiControls({
  seriesId,
  aiMeta,
  disabled = false,
  onMarkVerified,
}: {
  seriesId: string;
  aiMeta: SeriesAiMeta;
  disabled?: boolean;
  onMarkVerified?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showRegenChoices, setShowRegenChoices] = useState(false);
  const hasDraft = Boolean(aiMeta.generatedByAI);
  const unverified = hasDraft && aiMeta.verificationStatus !== "verified";

  async function run(mode: SeriesAiMergeMode) {
    setBusy(true);
    setError("");
    setShowRegenChoices(false);
    try {
      const response = await fetch("/api/admin/series/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, mode }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        draftStatus?: string;
      };
      if (!response.ok || !data.ok) {
        setError(data.error || "Could not generate editorial draft.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not generate editorial draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-sm border border-olive/30 bg-olive/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            {aiMeta.generatedByAI
              ? "AI editorial draft — review before publishing"
              : "Mesa editorial AI"}
          </p>
          <p className="mt-1 text-sm text-muted">
            Gemini drafts Series copy from playlist, video, and recipe data already in Mesa.
            Published stays manual.
          </p>
          {aiMeta.draftStatus ? (
            <p className="mt-1 text-xs font-semibold text-ink">
              Status:{" "}
              {aiMeta.draftStatus === "complete"
                ? "AI draft complete — still needs human review"
                : aiMeta.draftStatus === "needs_review"
                  ? "Needs review / some fields incomplete"
                  : aiMeta.draftStatus === "failed"
                    ? "Last generation failed"
                    : "Partial draft"}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasDraft ? (
            <button
              type="button"
              disabled={busy || disabled || !seriesId}
              className={`${adminPrimaryButtonClass} ${adminFocusRing} disabled:opacity-50`}
              onClick={() => void run("fill_empty")}
            >
              {busy ? "Generating…" : "Generate Mesa editorial draft"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || disabled || !seriesId}
              className={`${adminPrimaryButtonClass} ${adminFocusRing} disabled:opacity-50`}
              onClick={() => setShowRegenChoices((open) => !open)}
            >
              {busy ? "Generating…" : "Regenerate editorial draft"}
            </button>
          )}
        </div>
      </div>

      {showRegenChoices ? (
        <div className="flex flex-wrap gap-2 border-t border-olive/20 pt-3">
          <button
            type="button"
            className={`${secondaryBtn} ${adminFocusRing}`}
            disabled={busy}
            onClick={() => setShowRegenChoices(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${secondaryBtn} ${adminFocusRing}`}
            disabled={busy}
            onClick={() => void run("fill_empty")}
          >
            Fill empty fields only
          </button>
          <button
            type="button"
            className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
            disabled={busy}
            onClick={() => void run("replace_ai")}
          >
            Replace AI-generated fields
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-terracotta" role="alert">
          {error}
        </p>
      ) : null}
      {aiMeta.lastError && !error ? (
        <p className="text-sm text-terracotta" role="status">
          Previous attempt: {aiMeta.lastError}
        </p>
      ) : null}

      {hasDraft ? (
        <div className="rounded-sm border border-olive/25 bg-paper/80 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {unverified ? "AI draft generated — not verified" : "AI editorial — verified"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {unverified
                  ? "Review Mesa editorial fields below, then mark verified when ready to publish without a warning."
                  : "Human review recorded. You can still publish or update this series normally."}
              </p>
            </div>
            {unverified && onMarkVerified ? (
              <button
                type="button"
                className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
                onClick={onMarkVerified}
              >
                Mark Series verified
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SeriesAiFieldBadge({
  path,
  aiMeta,
}: {
  path: string;
  aiMeta: SeriesAiMeta;
}) {
  const provenance = aiMeta.fieldProvenance?.[path];
  if (!provenance?.aiGenerated) return null;
  if (provenance.humanModifiedAfterGeneration) {
    return (
      <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
        Edited
      </span>
    );
  }
  return (
    <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
      AI draft
    </span>
  );
}
