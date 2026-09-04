"use client";

import { useEffect, useMemo, useState } from "react";
import { useInstructionVideoWorkspaceOptional } from "@/components/admin/InstructionVideoWorkspaceContext";
import {
  applySelectedChapterSuggestions,
  computeDefaultChapterSuggestionSelections,
  countSelectedSuggestions,
  isChapterSuggestionBatchStale,
  selectionForIndex,
  toggleSuggestionSelection,
} from "@/lib/ai-recipe/chapter-suggestions/apply";
import { timestampComparisonLabel } from "@/lib/ai-recipe/chapter-suggestions/build";
import type {
  ChapterSuggestionBatch,
  ChapterSuggestionCapability,
  ChapterSuggestionMode,
  ChapterSuggestionSelection,
} from "@/lib/ai-recipe/chapter-suggestions/types";
import type { FieldSource } from "@/lib/ai-recipe/field-state";
import { isFieldLocked, resolveFieldReviewState } from "@/lib/ai-recipe/field-state";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  formatTimestampInput,
  hasCanonicalStartTimestamp,
  formatInstructionChapterCoverageSummary,
  instructionChapterCoverage,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import { adminFocusRing, adminPrimaryButtonClass } from "@/lib/admin-ui";

const quietBtn = `text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`;

export function ChapterTimestampSuggestionsPanel({
  groups,
  typeId,
  youtubeUrl,
  title,
  values,
  aiMeta,
  videoDurationSeconds,
  onApplySuggestions,
}: {
  groups: InstructionGroupWithChapters[];
  typeId: string;
  youtubeUrl?: string;
  title: string;
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
  videoDurationSeconds?: number;
  onApplySuggestions: (input: {
    groups: InstructionGroupWithChapters[];
    provenancePaths: Record<
      string,
      {
        source: FieldSource;
        value: unknown;
        chapterSuggestionSource?: import("@/lib/ai-recipe/chapter-suggestions/types").ChapterSuggestionSource;
      }
    >;
  }) => void;
}) {
  const videoWorkspace = useInstructionVideoWorkspaceOptional();
  const [mode, setMode] = useState<ChapterSuggestionMode>("missing");
  const [batch, setBatch] = useState<ChapterSuggestionBatch | null>(null);
  const [capability, setCapability] = useState<ChapterSuggestionCapability>("titles");
  const [selections, setSelections] = useState<ChapterSuggestionSelection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const coverageSummary = useMemo(() => {
    const coverage = instructionChapterCoverage(groups);
    return formatInstructionChapterCoverageSummary(coverage);
  }, [groups]);

  const stale = batch ? isChapterSuggestionBatchStale(batch, groups) : false;

  useEffect(() => {
    if (!typeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/admin/recipes/ai-chapter-suggestions/capability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            typeId,
            youtubeUrl,
            current: { title, values },
            aiMeta,
          }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          capability?: ChapterSuggestionCapability;
        };
        if (!cancelled && response.ok && payload.ok && payload.capability) {
          setCapability(payload.capability);
        }
      } catch {
        // Keep default titles capability when probe fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [typeId, youtubeUrl, title, values, aiMeta]);

  const primaryActionLabel = useMemo(() => {
    if (busy) {
      return capability === "ai_video" ? "Analyzing video…" : "Suggesting…";
    }
    switch (capability) {
      case "youtube_chapters":
        return "✦ Suggest timestamps";
      case "ai_video":
        return "✦ Analyze video for chapters";
      default:
        return "✦ Suggest chapter titles";
    }
  }, [busy, capability]);

  const panelHeading = useMemo(() => {
    if (!batch?.diagnostics?.suggestionKind) {
      switch (capability) {
        case "youtube_chapters":
          return "Source: YouTube chapters";
        case "ai_video":
          return "AI video chapter suggestions";
        default:
          return "AI chapter title suggestions";
      }
    }
    switch (batch.diagnostics.suggestionKind) {
      case "ai_video_timestamps":
        return "AI video chapter suggestions";
      case "timestamps":
        return "Source: YouTube chapters";
      default:
        return "AI chapter title suggestions";
    }
  }, [batch, capability]);

  function suggestionSourceLabel(
    source: import("@/lib/ai-recipe/chapter-suggestions/types").ChapterSuggestionSource,
  ): string | null {
    if (source === "ai_video") return "AI video analysis";
    if (source === "youtube_chapter_hint") return "YouTube description";
    if (source === "cached_video") return "Cached video analysis";
    if (source === "stage_alignment") return "Stage alignment";
    return null;
  }

  async function generateSuggestions(
    nextMode: ChapterSuggestionMode = mode,
    options?: { forceRefresh?: boolean; titlesOnly?: boolean },
  ) {
    setBusy(true);
    setError(null);
    setApplyError(null);
    try {
      const response = await fetch("/api/admin/recipes/ai-chapter-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeId,
          youtubeUrl,
          mode: nextMode,
          forceRefresh: options?.forceRefresh === true,
          titlesOnly: options?.titlesOnly === true,
          current: {
            title,
            values,
          },
          aiMeta,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        stage?: string;
        suggestions?: ChapterSuggestionBatch["suggestions"];
        requestId?: string;
        generatedAt?: string;
        snapshotFingerprint?: string;
        mode?: ChapterSuggestionMode;
        diagnostics?: ChapterSuggestionBatch["diagnostics"];
        timestampEvidenceAvailable?: boolean;
        videoTemporalAnalysisAvailable?: boolean;
        capability?: ChapterSuggestionCapability;
      };
      if (!response.ok || !payload.ok || !payload.suggestions) {
        setBatch(null);
        setSelections([]);
        setError(
          payload.error ??
            "Couldn't generate timestamp suggestions. Your recipe was not changed.",
        );
        return;
      }
      const nextBatch: ChapterSuggestionBatch = {
        requestId: payload.requestId ?? crypto.randomUUID(),
        generatedAt: payload.generatedAt ?? new Date().toISOString(),
        mode: payload.mode ?? nextMode,
        instructionSnapshotFingerprint: payload.snapshotFingerprint ?? "",
        suggestions: payload.suggestions,
        diagnostics: payload.diagnostics,
      };
      setBatch(nextBatch);
      setMode(nextMode);
      if (payload.capability) {
        setCapability(payload.capability);
      } else if (payload.diagnostics?.capability) {
        setCapability(payload.diagnostics.capability);
      } else if (payload.diagnostics?.suggestionKind === "ai_video_timestamps") {
        setCapability("ai_video");
      } else if (payload.timestampEvidenceAvailable || payload.diagnostics?.timestampEvidenceAvailable) {
        setCapability("youtube_chapters");
      }
      setSelections(
        computeDefaultChapterSuggestionSelections({
          suggestions: nextBatch.suggestions,
          groups,
          aiMeta,
        }),
      );
    } catch {
      setError("Couldn't generate timestamp suggestions. Your recipe was not changed.");
      setBatch(null);
      setSelections([]);
    } finally {
      setBusy(false);
    }
  }

  function handleDiscard() {
    setBatch(null);
    setSelections([]);
    setError(null);
    setApplyError(null);
  }

  function handleApplySelected() {
    if (!batch || stale) {
      setApplyError(
        "Instruction sections changed after suggestions were generated. Generate suggestions again.",
      );
      return;
    }
    const result = applySelectedChapterSuggestions({
      groups,
      batch,
      selections,
      aiMeta,
      videoDurationSeconds,
    });
    if (!result.ok) {
      setApplyError(result.message);
      return;
    }
    onApplySuggestions({
      groups: result.groups,
      provenancePaths: result.provenancePaths,
    });
    handleDiscard();
  }

  function playSuggestion(seconds: number, sectionIndex: number) {
    videoWorkspace?.seekAndPlay(seconds, sectionIndex);
  }

  const selectedCount = countSelectedSuggestions(selections);

  return (
    <div className="mb-4 border-b border-line/70 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-sm text-ink" data-testid="chapter-mapping-summary">
          {coverageSummary}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {!batch ? (
            <>
              <button
                type="button"
                disabled={busy || !typeId}
                className={quietBtn}
                onClick={() => void generateSuggestions("missing")}
              >
                {busy ? "Suggesting…" : primaryActionLabel}
              </button>
              <button
                type="button"
                disabled={busy || !typeId}
                className={quietBtn}
                onClick={() => void generateSuggestions("all")}
              >
                Review all sections
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                className={quietBtn}
                onClick={() =>
                  void generateSuggestions(mode, {
                    forceRefresh: capability === "ai_video" || batch?.diagnostics?.suggestionKind === "ai_video_timestamps",
                  })
                }
              >
                {capability === "ai_video" || batch?.diagnostics?.suggestionKind === "ai_video_timestamps"
                  ? "Re-analyze video"
                  : "Try again"}
              </button>
              <button type="button" className={quietBtn} onClick={handleDiscard}>
                Discard suggestions
              </button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-semibold text-terracotta" role="alert">
            {error}
          </p>
          {capability === "ai_video" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className={quietBtn}
                onClick={() => void generateSuggestions(mode, { forceRefresh: true })}
              >
                Try again
              </button>
              <button
                type="button"
                disabled={busy}
                className={quietBtn}
                onClick={() => void generateSuggestions(mode, { titlesOnly: true })}
              >
                Suggest chapter titles instead
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {batch ? (
        <div className="mt-3 border-t border-line/70 pt-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
            {panelHeading}
          </p>
          {stale ? (
            <p className="mt-2 text-xs font-semibold text-terracotta" role="alert">
              Instruction sections changed after suggestions were generated. Generate suggestions
              again.
            </p>
          ) : null}
          <ul className="mt-2 space-y-3">
            {batch.suggestions.map((suggestion) => {
              const group = groups[suggestion.instructionIndex];
              if (!group) return null;
              const hasCanonical = hasCanonicalStartTimestamp(group);
              const currentStart = hasCanonical ? group.startTimestamp : undefined;
              const startPath = `values.instructions.${suggestion.instructionIndex}.startTimestamp`;
              const labelPath = `values.instructions.${suggestion.instructionIndex}.chapterLabel`;
              const startLocked = isFieldLocked(startPath, aiMeta ?? null);
              const labelLocked = isFieldLocked(labelPath, aiMeta ?? null);
              const startReview = resolveFieldReviewState(startPath, aiMeta ?? null);
              const selection = selectionForIndex(selections, suggestion.instructionIndex);
              const comparison = timestampComparisonLabel(currentStart, suggestion.startTimestamp);
              const noCheckbox =
                suggestion.status === "no_evidence" ||
                suggestion.status === "conflict" ||
                suggestion.startTimestamp == null;
              const applyStartDisabled =
                startLocked ||
                stale ||
                suggestion.status !== "suggested" ||
                (hasCanonical &&
                  (startReview === "edited" ||
                    startReview === "confirmed" ||
                    startReview === "locked"));

              return (
                <li
                  key={`${suggestion.instructionIndex}-${suggestion.sectionFingerprint}`}
                  className="border-b border-line/50 pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {suggestion.instructionIndex + 1} {suggestion.sectionTitle}
                      </p>
                      <div className="mt-1 grid gap-0.5 text-xs text-muted">
                        <p>
                          Current:{" "}
                          <span className="font-semibold tabular-nums text-ink">
                            {currentStart != null
                              ? formatTimestampInput(currentStart)
                              : "Timestamp missing"}
                          </span>
                        </p>
                        {suggestion.startTimestamp != null ? (
                          <p>
                            Suggested:{" "}
                            <span className="font-semibold tabular-nums text-ink">
                              {formatTimestampInput(suggestion.startTimestamp)}
                            </span>
                            {comparison ? (
                              <span className="ml-1 text-muted">· {comparison}</span>
                            ) : null}
                          </p>
                        ) : suggestion.status === "no_evidence" ? (
                          <p className="font-semibold text-muted">
                            {suggestion.reason ?? "No reliable timestamp suggestion"}
                          </p>
                        ) : (
                          <p className="font-semibold text-muted">No reliable timestamp suggestion</p>
                        )}
                        {suggestion.confidence ? (
                          <p className="capitalize">{suggestion.confidence} confidence</p>
                        ) : null}
                        {suggestionSourceLabel(suggestion.source) ? (
                          <p>Source: {suggestionSourceLabel(suggestion.source)}</p>
                        ) : null}
                        {suggestion.evidence ? (
                          <p className="leading-relaxed">{suggestion.evidence}</p>
                        ) : null}
                        {suggestion.conflictReason ? (
                          <p className="font-semibold text-terracotta">{suggestion.conflictReason}</p>
                        ) : null}
                      </div>
                    </div>
                    {suggestion.startTimestamp != null ? (
                      <button
                        type="button"
                        className={`shrink-0 text-xs font-semibold tabular-nums text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
                        onClick={() =>
                          playSuggestion(suggestion.startTimestamp!, suggestion.instructionIndex)
                        }
                      >
                        ▶ Preview
                      </button>
                    ) : null}
                  </div>
                  {!noCheckbox ? (
                    <div className="mt-2 flex flex-col gap-1">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(selection?.applyStart)}
                          disabled={applyStartDisabled}
                          onChange={(event) =>
                            setSelections((current) =>
                              toggleSuggestionSelection(
                                current,
                                suggestion.instructionIndex,
                                "applyStart",
                                event.target.checked,
                              ),
                            )
                          }
                        />
                        <span>
                          Apply start {formatTimestampInput(suggestion.startTimestamp!)}
                          {applyStartDisabled && hasCanonical ? " (existing timestamp protected)" : ""}
                          {startLocked ? " (locked)" : ""}
                        </span>
                      </label>
                      {suggestion.suggestedChapterLabel &&
                      suggestion.suggestedChapterLabel !==
                        String(group.chapterLabel ?? "").trim() ? (
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={Boolean(selection?.applyChapterLabel)}
                            disabled={labelLocked || stale}
                            onChange={(event) =>
                              setSelections((current) =>
                                toggleSuggestionSelection(
                                  current,
                                  suggestion.instructionIndex,
                                  "applyChapterLabel",
                                  event.target.checked,
                                ),
                              )
                            }
                          />
                          <span>
                            Chapter label &ldquo;{suggestion.suggestedChapterLabel}&rdquo;
                            {labelLocked ? " (locked)" : ""}
                          </span>
                        </label>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {applyError ? (
            <p className="mt-2 text-xs font-semibold text-terracotta" role="alert">
              {applyError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3">
            <p className="text-xs text-muted">{selectedCount} selected</p>
            <button
              type="button"
              disabled={stale || selectedCount === 0}
              className={`${adminPrimaryButtonClass} text-xs ${adminFocusRing}`}
              onClick={handleApplySelected}
            >
              Apply selected
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
