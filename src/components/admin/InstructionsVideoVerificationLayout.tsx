"use client";

import { useEffect, useMemo, useState } from "react";
import { ChapterTimestampSuggestionsPanel } from "@/components/admin/ChapterTimestampSuggestionsPanel";
import { YoutubeChapterSyncPanel } from "@/components/admin/YoutubeChapterSyncPanel";
import { InstructionVideoWorkspace } from "@/components/admin/InstructionVideoWorkspace";
import {
  InstructionVideoWorkspaceProvider,
  useInstructionVideoWorkspace,
  type LinkedVideoPreview,
} from "@/components/admin/InstructionVideoWorkspaceContext";
import { InstructionsAccordionEditor } from "@/components/admin/InstructionsAccordionEditor";
import type { AiTargetedFillApplyPayload } from "@/components/admin/AiRecipeAssistant";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import type { FieldAiIntent } from "@/lib/ai-recipe/field-ai-registry";
import {
  normalizeInstructionGroups,
  resolveInstructionChapter,
  type InstructionChapterValidationIssue,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import {
  roundPlayheadToSeconds,
  validateEndTimestampFromPlayhead,
  patchEndPlayheadFeedbackByGroup,
} from "@/lib/instruction-video-workspace";
import { recipeLinkedVideoId } from "@/lib/youtube-data/recipe-link";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { FieldSource } from "@/lib/ai-recipe/field-state";
import { adminFocusRing } from "@/lib/admin-ui";

type Props = {
  values: Record<string, unknown>;
  onInstructionsChange: (next: InstructionGroupWithChapters[]) => void;
  stickyTopPx: number;
  stickyBottomPx?: number;
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
  typeId: string;
  youtubeUrl?: string;
  title: string;
  aiMeta?: RecipeAiMeta | null;
  onApplyChapterSuggestions?: (input: {
    groups: InstructionGroupWithChapters[];
    provenancePaths: Record<string, { source: FieldSource; value: unknown }>;
  }) => void;
  recipeId?: string;
  isDirty?: boolean;
};

function VideoPanelRestoreButton() {
  const { videoPanelVisible, setVideoPanelVisible } = useInstructionVideoWorkspace();
  if (videoPanelVisible) return null;
  return (
    <div className="mb-3 rounded-sm border border-line/80 bg-cream/20 p-3">
      <button
        type="button"
        className={`text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
        onClick={() => setVideoPanelVisible(true)}
      >
        Show video
      </button>
    </div>
  );
}

function InstructionsVideoVerificationBody({
  groups,
  onInstructionsChange,
  parentKey,
  typeFields,
  fieldAiBusy,
  fieldSuggestions,
  fieldAiNotice,
  onRunFieldAi,
  onApplyFieldSuggestion,
  onClearFieldSuggestion,
  expandedGroups,
  onToggleGroup,
  onExpandAll,
  onCollapseAll,
  reviewPaths,
  missingPaths,
  pulsingPath,
  videoDurationSeconds,
  stageAlignments,
  legacyTimestamps,
  chapterValidationIssues,
  onChapterFieldChange,
  handleClearStart,
  handleClearEnd,
  handleSetStartFromPlayhead,
  handleSetEndFromPlayhead,
  endPlayheadFeedbackByGroup,
}: {
  groups: InstructionGroupWithChapters[];
  onInstructionsChange: (next: InstructionGroupWithChapters[]) => void;
  parentKey: string;
  typeFields: SchemaField[];
  fieldAiBusy: string | null;
  fieldSuggestions: Props["fieldSuggestions"];
  fieldAiNotice: Props["fieldAiNotice"];
  onRunFieldAi?: Props["onRunFieldAi"];
  onApplyFieldSuggestion?: Props["onApplyFieldSuggestion"];
  onClearFieldSuggestion?: Props["onClearFieldSuggestion"];
  expandedGroups: Record<number, boolean>;
  onToggleGroup: (groupIndex: number) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  reviewPaths: Set<string>;
  missingPaths: Set<string>;
  pulsingPath: string | null;
  videoDurationSeconds?: number;
  stageAlignments: RecipeStageAlignment[];
  legacyTimestamps: RecipeYoutubeTimestamp[];
  chapterValidationIssues: InstructionChapterValidationIssue[];
  onChapterFieldChange?: Props["onChapterFieldChange"];
  handleClearStart: (groupIndex: number) => void;
  handleClearEnd: (groupIndex: number) => void;
  handleSetStartFromPlayhead: (groupIndex: number, seconds: number) => void;
  handleSetEndFromPlayhead: (groupIndex: number, seconds: number) => void;
  endPlayheadFeedbackByGroup: Record<number, string>;
}) {
  const { videoPanelVisible } = useInstructionVideoWorkspace();

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className={`min-w-0 ${videoPanelVisible ? "flex-[1_1_68%]" : "flex-1"}`}>
        <VideoPanelRestoreButton />
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
          endPlayheadFeedbackByGroup={endPlayheadFeedbackByGroup}
        />
      </div>
      <div
        className={
          videoPanelVisible
            ? "min-w-0 flex-[0_1_32%] lg:max-w-md"
            : "pointer-events-none fixed left-0 top-0 -z-50 h-px w-px overflow-hidden opacity-0"
        }
        aria-hidden={!videoPanelVisible}
      >
        <InstructionVideoWorkspace
          instructionGroups={groups}
          onSetStartFromPlayhead={handleSetStartFromPlayhead}
          onSetEndFromPlayhead={handleSetEndFromPlayhead}
          endPlayheadFeedbackByGroup={endPlayheadFeedbackByGroup}
        />
      </div>
    </div>
  );
}

export function InstructionsVideoVerificationLayout({
  values,
  onInstructionsChange,
  stickyTopPx,
  stickyBottomPx = 64,
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
  typeId,
  youtubeUrl,
  title,
  aiMeta,
  onApplyChapterSuggestions,
  recipeId,
  isDirty = false,
}: Props) {
  const groups = useMemo(
    () => normalizeInstructionGroups(values.instructions),
    [values.instructions],
  );
  const linkedVideoId = useMemo(() => recipeLinkedVideoId(values), [values]);
  const [linkedVideo, setLinkedVideo] = useState<LinkedVideoPreview | null>(null);
  const [endPlayheadFeedbackByGroup, setEndPlayheadFeedbackByGroup] = useState<
    Record<number, string>
  >({});

  function setEndPlayheadFeedbackForGroup(groupIndex: number, message: string | null) {
    setEndPlayheadFeedbackByGroup((current) =>
      patchEndPlayheadFeedbackByGroup(current, groupIndex, message),
    );
  }

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
    setEndPlayheadFeedbackForGroup(groupIndex, null);
    patchChapterField(groupIndex, "startTimestamp", seconds);
  }

  function handleSetEndFromPlayhead(groupIndex: number, seconds: number) {
    const group = groups[groupIndex];
    if (!group) return;
    const resolved = resolveInstructionChapter({
      group,
      groupIndex,
      allGroups: groups,
      videoDurationSeconds,
    });
    const rounded = roundPlayheadToSeconds(seconds);
    const validation = validateEndTimestampFromPlayhead({
      startTimestamp: resolved.startTimestamp,
      endSeconds: rounded,
    });
    if (!validation.ok) {
      setEndPlayheadFeedbackForGroup(groupIndex, validation.message);
      return;
    }
    setEndPlayheadFeedbackForGroup(groupIndex, null);
    patchChapterField(groupIndex, "endTimestamp", rounded);
  }

  function handleClearStart(groupIndex: number) {
    patchChapterField(groupIndex, "startTimestamp", undefined);
  }

  function handleClearEnd(groupIndex: number) {
    setEndPlayheadFeedbackForGroup(groupIndex, null);
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
      stickyBottomPx={stickyBottomPx}
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

      {onApplyChapterSuggestions ? (
        <ChapterTimestampSuggestionsPanel
          groups={groups}
          typeId={typeId}
          youtubeUrl={youtubeUrl}
          title={title}
          values={values}
          aiMeta={aiMeta}
          videoDurationSeconds={videoDurationSeconds}
          onApplySuggestions={onApplyChapterSuggestions}
        />
      ) : null}

      {recipeId ? (
        <YoutubeChapterSyncPanel
          recipeId={recipeId}
          values={values}
          isDirty={isDirty}
          videoDurationSeconds={videoDurationSeconds}
        />
      ) : null}

      <InstructionsVideoVerificationBody
        groups={groups}
        onInstructionsChange={onInstructionsChange}
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
        handleClearStart={handleClearStart}
        handleClearEnd={handleClearEnd}
        handleSetStartFromPlayhead={handleSetStartFromPlayhead}
        handleSetEndFromPlayhead={handleSetEndFromPlayhead}
        endPlayheadFeedbackByGroup={endPlayheadFeedbackByGroup}
      />
    </InstructionVideoWorkspaceProvider>
  );
}
