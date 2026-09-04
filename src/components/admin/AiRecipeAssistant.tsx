"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { AiMergeMode } from "@/lib/ai-recipe/normalize";
import { isRecipeAiVerified } from "@/lib/ai-recipe/field-tracking";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  adminFocusRing,
  adminSecondaryButtonClass,
  adminTertiaryButtonClass,
} from "@/lib/admin-ui";
import { youtubeVideoId } from "@/lib/youtube";
import { mergeTargetedFillIntoEditor } from "@/lib/ai-recipe/targeted-merge";
import type { MissingAiField } from "@/lib/ai-recipe/missing-fields";

type DraftPayload = {
  typeId: string;
  title: string;
  slug: string;
  excerpt: string;
  featured: boolean;
  seasonal: boolean;
  categoryIds: string[];
  values: Record<string, unknown>;
};

export type AiGenerateApplyPayload = {
  draft: DraftPayload;
  meta: RecipeAiMeta;
  mergeMode: AiMergeMode;
};

export type AiTargetedFillApplyPayload = {
  title?: string;
  excerpt: string;
  categoryIds?: string[];
  values: Record<string, unknown>;
  aiMeta: RecipeAiMeta | null;
};

type PendingDraft = {
  draft: DraftPayload;
  meta: RecipeAiMeta;
};

type ApplyDialogKind = "initial" | "regenerate" | null;

function formatGenerateError(data: { error?: string; code?: string; detail?: string }) {
  if (data.code === "GEMINI_RATE_LIMIT") {
    return "Gemini daily quota reached for video analysis (free tier is about 20 requests per day per model). Wait until tomorrow, enable billing in Google AI Studio, or save the recipe — YouTube chapters import without Reanalyze.";
  }
  const codeSuffix = data.code ? ` Error: ${data.code}` : "";
  const detailSuffix =
    data.detail && data.code !== "GEMINI_RATE_LIMIT"
      ? ` (${data.detail.length > 180 ? `${data.detail.slice(0, 180)}…` : data.detail})`
      : "";
  return `${data.error || "Could not generate a recipe draft."}${codeSuffix}${detailSuffix}`;
}

const PROGRESS_MESSAGES = [
  "Analyzing video — this can take 1–3 minutes…",
  "Extracting ingredients…",
  "Building instructions…",
  "Matching Mesa recipe fields…",
  "Preparing draft…",
];
const CLIENT_REQUEST_TIMEOUT_MS = 285_000;
const LONG_RUNNING_HINT_MS = 180_000;
const FILL_TIMEOUT_MS = 55_000;

export function AiRecipeAssistant({
  typeId,
  recipeId,
  disabled,
  editorHasContent,
  youtubeUrl,
  onYoutubeUrlChange,
  linkedVideoId,
  aiMeta,
  current,
  missingCount,
  missingFields = [],
  blockingMissingCount = 0,
  aiFillableCount,
  needsReviewCount = 0,
  confirmedCount = 0,
  fromVideoCount = 0,
  onApply,
  onTargetedFill,
  onReviewEstimated,
  onMarkVerified,
  onDownloadJson,
  onNavigateMissing,
  onNavigateReview,
}: {
  typeId: string;
  recipeId?: string;
  disabled?: boolean;
  editorHasContent: boolean;
  youtubeUrl: string;
  onYoutubeUrlChange: (url: string) => void;
  linkedVideoId?: string | null;
  aiMeta: RecipeAiMeta | null;
  current: {
    title: string;
    slug: string;
    excerpt: string;
    categoryIds?: string[];
    values: Record<string, unknown>;
  };
  missingCount: number;
  missingFields?: MissingAiField[];
  blockingMissingCount?: number;
  aiFillableCount?: number;
  needsReviewCount?: number;
  confirmedCount?: number;
  fromVideoCount?: number;
  onApply: (payload: AiGenerateApplyPayload) => void;
  onTargetedFill: (payload: AiTargetedFillApplyPayload) => void;
  onReviewEstimated?: () => void;
  onMarkVerified?: () => void;
  onDownloadJson?: () => void;
  onNavigateMissing?: () => void;
  onNavigateReview?: () => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fillBusy, setFillBusy] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState("");
  const [fillMessage, setFillMessage] = useState("");
  const [applyDialog, setApplyDialog] = useState<ApplyDialogKind>(null);
  const [verifyConfirmOpen, setVerifyConfirmOpen] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
  const [destructiveReplaceOpen, setDestructiveReplaceOpen] = useState(false);
  const [pendingReplaceMode, setPendingReplaceMode] = useState<AiMergeMode | null>(null);
  const [fillPreviewOpen, setFillPreviewOpen] = useState(false);
  const [selectedFillPaths, setSelectedFillPaths] = useState<string[]>([]);
  const [showLongRunningHint, setShowLongRunningHint] = useState(false);

  const currentVideoId = useMemo(
    () => linkedVideoId || youtubeVideoId(youtubeUrl.trim()),
    [linkedVideoId, youtubeUrl],
  );
  const lastVideoId = useMemo(
    () => aiMeta?.sourceVideoId || youtubeVideoId(aiMeta?.sourceUrl || "") || "",
    [aiMeta?.sourceVideoId, aiMeta?.sourceUrl],
  );
  const hasSuccessfulGeneration = Boolean(aiMeta?.generatedByAI && aiMeta.generatedAt);
  const isSameSourceVideo = Boolean(
    hasSuccessfulGeneration && currentVideoId && lastVideoId && currentVideoId === lastVideoId,
  );
  const isNewSourceVideo = Boolean(
    hasSuccessfulGeneration && currentVideoId && lastVideoId && currentVideoId !== lastVideoId,
  );

  const fillEligibleCount = aiFillableCount ?? missingCount;

  const statusSummary = (
    <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {blockingMissingCount > 0 ? (
        onNavigateMissing ? (
          <button
            type="button"
            onClick={onNavigateMissing}
            className={`font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
          >
            {blockingMissingCount} missing
          </button>
        ) : (
          <span>{blockingMissingCount} missing</span>
        )
      ) : null}
      {blockingMissingCount > 0 && needsReviewCount > 0 ? <span>·</span> : null}
      {needsReviewCount > 0 ? (
        onNavigateReview ? (
          <button
            type="button"
            onClick={onNavigateReview}
            className={`font-semibold text-ink underline-offset-2 hover:underline ${adminFocusRing}`}
          >
            {needsReviewCount} need review
          </button>
        ) : (
          <span>{needsReviewCount} need review</span>
        )
      ) : null}
      {(blockingMissingCount > 0 || needsReviewCount > 0) && confirmedCount > 0 ? <span>·</span> : null}
      {confirmedCount > 0 ? <span>{confirmedCount} confirmed</span> : null}
      {!blockingMissingCount && !needsReviewCount && !confirmedCount && fromVideoCount > 0 ? (
        <span>{fromVideoCount} from video</span>
      ) : null}
    </span>
  );

  function handleMarkStaffVerified() {
    if (blockingMissingCount > 0) return;
    if (needsReviewCount > 0) {
      setVerifyConfirmOpen(true);
      return;
    }
    onMarkVerified?.();
  }

  function confirmMarkStaffVerified() {
    setVerifyConfirmOpen(false);
    onMarkVerified?.();
  }

  useEffect(() => {
    if (!busy) {
      setProgressIndex(0);
      setShowLongRunningHint(false);
      return;
    }
    const progressTimer = window.setInterval(() => {
      setProgressIndex((currentIndex) => (currentIndex + 1) % PROGRESS_MESSAGES.length);
    }, 3200);
    const hintTimer = window.setTimeout(() => setShowLongRunningHint(true), LONG_RUNNING_HINT_MS);
    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(hintTimer);
    };
  }, [busy]);

  function closeDialogs() {
    setApplyDialog(null);
    setPendingDraft(null);
    setDestructiveReplaceOpen(false);
    setPendingReplaceMode(null);
  }

  async function fetchDraft(forceRefresh: boolean): Promise<PendingDraft | null> {
    setBusy(true);
    setShowLongRunningHint(false);
    setError("");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_REQUEST_TIMEOUT_MS);
    try {
      const effectiveUrl =
        youtubeUrl.trim() ||
        (currentVideoId ? `https://www.youtube.com/watch?v=${currentVideoId}` : "");
      const response = await fetch("/api/admin/recipes/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: effectiveUrl,
          typeId,
          forceRefresh,
        }),
        signal: controller.signal,
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        detail?: string;
        draft?: DraftPayload;
        meta?: RecipeAiMeta;
      };
      if (!response.ok || !data.ok || !data.draft || !data.meta) {
        setError(formatGenerateError(data));
        return null;
      }
      return { draft: data.draft, meta: data.meta };
    } catch (fetchError) {
      const aborted = fetchError instanceof DOMException && fetchError.name === "AbortError";
      const timedOut =
        aborted ||
        fetchError instanceof TypeError ||
        (fetchError instanceof Error &&
          /failed to fetch|network|timeout|aborted/i.test(fetchError.message));
      setError(
        timedOut
          ? "Video analysis timed out after about 5 minutes. Gemini may still be busy — wait a moment and try again, or save the recipe to import YouTube chapters without reanalyzing."
          : "Network error while contacting the AI assistant.",
      );
      return null;
    } finally {
      window.clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  function applyDraft(draft: PendingDraft, mergeMode: AiMergeMode) {
    onApply({ draft: draft.draft, meta: draft.meta, mergeMode });
    closeDialogs();
  }

  function requestReplaceMode(mode: AiMergeMode) {
    const needsDestructiveConfirm =
      mode === "replace_all_ai_fillable" && isRecipeAiVerified(aiMeta);
    if (needsDestructiveConfirm) {
      setPendingReplaceMode(mode);
      setDestructiveReplaceOpen(true);
      return;
    }
    if (!pendingDraft) return;
    applyDraft(pendingDraft, mode);
  }

  async function runInitialAnalyze(forceRefresh: boolean) {
    if (!currentVideoId) {
      setError("Link a YouTube video or paste a cooking-video URL first.");
      return;
    }

    if (editorHasContent) {
      setApplyDialog("initial");
      return;
    }

    const draft = await fetchDraft(forceRefresh);
    if (!draft) return;
    applyDraft(draft, "fill_empty");
  }

  async function confirmInitialAnalyze(mergeMode: AiMergeMode) {
    if (mergeMode === "replace_all_ai_fillable" && isRecipeAiVerified(aiMeta)) {
      setPendingReplaceMode(mergeMode);
      setDestructiveReplaceOpen(true);
      return;
    }
    setApplyDialog(null);
    const draft = await fetchDraft(isNewSourceVideo);
    if (!draft) return;
    applyDraft(draft, mergeMode);
  }

  async function runReanalyzeFullVideo() {
    if (!currentVideoId) {
      setError("Link a YouTube video or paste a cooking-video URL first.");
      return;
    }
    const draft = await fetchDraft(true);
    if (!draft) return;
    setPendingDraft(draft);
    setApplyDialog("regenerate");
  }

  useEffect(() => {
    if (fillPreviewOpen) {
      setSelectedFillPaths(missingFields.map((field) => field.path));
    }
  }, [fillPreviewOpen, missingFields]);

  async function runFillMissing() {
    setFillBusy(true);
    setError("");
    setFillMessage("");
    setFillPreviewOpen(false);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FILL_TIMEOUT_MS);
    try {
      const effectiveUrl =
        youtubeUrl.trim() ||
        (currentVideoId ? `https://www.youtube.com/watch?v=${currentVideoId}` : "");
      const response = await fetch("/api/admin/recipes/ai-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeId,
          recipeId,
          youtubeUrl: effectiveUrl || undefined,
          mode: "missing",
          fields: selectedFillPaths.length ? selectedFillPaths : undefined,
          current: {
            ...current,
            categoryIds: current.categoryIds ?? [],
          },
          aiMeta,
        }),
        signal: controller.signal,
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        requestedPaths?: string[];
        draft?: { excerpt: string; values: Record<string, unknown> };
        confidenceByPath?: RecipeAiMeta["confidenceByPath"];
      };
      if (!response.ok || !data.ok || !data.draft) {
        setError(
          data.error ||
            "AI could not complete the missing fields. Existing recipe content was not changed.",
        );
        return;
      }
      if (!(data.requestedPaths && data.requestedPaths.length)) {
        setFillMessage("No eligible missing fields to fill.");
        return;
      }
      const merged = mergeTargetedFillIntoEditor({
        current: {
          ...current,
          categoryIds: current.categoryIds ?? [],
        },
        draft: data.draft,
        requestedPaths: data.requestedPaths,
        confidenceByPath: data.confidenceByPath ?? {},
        aiMeta,
      });
      onTargetedFill(merged);
      setFillMessage(`Filled ${data.requestedPaths.length} field(s). Review before publishing.`);
    } catch {
      setError("AI could not complete the missing fields. Existing recipe content was not changed.");
    } finally {
      window.clearTimeout(timeoutId);
      setFillBusy(false);
    }
  }

  const anyBusy = busy || fillBusy;

  return (
    <section className="border-b border-line/70 pb-4">
      <button
        type="button"
        className={`flex w-full items-start justify-between gap-3 py-1 text-left ${adminFocusRing}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            AI recipe assistant
          </p>
          <p className="mt-1 text-sm text-muted">
            {blockingMissingCount > 0 || needsReviewCount > 0 || confirmedCount > 0 || fromVideoCount > 0
              ? statusSummary
              : "Ready for review"}
          </p>
        </div>
        <span className="shrink-0 pt-0.5 text-xs font-semibold text-muted/70">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open ? (
        <div id={panelId} className="mt-3 space-y-3">
          {linkedVideoId ? (
            <p className="text-sm text-muted">
              Using linked YouTube video{" "}
              <span className="font-mono text-xs text-ink">{linkedVideoId}</span>.
            </p>
          ) : (
            <label className="grid gap-1.5 text-sm font-semibold text-ink">
              YouTube URL
              <input
                type="url"
                value={youtubeUrl}
                disabled={anyBusy || disabled}
                onChange={(event) => onYoutubeUrlChange(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="h-10 rounded-sm border border-line bg-paper px-3 text-sm font-normal outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
              />
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={anyBusy || disabled || !typeId || fillEligibleCount === 0}
              onClick={() => setFillPreviewOpen((open) => !open)}
              className={`${adminSecondaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {fillBusy
                ? "Filling missing fields…"
                : fillEligibleCount > 0
                  ? `Fill ${fillEligibleCount} missing field${fillEligibleCount === 1 ? "" : "s"}`
                  : "Fill missing fields"}
            </button>
            {aiMeta?.generatedByAI && onReviewEstimated ? (
              <button
                type="button"
                className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                onClick={onReviewEstimated}
              >
                Review inferred fields
              </button>
            ) : null}
            {!hasSuccessfulGeneration || isNewSourceVideo ? (
              <button
                type="button"
                disabled={anyBusy || disabled || !currentVideoId}
                onClick={() => void runInitialAnalyze(isNewSourceVideo)}
                className={`${adminSecondaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isNewSourceVideo ? "Analyze new video" : "Analyze linked video"}
              </button>
            ) : null}
            {aiMeta?.generatedByAI &&
            aiMeta.verificationStatus !== "verified" &&
            onMarkVerified ? (
              <button
                type="button"
                className={`${adminTertiaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
                disabled={blockingMissingCount > 0}
                title={
                  blockingMissingCount > 0
                    ? "Resolve all required missing fields before verifying this recipe."
                    : undefined
                }
                onClick={handleMarkStaffVerified}
              >
                Mark staff verified
              </button>
            ) : null}
          </div>

          {fillPreviewOpen && missingFields.length ? (
            <div className="rounded-sm border border-olive/25 bg-olive/5 px-3 py-3">
              <p className="text-sm font-semibold text-ink">
                Fill {selectedFillPaths.length || missingFields.length} missing field
                {(selectedFillPaths.length || missingFields.length) === 1 ? "" : "s"}
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                {missingFields.map((field) => {
                  const checked = selectedFillPaths.includes(field.path);
                  return (
                    <li key={field.path}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedFillPaths((current) =>
                              event.target.checked
                                ? [...current, field.path]
                                : current.filter((path) => path !== field.path),
                            );
                          }}
                        />
                        {field.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={anyBusy || disabled || selectedFillPaths.length === 0}
                  onClick={() => void runFillMissing()}
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                >
                  Confirm fill
                </button>
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => setFillPreviewOpen(false)}
                >
                  Cancel
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Level 2 — uses existing recipe context only. Populated fields are not replaced.
              </p>
            </div>
          ) : null}

          <details className="group/ai-advanced">
            <summary
              className={`cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-muted marker:content-none [&::-webkit-details-marker]:hidden ${adminFocusRing}`}
            >
              Advanced{" "}
              <span className="font-normal normal-case tracking-normal text-muted/70 group-open/ai-advanced:hidden">
                ▾
              </span>
              <span className="hidden font-normal normal-case tracking-normal text-muted/70 group-open/ai-advanced:inline">
                ▴
              </span>
            </summary>
            <div className="mt-2 space-y-2 border-t border-line/60 pt-2">
              <button
                type="button"
                disabled={anyBusy || disabled || !currentVideoId}
                onClick={() => void runReanalyzeFullVideo()}
                className={`${adminSecondaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                Reanalyze full video
              </button>
              <p className="text-xs text-muted">
                Full re-analysis sends the video to Gemini and can take 1–5 minutes. Use Fill missing
                fields for quick metadata updates.
              </p>
              {onDownloadJson ? (
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={onDownloadJson}
                >
                  Download AI JSON
                </button>
              ) : null}
            </div>
          </details>

          {busy ? (
            <div className="space-y-1" role="status" aria-live="polite">
              <p className="flex items-center gap-2 text-sm text-muted">
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-olive"
                  aria-hidden
                />
                {PROGRESS_MESSAGES[progressIndex]}
              </p>
              {showLongRunningHint ? (
                <p className="text-xs text-muted">
                  Still working — large videos can take up to 5 minutes.
                </p>
              ) : null}
            </div>
          ) : null}

          {fillMessage ? <p className="text-sm text-olive">{fillMessage}</p> : null}

          {error ? (
            <p className="text-sm font-semibold text-terracotta" role="alert">
              {error}
            </p>
          ) : null}

          <p className="text-xs leading-relaxed text-muted/80">
            AI-generated recipe information must be reviewed before publishing.
          </p>

          {applyDialog === "initial" ? (
            <div
              className="rounded-sm border border-line bg-cream/50 px-3 py-3"
              role="dialog"
              aria-label="Apply AI draft to existing recipe"
            >
              <p className="text-sm font-semibold text-ink">This recipe already contains information.</p>
              <p className="mt-1 text-xs text-muted">Choose how to apply the AI draft.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={closeDialogs}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => void confirmInitialAnalyze("fill_empty")}
                >
                  Fill empty fields only
                </button>
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => void confirmInitialAnalyze("replace_all_ai_fillable")}
                >
                  Replace all AI-fillable recipe fields
                </button>
              </div>
            </div>
          ) : null}

          {applyDialog === "regenerate" && pendingDraft ? (
            <div
              className="rounded-sm border border-line bg-cream/50 px-3 py-3"
              role="dialog"
              aria-label="Apply reanalyzed AI draft"
            >
              <p className="text-sm font-semibold text-ink">Full video re-analysis is ready.</p>
              <p className="mt-1 text-xs text-muted">Choose how to apply the new analysis.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={closeDialogs}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => applyDraft(pendingDraft, "fill_empty")}
                >
                  Fill empty fields only
                </button>
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => requestReplaceMode("replace_previous_ai")}
                  disabled={isRecipeAiVerified(aiMeta)}
                >
                  Replace previous AI-generated fields
                </button>
              </div>
            </div>
          ) : null}

          {destructiveReplaceOpen && pendingReplaceMode ? (
            <div
              className="rounded-sm border border-terracotta/40 bg-terracotta/5 px-3 py-3"
              role="dialog"
              aria-label="Confirm overwrite of verified recipe information"
            >
              <p className="text-sm font-semibold text-ink">Overwrite verified recipe information?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => {
                    setDestructiveReplaceOpen(false);
                    setPendingReplaceMode(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => {
                    if (pendingDraft && pendingReplaceMode) {
                      applyDraft(pendingDraft, pendingReplaceMode);
                      return;
                    }
                    void (async () => {
                      setDestructiveReplaceOpen(false);
                      setApplyDialog(null);
                      const draft = await fetchDraft(isNewSourceVideo);
                      if (draft && pendingReplaceMode) {
                        applyDraft(draft, pendingReplaceMode);
                      }
                      setPendingReplaceMode(null);
                    })();
                  }}
                >
                  Replace anyway
                </button>
              </div>
            </div>
          ) : null}

          {verifyConfirmOpen ? (
            <div
              className="rounded-sm border border-line bg-cream/40 px-3 py-3"
              role="dialog"
              aria-label="Confirm staff verification"
            >
              <p className="text-sm font-semibold text-ink">
                {needsReviewCount} AI-generated field{needsReviewCount === 1 ? "" : "s"} still need review.
              </p>
              <p className="mt-1 text-sm text-muted">
                Continue reviewing or confirm the remaining fields as staff verified?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={() => setVerifyConfirmOpen(false)}
                >
                  Keep reviewing
                </button>
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={confirmMarkStaffVerified}
                >
                  Confirm staff verified
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
