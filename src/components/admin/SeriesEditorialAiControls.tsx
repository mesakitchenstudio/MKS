"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminFocusRing, adminSecondaryButtonClass } from "@/lib/admin-ui";
import type { SeriesAiMergeMode, SeriesAiMeta } from "@/lib/series-ai/types";

export function seriesAiAssistanceSummary(aiMeta: SeriesAiMeta): string {
  const verified = aiMeta.verificationStatus === "verified";
  if (verified) {
    return "AI editorial · Verified by staff";
  }
  if (aiMeta.draftStatus === "complete") {
    return "AI draft · Review needed";
  }
  if (aiMeta.generatedByAI) {
    return "AI draft · Review needed";
  }
  if (aiMeta.draftStatus === "failed") {
    return "AI draft · Last generation failed";
  }
  if (aiMeta.draftStatus === "needs_review" || aiMeta.draftStatus === "partial") {
    return "AI draft · Review needed";
  }
  return "No AI editorial draft yet";
}

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
  const summary = seriesAiAssistanceSummary(aiMeta);

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
    <div className="space-y-3 border-y border-line/80 py-5">
      <div className="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div className="min-w-0 max-w-[72ch] flex-1">
          <p className="text-sm font-semibold text-ink">{summary}</p>
          <p className="mt-1 text-sm text-muted">
            Gemini drafts Series copy from playlist, video, and recipe data already in Mesa.
            Publication stays manual. Regenerating resets verification until staff review again.
          </p>
          {aiMeta.draftStatus === "complete" && aiMeta.verificationStatus === "verified" ? (
            <p className="mt-1 text-xs text-muted">
              Draft status remains complete after verification — these are separate records.
            </p>
          ) : null}
        </div>
        <div className="flex w-full shrink-0 flex-wrap gap-2 2xl:w-auto 2xl:justify-end">
          {!hasDraft ? (
            <button
              type="button"
              disabled={busy || disabled || !seriesId}
              className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11 w-full sm:w-auto disabled:opacity-50`}
              onClick={() => void run("fill_empty")}
            >
              {busy ? "Generating…" : "Generate Mesa editorial draft"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || disabled || !seriesId}
              className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11 w-full sm:w-auto disabled:opacity-50`}
              onClick={() => setShowRegenChoices((open) => !open)}
            >
              {busy ? "Generating…" : "Regenerate editorial draft"}
            </button>
          )}
        </div>
      </div>

      {showRegenChoices ? (
        <div className="flex flex-wrap gap-2 border-t border-line/60 pt-3">
          <button
            type="button"
            className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
            disabled={busy}
            onClick={() => setShowRegenChoices(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
            disabled={busy}
            onClick={() => void run("fill_empty")}
          >
            Fill empty fields only
          </button>
          <button
            type="button"
            className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
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

      {hasDraft && unverified && onMarkVerified ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Review Mesa editorial fields, then mark verified when ready to publish without a
            warning.
          </p>
          <button
            type="button"
            className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-11`}
            onClick={onMarkVerified}
          >
            Mark Series verified
          </button>
        </div>
      ) : null}
      {hasDraft && !unverified ? (
        <p className="text-sm text-muted">Human review recorded. You can publish or update normally.</p>
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
