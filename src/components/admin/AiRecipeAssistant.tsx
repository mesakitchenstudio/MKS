"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { AiMergeMode } from "@/lib/ai-recipe/normalize";
import { isRecipeAiVerified } from "@/lib/ai-recipe/field-tracking";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  adminFocusRing,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
} from "@/lib/admin-ui";
import { youtubeVideoId } from "@/lib/youtube";
import { mergeTargetedFillIntoEditor } from "@/lib/ai-recipe/targeted-merge";

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
  excerpt: string;
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
  onApply,
  onTargetedFill,
  onReviewEstimated,
  onMarkVerified,
  onDownloadJson,
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
    values: Record<string, unknown>;
  };
  missingCount: number;
  onApply: (payload: AiGenerateApplyPayload) => void;
  onTargetedFill: (payload: AiTargetedFillApplyPayload) => void;
  onReviewEstimated?: () => void;
  onMarkVerified?: () => void;
  onDownloadJson?: () => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fillBusy, setFillBusy] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState("");
  const [fillMessage, setFillMessage] = useState("");
  const [applyDialog, setApplyDialog] = useState<ApplyDialogKind>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
  const [destructiveReplaceOpen, setDestructiveReplaceOpen] = useState(false);
  const [pendingReplaceMode, setPendingReplaceMode] = useState<AiMergeMode | null>(null);
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

  const summary = aiMeta?.summary;
  const verified = summary?.verified ?? 0;
  const inferred = summary?.inferred ?? 0;

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

  async function runFillMissing() {
    setFillBusy(true);
    setError("");
    setFillMessage("");
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
          current,
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
        current,
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
    <section className="border border-line bg-paper">
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${adminFocusRing}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            AI recipe assistant
          </p>
          <p className="mt-1 text-sm text-muted">
            {verified} verified · {inferred} inferred · {missingCount} missing
          </p>
        </div>
        <span className="text-sm font-semibold text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div id={panelId} className="border-t border-line px-4 py-4">
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

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={anyBusy || disabled || !typeId}
              onClick={() => void runFillMissing()}
              className={`${adminSecondaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {fillBusy ? "Filling missing fields…" : "Fill missing fields"}
            </button>
            {!hasSuccessfulGeneration || isNewSourceVideo ? (
              <button
                type="button"
                disabled={anyBusy || disabled || !currentVideoId}
                onClick={() => void runInitialAnalyze(isNewSourceVideo)}
                className={`${adminPrimaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isNewSourceVideo ? "Analyze new video" : "Analyze linked video"}
              </button>
            ) : null}
          </div>

          {aiMeta?.generatedByAI ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {onReviewEstimated ? (
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={onReviewEstimated}
                >
                  Review inferred fields
                </button>
              ) : null}
              {aiMeta.verificationStatus !== "verified" && onMarkVerified ? (
                <button
                  type="button"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
                  onClick={onMarkVerified}
                >
                  Mark recipe verified
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 border-t border-line/80 pt-3">
            <button
              type="button"
              className={`text-xs font-semibold uppercase tracking-[0.12em] text-muted ${adminFocusRing}`}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              Advanced {advancedOpen ? "▴" : "▾"}
            </button>
            {advancedOpen ? (
              <div className="mt-2 space-y-2">
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
            ) : null}
          </div>

          {busy ? (
            <div className="mt-3 space-y-1" role="status" aria-live="polite">
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

          {fillMessage ? <p className="mt-3 text-sm text-olive">{fillMessage}</p> : null}

          {error ? (
            <p className="mt-3 text-sm font-semibold text-terracotta" role="alert">
              {error}
            </p>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-muted">
            AI-generated recipe information must be reviewed before publishing.
          </p>

          {applyDialog === "initial" ? (
            <div
              className="mt-4 rounded-sm border border-line bg-cream/50 px-3 py-3"
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
                  className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
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
              className="mt-4 rounded-sm border border-line bg-cream/50 px-3 py-3"
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
                  className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
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
              className="mt-4 rounded-sm border border-terracotta/40 bg-terracotta/5 px-3 py-3"
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
                  className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
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
        </div>
      ) : null}
    </section>
  );
}
