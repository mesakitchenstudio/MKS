"use client";

import { useEffect, useMemo, useState } from "react";
import { InstructionVideoWorkspace } from "@/components/admin/InstructionVideoWorkspace";
import {
  InstructionVideoWorkspaceProvider,
  type LinkedVideoPreview,
} from "@/components/admin/InstructionVideoWorkspaceContext";
import { InstructionsAccordionEditor } from "@/components/admin/InstructionsAccordionEditor";
import type { AiTargetedFillApplyPayload } from "@/components/admin/AiRecipeAssistant";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import type { FieldAiIntent } from "@/lib/ai-recipe/field-ai-registry";
import {
  normalizeInstructionGroups,
  type InstructionChapterValidationIssue,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import { recipeLinkedVideoId } from "@/lib/youtube-data/recipe-link";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import { adminFocusRing } from "@/lib/admin-ui";

type Props = {
  values: Record<string, unknown>;
  onInstructionsChange: (next: InstructionGroupWithChapters[]) => void;
  stickyTopPx: number;
  parentKey?: string;
  typeFields: SchemaField[];
  fieldAiBusy?: string | null;
  fieldSuggestions?: Record<
    string,
    {
      currentValue: unknown;
      suggestion: unknown;
      pending: AiTargetedFillApplyPayload;
    }
  >;
  fieldAiNotice?: Record<string, string>;
  onRunFieldAi?: (path: string, parentKey: string, intent?: FieldAiIntent) => void;
  onApplyFieldSuggestion?: (path: string) => void;
  onClearFieldSuggestion?: (path: string) => void;
  expandedGroups: Record<number, boolean>;
  onToggleGroup: (groupIndex: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  reviewPaths?: Set<string>;
  missingPaths?: Set<string>;
  pulsingPath?: string | null;
  videoDurationSeconds?: number;
  stageAlignments?: RecipeStageAlignment[];
  legacyTimestamps?: RecipeYoutubeTimestamp[];
  chapterValidationIssues?: InstructionChapterValidationIssue[];
  onChapterFieldChange?: (
    groupIndex: number,
    field: "chapterLabel" | "startTimestamp" | "endTimestamp",
    value: string | number | undefined,
  ) => void;
  onNavigateChapterIssue?: (groupIndex: number) => void;
};

export function InstructionsVideoVerificationLayout({
  values,
  onInstructionsChange,
  stickyTopPx,
  parentKey = "instructions",
  typeFields,
  fieldAiBusy = null,
  fieldSuggestions = {},
  fieldAiNotice = {},
  onRunFieldAi,
  onApplyFieldSuggestion,
  onClearFieldSuggestion,
  expandedGroups,
  onToggleGroup,
  onExpandAll,
  onCollapseAll,
  reviewPaths = new Set(),
  missingPaths = new Set(),
  pulsingPath = null,
  videoDurationSeconds,
  stageAlignments = [],
  legacyTimestamps = [],
  chapterValidationIssues = [],
  onChapterFieldChange,
  onNavigateChapterIssue,
}: Props) {
  const groups = useMemo(
    () => normalizeInstructionGroups(values.instructions),
    [values.instructions],
  );
  const linkedVideoId = useMemo(() => recipeLinkedVideoId(values), [values]);
  const [linkedVideo, setLinkedVideo] = useState<LinkedVideoPreview | null>(null);

  useEffect(() => {
    if (!linkedVideoId) {
      setLinkedVideo(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/admin/youtube/videos/${encodeURIComponent(linkedVideoId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<{
          videoId: string;
          title: string;
          durationDisplay: string;
          durationSeconds: number;
          embeddable: boolean;
        }>;
      })
      .then((payload) => {
        if (cancelled) return;
        setLinkedVideo({
          videoId: payload.videoId,
          title: payload.title,
          durationDisplay: payload.durationDisplay,
          durationSeconds: payload.durationSeconds,
          embeddable: payload.embeddable,
        });
      })
      .catch(() => {
        if (cancelled) return;
        const blob = parseRecipeYoutubeBlob(values.youtube);
        setLinkedVideo({
          videoId: linkedVideoId,
          title: String(blob?.title ?? "Linked video"),
          durationDisplay: String(blob?.duration ?? ""),
          durationSeconds: videoDurationSeconds ?? 0,
          embeddable: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [linkedVideoId, values.youtube, videoDurationSeconds]);

  function patchChapterField(
    groupIndex: number,
    field: "chapterLabel" | "startTimestamp" | "endTimestamp",
    value: string | number | undefined,
  ) {
    onChapterFieldChange?.(groupIndex, field, value);
    const next = [...groups];
    const current = { ...next[groupIndex]! };
    if (value === undefined) {
      delete current[field];
    } else if (field === "chapterLabel") {
      current.chapterLabel = String(value);
    } else {
      current[field] = value as number;
    }
    next[groupIndex] = current;
    onInstructionsChange(next);
  }

  function handleSetStartFromPlayhead(groupIndex: number, seconds: number) {
    patchChapterField(groupIndex, "startTimestamp", seconds);
  }

  function handleSetEndFromPlayhead(groupIndex: number, seconds: number) {
    patchChapterField(groupIndex, "endTimestamp", seconds);
  }

  function handleClearStart(groupIndex: number) {
    patchChapterField(groupIndex, "startTimestamp", undefined);
  }

  function handleClearEnd(groupIndex: number) {
    patchChapterField(groupIndex, "endTimestamp", undefined);
  }

  const warningCount = chapterValidationIssues.filter(
    (issue) => issue.severity === "warning" || issue.severity === "error",
  ).length;

  return (
    <InstructionVideoWorkspaceProvider
      linkedVideo={linkedVideo}
      instructionGroups={groups}
      videoDurationSeconds={videoDurationSeconds}
      stickyTopPx={stickyTopPx}
    >
      {warningCount > 0 ? (
        <button
          type="button"
          className={`mb-3 text-left text-xs font-semibold text-terracotta/90 underline-offset-2 hover:underline ${adminFocusRing}`}
          onClick={() => {
            const first = chapterValidationIssues.find((issue) => issue.groupIndex != null);
            if (first?.groupIndex != null) onNavigateChapterIssue?.(first.groupIndex);
          }}
        >
          {warningCount} chapter timing warning{warningCount === 1 ? "" : "s"}
        </button>
      ) : null}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-[1_1_68%]">
          <InstructionsAccordionEditor
            groups={groups}
            onChange={(value) => onInstructionsChange(value as InstructionGroupWithChapters[])}
            parentKey={parentKey}
            typeFields={typeFields}
            fieldAiBusy={fieldAiBusy}
            fieldSuggestions={fieldSuggestions}
            fieldAiNotice={fieldAiNotice}
            onRunFieldAi={onRunFieldAi}
            onApplyFieldSuggestion={onApplyFieldSuggestion}
            onClearFieldSuggestion={onClearFieldSuggestion}
            expandedGroups={expandedGroups}
            onToggleGroup={onToggleGroup}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
            reviewPaths={reviewPaths}
            missingPaths={missingPaths}
            pulsingPath={pulsingPath}
            videoDurationSeconds={videoDurationSeconds}
            stageAlignments={stageAlignments}
            legacyTimestamps={legacyTimestamps}
            chapterValidationIssues={chapterValidationIssues}
            onChapterFieldChange={onChapterFieldChange}
            onClearStartTimestamp={handleClearStart}
            onClearEndTimestamp={handleClearEnd}
            onSetStartFromPlayhead={handleSetStartFromPlayhead}
            onSetEndFromPlayhead={handleSetEndFromPlayhead}
          />
        </div>
        <div className="min-w-0 flex-[0_1_32%] lg:max-w-md">
          <InstructionVideoWorkspace
            instructionGroups={groups}
            onSetStartFromPlayhead={handleSetStartFromPlayhead}
            onSetEndFromPlayhead={handleSetEndFromPlayhead}
          />
        </div>
      </div>
    </InstructionVideoWorkspaceProvider>
  );
}
