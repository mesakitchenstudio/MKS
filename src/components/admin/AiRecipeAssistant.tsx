"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { AiMergeMode } from "@/lib/ai-recipe/normalize";
import { isRecipeAiVerified } from "@/lib/ai-recipe/field-tracking";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";
import { youtubeVideoId } from "@/lib/youtube";

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

type PendingDraft = {
  draft: DraftPayload;
  meta: RecipeAiMeta;
};

type ApplyDialogKind = "initial" | "regenerate" | null;

function formatGenerateError(data: { error?: string; code?: string; detail?: string }) {
  if (data.code === "GEMINI_RATE_LIMIT") {
    return "Gemini daily quota reached for video analysis (free tier is about 20 requests per day per model). Wait until tomorrow, enable billing in Google AI Studio, or save the recipe — YouTube chapters import without Regenerate.";
  }
  const codeSuffix = data.code ? ` Error: ${data.code}` : "";
  const detailSuffix =
    data.detail && data.code !== "GEMINI_RATE_LIMIT"
      ? ` (${data.detail.length > 180 ? `${data.detail.slice(0, 180)}…` : data.detail})`
      : "";
  return `${data.error || "Could not generate a recipe draft."}${codeSuffix}${detailSuffix}`;
}

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

const PROGRESS_MESSAGES = [
  "Analyzing video — this can take 1–3 minutes…",
  "Extracting ingredients…",
  "Building instructions…",
  "Matching Mesa recipe fields…",
  "Preparing draft…",
];
const CLIENT_REQUEST_TIMEOUT_MS = 285_000;
const LONG_RUNNING_HINT_MS = 180_000;

export function AiRecipeAssistant({
  typeId,
  disabled,
  editorHasContent,
  youtubeUrl,
  onYoutubeUrlChange,
  linkedVideoId,
  aiMeta,
  onApply,
}: {
  typeId: string;
  disabled?: boolean;
  editorHasContent: boolean;
  youtubeUrl: string;
  onYoutubeUrlChange: (url: string) => void;
  linkedVideoId?: string | null;
  aiMeta: RecipeAiMeta | null;
  onApply: (payload: AiGenerateApplyPayload) => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState("");
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

  const primaryAction = useMemo(() => {
    if (isSameSourceVideo) {
      return { kind: "regenerate" as const, label: "Regenerate" };
    }
    if (isNewSourceVideo) {
      return { kind: "analyze_new" as const, label: "Analyze new video" };
    }
    return { kind: "analyze" as const, label: linkedVideoId ? "Analyze linked video & populate recipe" : "Analyze video & populate recipe" };
  }, [isNewSourceVideo, isSameSourceVideo, linkedVideoId]);

  useEffect(() => {
    if (!busy) {
      setProgressIndex(0);
      setShowLongRunningHint(false);
      return;
    }
    const progressTimer = window.setInterval(() => {
      setProgressIndex((current) => (current + 1) % PROGRESS_MESSAGES.length);
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
          ? "Video analysis timed out after about 5 minutes. Gemini may still be busy — wait a moment and try again, or save the recipe to import YouTube chapters without regenerating."
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

  async function runRegenerate() {
    if (!currentVideoId) {
      setError("Link a YouTube video or paste a cooking-video URL first.");
      return;
    }
    const draft = await fetchDraft(true);
    if (!draft) return;
    setPendingDraft(draft);
    setApplyDialog("regenerate");
  }

  function onPrimaryClick() {
    if (primaryAction.kind === "regenerate") {
      void runRegenerate();
      return;
    }
    void runInitialAnalyze(isNewSourceVideo);
  }

  return (
    <section className="border border-line bg-paper">
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${adminFocusRing}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
            AI recipe assistant
          </p>
          <p className="mt-1 text-sm text-muted">Generate recipe from a cooking video.</p>
        </div>
        <span className="text-sm font-semibold text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open ? (
        <div id={panelId} className="border-t border-line px-4 py-4">
          {linkedVideoId ? (
            <p className="text-sm text-muted">
              Using linked YouTube video{" "}
              <span className="font-mono text-xs text-ink">{linkedVideoId}</span>. Change the
              connection in Media if you need a different video.
            </p>
          ) : (
            <label className="grid gap-1.5 text-sm font-semibold text-ink">
              YouTube URL
              <input
                type="url"
                value={youtubeUrl}
                disabled={busy || disabled}
                onChange={(event) => onYoutubeUrlChange(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="h-10 rounded-sm border border-line bg-paper px-3 text-sm font-normal outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
              />
            </label>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || disabled || !currentVideoId}
              onClick={onPrimaryClick}
              className={`${adminPrimaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {primaryAction.label}
            </button>
          </div>

          {hasSuccessfulGeneration && isSameSourceVideo ? (
            <p className="mt-2 text-xs text-muted">
              Regenerate re-analyzes the full video with Gemini (1–5 minutes). YouTube chapters and
              duration import automatically when you save — no regenerate needed for those.
            </p>
          ) : null}

          {isNewSourceVideo ? (
            <p className="mt-2 text-xs text-muted">
              This URL points to a different video than the last successful AI analysis. Use Analyze new
              video to treat it as a new source.
            </p>
          ) : null}

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
                  Still working — large videos can take up to 5 minutes. You can refresh this page
                  to cancel; saving the recipe still imports YouTube chapters.
                </p>
              ) : null}
            </div>
          ) : null}

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
                <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={closeDialogs}>
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
                  className={`${secondaryBtn} ${adminFocusRing}`}
                  onClick={() => void confirmInitialAnalyze("replace_all_ai_fillable")}
                >
                  Replace all AI-fillable recipe fields
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-terracotta">
                Replace all AI-fillable recipe fields may overwrite existing recipe information in those
                fields.
              </p>
            </div>
          ) : null}

          {applyDialog === "regenerate" && pendingDraft ? (
            <div
              className="mt-4 rounded-sm border border-line bg-cream/50 px-3 py-3"
              role="dialog"
              aria-label="Apply regenerated AI draft"
            >
              <p className="text-sm font-semibold text-ink">A previous AI draft already exists.</p>
              <p className="mt-1 text-xs text-muted">Choose how to apply the new analysis.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={`${secondaryBtn} ${adminFocusRing}`} onClick={closeDialogs}>
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
                  className={`${secondaryBtn} ${adminFocusRing}`}
                  onClick={() => requestReplaceMode("replace_previous_ai")}
                  disabled={isRecipeAiVerified(aiMeta)}
                >
                  Replace previous AI-generated fields
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Replace previous AI-generated fields updates only AI-origin values you have not edited
                manually. Verified recipes keep human-approved values.
              </p>
            </div>
          ) : null}

          {destructiveReplaceOpen && pendingReplaceMode ? (
            <div
              className="mt-4 rounded-sm border border-terracotta/40 bg-terracotta/5 px-3 py-3"
              role="dialog"
              aria-label="Confirm overwrite of verified recipe information"
            >
              <p className="text-sm font-semibold text-ink">Overwrite verified recipe information?</p>
              <p className="mt-1 text-xs text-muted">
                This recipe has been marked verified. Replacing AI-fillable fields may overwrite
                human-approved values.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${secondaryBtn} ${adminFocusRing}`}
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
