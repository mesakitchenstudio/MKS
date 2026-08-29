"use client";

import { useEffect, useId, useState } from "react";
import type { AiMergeMode } from "@/lib/ai-recipe/normalize";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";

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

const secondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-not-allowed disabled:opacity-60";

const PROGRESS_MESSAGES = [
  "Analyzing video and preparing recipe…",
  "Extracting ingredients…",
  "Building instructions…",
  "Matching Mesa recipe fields…",
  "Preparing draft…",
];

export function AiRecipeAssistant({
  typeId,
  disabled,
  editorHasContent,
  onApply,
}: {
  typeId: string;
  disabled?: boolean;
  editorHasContent: boolean;
  onApply: (payload: AiGenerateApplyPayload) => void;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(true);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState("");
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [pendingForceRefresh, setPendingForceRefresh] = useState(false);

  useEffect(() => {
    if (!busy) {
      setProgressIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setProgressIndex((current) => (current + 1) % PROGRESS_MESSAGES.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function runGenerate(mergeMode: AiMergeMode, forceRefresh = false) {
    setBusy(true);
    setError("");
    setOverwriteOpen(false);
    try {
      const response = await fetch("/api/admin/recipes/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeUrl: youtubeUrl.trim(),
          typeId,
          forceRefresh,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        draft?: DraftPayload;
        meta?: RecipeAiMeta;
      };
      if (!response.ok || !data.ok || !data.draft || !data.meta) {
        setError(data.error || "Could not generate a recipe draft.");
        return;
      }
      onApply({ draft: data.draft, meta: data.meta, mergeMode });
    } catch {
      setError("Network error while contacting the AI assistant.");
    } finally {
      setBusy(false);
    }
  }

  function onAnalyzeClick(forceRefresh = false) {
    if (!youtubeUrl.trim()) {
      setError("Paste a YouTube cooking-video URL first.");
      return;
    }
    if (editorHasContent) {
      setPendingForceRefresh(forceRefresh);
      setOverwriteOpen(true);
      return;
    }
    void runGenerate("fill_empty", forceRefresh);
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
          <label className="grid gap-1.5 text-sm font-semibold text-ink">
            YouTube URL
            <input
              type="url"
              value={youtubeUrl}
              disabled={busy || disabled}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="h-10 rounded-sm border border-line bg-paper px-3 text-sm font-normal outline-none focus:border-olive focus:ring-2 focus:ring-olive/15"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => onAnalyzeClick(false)}
              className={`${adminPrimaryButtonClass} ${adminFocusRing} disabled:cursor-not-allowed disabled:opacity-60`}
            >
              Analyze video & populate recipe
            </button>
            <button
              type="button"
              disabled={busy || disabled || !youtubeUrl.trim()}
              onClick={() => onAnalyzeClick(true)}
              className={`${secondaryBtn} ${adminFocusRing}`}
              title="Ignore cache and regenerate"
            >
              Regenerate
            </button>
          </div>

          {busy ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
              <span
                className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-olive"
                aria-hidden
              />
              {PROGRESS_MESSAGES[progressIndex]}
            </p>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm font-semibold text-terracotta" role="alert">
              {error}
            </p>
          ) : null}

          <p className="mt-3 text-xs leading-relaxed text-muted">
            AI-generated recipe information must be reviewed before publishing.
          </p>

          {overwriteOpen ? (
            <div
              className="mt-4 rounded-sm border border-line bg-cream/50 px-3 py-3"
              role="dialog"
              aria-label="Overwrite existing recipe fields"
            >
              <p className="text-sm font-semibold text-ink">This recipe already contains information.</p>
              <p className="mt-1 text-xs text-muted">Choose how to apply the AI draft.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${secondaryBtn} ${adminFocusRing}`}
                  onClick={() => setOverwriteOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
                  onClick={() => void runGenerate("fill_empty", pendingForceRefresh)}
                >
                  Fill empty fields only
                </button>
                <button
                  type="button"
                  className={`${secondaryBtn} ${adminFocusRing}`}
                  onClick={() => void runGenerate("replace", pendingForceRefresh)}
                >
                  Replace AI-fillable fields
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
