"use client";

import { useMemo, useState } from "react";
import type { AiTargetedFillApplyPayload } from "@/components/admin/AiRecipeAssistant";
import { useInstructionVideoWorkspaceOptional } from "@/components/admin/InstructionVideoWorkspaceContext";
import { EditorDragHandle, EditorRowActions } from "@/components/admin/EditorRowActions";
import { FieldAiActionButton } from "@/components/admin/FieldAiActionButton";
import { FieldAiSuggestionPanel } from "@/components/admin/FieldAiSuggestionPanel";
import {
  fieldPathHasContent,
  getRecipeFieldAiDef,
  isRecipeFieldAiSupported,
  resolveFieldAiActionLabel,
  type FieldAiIntent,
} from "@/lib/ai-recipe/field-ai-registry";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import {
  formatInstructionChapterCoverageSummary,
  formatTimestampInput,
  hasCanonicalInstructionChapters,
  hasCanonicalStartTimestamp,
  instructionChapterCoverage,
  parseTimestampInput,
  resolveInstructionChapter,
  type InstructionChapterValidationIssue,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import { recipeGranularAnchorId } from "@/lib/recipe-editor-field-anchor";
import { adminFocusRing, adminInputClass } from "@/lib/admin-ui";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";

const compactInputClass =
  "h-9 w-full rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15";
const editorTextAction = `text-sm font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`;

function moveArrayItem<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed!);
  return next;
}

function GranularFieldAiSlot({
  path,
  parentKey,
  value,
  kind,
  typeFields,
  fieldAiBusy,
  fieldSuggestions,
  fieldAiNotice,
  onRunFieldAi,
  onApplyFieldSuggestion,
  onClearFieldSuggestion,
}: {
  path: string;
  parentKey: string;
  value: unknown;
  kind?: string;
  typeFields: SchemaField[];
  fieldAiBusy: string | null;
  fieldSuggestions: Record<
    string,
    { currentValue: unknown; suggestion: unknown; pending: AiTargetedFillApplyPayload }
  >;
  fieldAiNotice: Record<string, string>;
  onRunFieldAi: (path: string, parentKey: string, intent?: FieldAiIntent) => void;
  onApplyFieldSuggestion: (path: string) => void;
  onClearFieldSuggestion: (path: string) => void;
}) {
  if (!isRecipeFieldAiSupported(path, typeFields)) return null;
  const def = getRecipeFieldAiDef(path, typeFields);
  const resolvedKind = def?.kind ?? kind;
  const hasContent = fieldPathHasContent({ path, kind: resolvedKind, value });
  const label = resolveFieldAiActionLabel({
    path,
    kind: resolvedKind,
    strategy: def?.strategy,
    hasContent,
  });
  const suggestion = fieldSuggestions[path];
  const notice = fieldAiNotice[path];
  const busy = fieldAiBusy === path;

  return (
    <div className="grid gap-1.5">
      <FieldAiActionButton label={label} busy={busy} onClick={() => onRunFieldAi(path, parentKey)} />
      {busy && !suggestion ? (
        <p className="text-xs text-muted" role="status">
          Generating suggestion…
        </p>
      ) : null}
      {suggestion ? (
        <FieldAiSuggestionPanel
          currentValue={suggestion.currentValue}
          suggestion={suggestion.suggestion}
          busy={busy}
          onUseSuggestion={() => onApplyFieldSuggestion(path)}
          onTryAnother={() => onRunFieldAi(path, parentKey, "alternative")}
          onKeepCurrent={() => onClearFieldSuggestion(path)}
        />
      ) : null}
      {notice ? (
        <p
          className={`text-xs font-semibold ${
            notice === "AI SUGGESTION — REVIEW" ? "text-olive" : "text-terracotta"
          }`}
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function sectionStatusLabel(input: {
  groupIndex: number;
  reviewPaths: Set<string>;
  missingPaths: Set<string>;
  parentKey: string;
}) {
  let review = 0;
  let missing = 0;
  const prefix = `values.${input.parentKey}.${input.groupIndex}`;
  for (const path of input.reviewPaths) {
    if (path.startsWith(prefix)) review += 1;
  }
  for (const path of input.missingPaths) {
    if (path.startsWith(prefix)) missing += 1;
  }
  const parts: string[] = [];
  if (missing) parts.push(`${missing} missing`);
  if (review) parts.push(`${review} review`);
  return parts.join(" · ");
}

function collapsedTimestampLabel(input: {
  group: InstructionGroupWithChapters;
  groupIndex: number;
  allGroups: InstructionGroupWithChapters[];
  stageAlignments?: RecipeStageAlignment[];
  legacyTimestamps?: RecipeYoutubeTimestamp[];
  videoDurationSeconds?: number;
  canonicalMode?: boolean;
}) {
  if (input.canonicalMode && !hasCanonicalStartTimestamp(input.group)) {
    return { text: "Timestamp missing", quiet: true, legacy: false };
  }
  const resolved = resolveInstructionChapter({
    group: input.group,
    groupIndex: input.groupIndex,
    allGroups: input.allGroups,
    stageAlignments: input.stageAlignments,
    legacyTimestamps: input.legacyTimestamps,
    videoDurationSeconds: input.videoDurationSeconds,
  });
  if (resolved.startTimestamp == null) {
    return { text: "Timestamp missing", quiet: true, legacy: false };
  }
  const clock = formatTimestampInput(resolved.startTimestamp);
  if (resolved.startSource !== "canonical") {
    const legacyLabel =
      resolved.startSource === "stage_alignment"
        ? "Legacy alignment"
        : resolved.startSource === "legacy_timestamp"
          ? "Legacy timestamp"
          : undefined;
    return { text: `${clock}${legacyLabel ? ` · ${legacyLabel}` : ""}`, quiet: false, legacy: true };
  }
  return { text: clock, quiet: false, legacy: false };
}

export function InstructionsAccordionEditor({
  groups,
  onChange,
  parentKey,
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
  onSetStartFromPlayhead,
  onSetEndFromPlayhead,
  onClearStartTimestamp,
  onClearEndTimestamp,
}: {
  groups: InstructionGroupWithChapters[];
  onChange: (value: unknown) => void;
  parentKey: string;
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
  onSetStartFromPlayhead?: (groupIndex: number, seconds: number) => void;
  onSetEndFromPlayhead?: (groupIndex: number, seconds: number) => void;
  onClearStartTimestamp?: (groupIndex: number) => void;
  onClearEndTimestamp?: (groupIndex: number) => void;
}) {
  const videoWorkspace = useInstructionVideoWorkspaceOptional();

  const canonicalMode = useMemo(
    () => hasCanonicalInstructionChapters(groups),
    [groups],
  );
  const [startInputDrafts, setStartInputDrafts] = useState<Record<number, string>>({});
  const [endInputDrafts, setEndInputDrafts] = useState<Record<number, string>>({});
  const [startInputErrors, setStartInputErrors] = useState<Record<number, string>>({});
  const [endInputErrors, setEndInputErrors] = useState<Record<number, string>>({});

  const totalSteps = useMemo(
    () => groups.reduce((sum, group) => sum + group.steps.length, 0),
    [groups],
  );
  const stepOffsetByGroup = groups.map((_, index) =>
    groups.slice(0, index).reduce((total, prior) => total + prior.steps.length, 0),
  );

  const coverageSummary = useMemo(() => {
    const coverage = instructionChapterCoverage(groups, {
      stageAlignments,
      legacyTimestamps,
    });
    return formatInstructionChapterCoverageSummary(coverage);
  }, [groups, legacyTimestamps, stageAlignments]);

  function patchGroup(groupIndex: number, patch: Partial<InstructionGroupWithChapters>) {
    const next = [...groups];
    next[groupIndex] = { ...groups[groupIndex]!, ...patch };
    onChange(next);
  }

  function updateStartInput(groupIndex: number, raw: string) {
    setStartInputDrafts((current) => ({ ...current, [groupIndex]: raw }));
    const trimmed = raw.trim();
    if (!trimmed) {
      setStartInputErrors((current) => {
        const next = { ...current };
        delete next[groupIndex];
        return next;
      });
      onChapterFieldChange?.(groupIndex, "startTimestamp", undefined);
      patchGroup(groupIndex, { startTimestamp: undefined });
      return;
    }
    const parsed = parseTimestampInput(trimmed);
    if (parsed == null) {
      setStartInputErrors((current) => ({
        ...current,
        [groupIndex]: "Enter a valid time (MM:SS or H:MM:SS).",
      }));
      return;
    }
    setStartInputErrors((current) => {
      const next = { ...current };
      delete next[groupIndex];
      return next;
    });
    setStartInputDrafts((current) => {
      const next = { ...current };
      delete next[groupIndex];
      return next;
    });
    onChapterFieldChange?.(groupIndex, "startTimestamp", parsed);
    patchGroup(groupIndex, { startTimestamp: parsed });
  }

  function updateEndInput(groupIndex: number, raw: string) {
    setEndInputDrafts((current) => ({ ...current, [groupIndex]: raw }));
    const trimmed = raw.trim();
    if (!trimmed) {
      setEndInputErrors((current) => {
        const next = { ...current };
        delete next[groupIndex];
        return next;
      });
      onChapterFieldChange?.(groupIndex, "endTimestamp", undefined);
      patchGroup(groupIndex, { endTimestamp: undefined });
      return;
    }
    const parsed = parseTimestampInput(trimmed);
    if (parsed == null) {
      setEndInputErrors((current) => ({
        ...current,
        [groupIndex]: "Enter a valid time (MM:SS or H:MM:SS).",
      }));
      return;
    }
    setEndInputErrors((current) => {
      const next = { ...current };
      delete next[groupIndex];
      return next;
    });
    setEndInputDrafts((current) => {
      const next = { ...current };
      delete next[groupIndex];
      return next;
    });
    onChapterFieldChange?.(groupIndex, "endTimestamp", parsed);
    patchGroup(groupIndex, { endTimestamp: parsed });
  }

  function startInputDisplayValue(input: {
    group: InstructionGroupWithChapters;
    groupIndex: number;
    timestampMeta: ReturnType<typeof collapsedTimestampLabel>;
    resolved: ReturnType<typeof resolveInstructionChapter>;
  }) {
    if (startInputDrafts[input.groupIndex] !== undefined) {
      return startInputDrafts[input.groupIndex]!;
    }
    if (typeof input.group.startTimestamp === "number") {
      return formatTimestampInput(input.group.startTimestamp);
    }
    if (!canonicalMode && input.timestampMeta.legacy && input.resolved.startTimestamp != null) {
      return formatTimestampInput(input.resolved.startTimestamp);
    }
    return "";
  }

  function endInputDisplayValue(group: InstructionGroupWithChapters, groupIndex: number) {
    if (endInputDrafts[groupIndex] !== undefined) {
      return endInputDrafts[groupIndex]!;
    }
    if (typeof group.endTimestamp === "number") {
      return formatTimestampInput(group.endTimestamp);
    }
    return "";
  }

  function adoptLegacyTimestamp(groupIndex: number) {
    const resolved = resolveInstructionChapter({
      group: groups[groupIndex]!,
      groupIndex,
      allGroups: groups,
      stageAlignments,
      legacyTimestamps,
      videoDurationSeconds,
    });
    if (resolved.startTimestamp == null || resolved.startSource === "canonical") return;
    onChapterFieldChange?.(groupIndex, "startTimestamp", resolved.startTimestamp);
    patchGroup(groupIndex, { startTimestamp: resolved.startTimestamp });
  }

  function handleToggleGroup(groupIndex: number) {
    videoWorkspace?.setActiveSectionIndex(groupIndex);
    onToggleGroup(groupIndex);
  }

  function handlePlaySection(groupIndex: number, seconds: number) {
    videoWorkspace?.setActiveSectionIndex(groupIndex);
    videoWorkspace?.seekAndPlay(seconds, groupIndex);
  }

  function handleSeekTimestamp(groupIndex: number, seconds: number) {
    videoWorkspace?.setActiveSectionIndex(groupIndex);
    videoWorkspace?.seekOnly(seconds, groupIndex);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-3">
        <p className="text-xs text-muted">
          <span className="font-semibold text-ink">{totalSteps} steps</span>
          <span className="mx-1.5">·</span>
          {groups.length} section{groups.length === 1 ? "" : "s"}
          <span className="mx-1.5">·</span>
          {coverageSummary}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={editorTextAction} onClick={onCollapseAll}>
            Collapse all
          </button>
          <button type="button" className={editorTextAction} onClick={onExpandAll}>
            Expand all
          </button>
        </div>
      </div>

      {groups.map((group, groupIndex) => {
        const expanded = expandedGroups[groupIndex] ?? false;
        const sectionTitle = String(group.name ?? "").trim() || `Section ${groupIndex + 1}`;
        const stepCount = group.steps.length;
        const status = sectionStatusLabel({ groupIndex, reviewPaths, missingPaths, parentKey });
        const namePath = `values.${parentKey}.${groupIndex}.name`;
        const timestampMeta = collapsedTimestampLabel({
          group,
          groupIndex,
          allGroups: groups,
          stageAlignments,
          legacyTimestamps,
          videoDurationSeconds,
          canonicalMode,
        });
        const resolved = resolveInstructionChapter({
          group,
          groupIndex,
          allGroups: groups,
          stageAlignments,
          legacyTimestamps,
          videoDurationSeconds,
        });
        const groupIssues = chapterValidationIssues.filter((issue) => issue.groupIndex === groupIndex);
        const startInputId = recipeGranularAnchorId(`values.${parentKey}.${groupIndex}.startTimestamp`);
        const hasExplicitEnd = typeof group.endTimestamp === "number";
        const autoEnd =
          !hasExplicitEnd && resolved.endTimestamp != null
            ? formatTimestampInput(resolved.endTimestamp)
            : null;

        const isActiveSection = videoWorkspace?.activeSectionIndex === groupIndex;
        const isPlayingSection = videoWorkspace?.playingSectionIndex === groupIndex;
        const canonicalStart = hasCanonicalStartTimestamp(group) ? group.startTimestamp : undefined;

        return (
          <div
            key={groupIndex}
            className={`border border-line/80 bg-cream/20${
              isActiveSection ? " ring-1 ring-olive/25" : ""
            }`}
          >
            <div className="flex items-start gap-2 px-3 py-3">
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`${expanded ? "Collapse" : "Expand"} section ${groupIndex + 1}`}
                className={`mt-0.5 shrink-0 text-sm text-muted hover:text-ink ${adminFocusRing}`}
                onClick={() => handleToggleGroup(groupIndex)}
              >
                {expanded ? "▾" : "▸"}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className={`w-full text-left hover:opacity-90 ${adminFocusRing}`}
                  onClick={() => handleToggleGroup(groupIndex)}
                >
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold tabular-nums text-muted">{groupIndex + 1}</span>
                    <span className="font-semibold text-ink">{sectionTitle}</span>
                    {isPlayingSection ? (
                      <span className="text-xs font-semibold text-olive">Playing</span>
                    ) : null}
                  </span>
                </button>
                <p className="mt-0.5 text-xs text-muted">
                  {stepCount} step{stepCount === 1 ? "" : "s"}
                  {status ? <span className="text-terracotta/90"> · {status}</span> : null}
                  {" · "}
                  {canonicalStart != null ? (
                    <button
                      type="button"
                      className={`font-semibold tabular-nums underline-offset-2 hover:underline ${
                        timestampMeta.legacy ? " text-olive/90" : " text-ink"
                      } ${adminFocusRing}`}
                      aria-label={`Seek video to ${formatTimestampInput(canonicalStart)} for ${sectionTitle}`}
                      onClick={() => handleSeekTimestamp(groupIndex, canonicalStart)}
                    >
                      {formatTimestampInput(canonicalStart)}
                    </button>
                  ) : (
                    <span className={timestampMeta.quiet ? " text-muted/80" : ""}>
                      {timestampMeta.text}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {canonicalStart != null ? (
                  <button
                    type="button"
                    className={`text-xs font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
                    aria-label={`Play section ${sectionTitle} from ${formatTimestampInput(canonicalStart)}`}
                    onClick={() => handlePlaySection(groupIndex, canonicalStart)}
                  >
                    ▶ {formatTimestampInput(canonicalStart)}
                  </button>
                ) : null}
              </div>
            </div>

            {expanded ? (
              <div className="grid gap-4 border-t border-line/70 px-3 pb-4 pt-3">
                <div className="flex flex-wrap items-start gap-2">
                  <label className="grid min-w-0 flex-1 gap-1.5 text-sm">
                    <span className="font-semibold text-ink">Section title</span>
                    <input
                      id={recipeGranularAnchorId(namePath)}
                      value={group.name || ""}
                      placeholder="Section name (optional)"
                      aria-label={`Instruction section ${groupIndex + 1} title`}
                      onChange={(event) => patchGroup(groupIndex, { name: event.target.value })}
                      className={`${compactInputClass} max-w-md`}
                    />
                  </label>
                  {onRunFieldAi && onApplyFieldSuggestion && onClearFieldSuggestion ? (
                    <GranularFieldAiSlot
                      path={namePath}
                      parentKey={parentKey}
                      value={group.name ?? ""}
                      kind="text"
                      typeFields={typeFields}
                      fieldAiBusy={fieldAiBusy}
                      fieldSuggestions={fieldSuggestions}
                      fieldAiNotice={fieldAiNotice}
                      onRunFieldAi={onRunFieldAi}
                      onApplyFieldSuggestion={onApplyFieldSuggestion}
                      onClearFieldSuggestion={onClearFieldSuggestion}
                    />
                  ) : null}
                  {groups.length > 1 ? (
                    <EditorRowActions
                      itemLabel={`instruction section ${groupIndex + 1}`}
                      upDisabled={groupIndex === 0}
                      downDisabled={groupIndex === groups.length - 1}
                      onMoveUp={() => onChange(moveArrayItem(groups, groupIndex, groupIndex - 1))}
                      onMoveDown={() => onChange(moveArrayItem(groups, groupIndex, groupIndex + 1))}
                      onRemove={() => onChange(groups.filter((_, index) => index !== groupIndex))}
                    />
                  ) : null}
                </div>

                <div className="rounded-sm border border-line/60 bg-paper/40 p-3">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                    Video chapter
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1.5 text-sm md:col-span-1">
                      <span className="font-semibold text-muted">Chapter label</span>
                      <input
                        value={group.chapterLabel ?? ""}
                        placeholder={sectionTitle}
                        aria-label={`Chapter label for section ${groupIndex + 1}`}
                        onChange={(event) => {
                          const value = event.target.value;
                          onChapterFieldChange?.(groupIndex, "chapterLabel", value);
                          patchGroup(groupIndex, { chapterLabel: value });
                        }}
                        className={compactInputClass}
                      />
                      <span className="text-xs text-muted">Leave blank to use the section title.</span>
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-muted">Start</span>
                      <input
                        id={startInputId}
                        data-recipe-field-path={`values.${parentKey}.${groupIndex}.startTimestamp`}
                        value={startInputDisplayValue({ group, groupIndex, timestampMeta, resolved })}
                        placeholder="00:00"
                        aria-label={`Video chapter start for section ${groupIndex + 1}`}
                        aria-invalid={Boolean(startInputErrors[groupIndex])}
                        onChange={(event) => updateStartInput(groupIndex, event.target.value)}
                        className={`${compactInputClass}${startInputErrors[groupIndex] ? " border-terracotta/60" : ""}`}
                      />
                      {startInputErrors[groupIndex] ? (
                        <span className="text-xs font-semibold text-terracotta" role="alert">
                          {startInputErrors[groupIndex]}
                        </span>
                      ) : null}
                      {!hasCanonicalStartTimestamp(group) &&
                      resolved.startSource !== "canonical" &&
                      resolved.startTimestamp != null ? (
                        <button
                          type="button"
                          className={`text-left text-xs font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
                          onClick={() => adoptLegacyTimestamp(groupIndex)}
                        >
                          Use as Mesa timestamp
                          {!canonicalMode && resolved.startSource === "stage_alignment"
                            ? " (legacy alignment)"
                            : !canonicalMode && resolved.startSource === "legacy_timestamp"
                              ? " (legacy timestamp)"
                              : ""}
                        </button>
                      ) : null}
                      {onSetStartFromPlayhead ? (
                        <button
                          type="button"
                          className={`text-left text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
                          onClick={() =>
                            onSetStartFromPlayhead(
                              groupIndex,
                              videoWorkspace?.readPlayheadSeconds() ?? 0,
                            )
                          }
                        >
                          Set from playhead
                        </button>
                      ) : null}
                      {hasCanonicalStartTimestamp(group) && onClearStartTimestamp ? (
                        <button
                          type="button"
                          className={`text-left text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
                          onClick={() => onClearStartTimestamp(groupIndex)}
                        >
                          Clear timestamp
                        </button>
                      ) : null}
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold text-muted">End</span>
                      <input
                        value={endInputDisplayValue(group, groupIndex)}
                        placeholder={autoEnd ? `Auto: ${autoEnd}` : "Optional"}
                        aria-label={`Video chapter end for section ${groupIndex + 1}`}
                        aria-invalid={Boolean(endInputErrors[groupIndex])}
                        onChange={(event) => updateEndInput(groupIndex, event.target.value)}
                        className={`${compactInputClass}${endInputErrors[groupIndex] ? " border-terracotta/60" : ""}`}
                      />
                      {endInputErrors[groupIndex] ? (
                        <span className="text-xs font-semibold text-terracotta" role="alert">
                          {endInputErrors[groupIndex]}
                        </span>
                      ) : null}
                      {autoEnd && !hasExplicitEnd ? (
                        <span className="text-xs text-muted">Auto: {autoEnd}</span>
                      ) : null}
                      {onSetEndFromPlayhead ? (
                        <button
                          type="button"
                          className={`text-left text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
                          onClick={() =>
                            onSetEndFromPlayhead(
                              groupIndex,
                              videoWorkspace?.readPlayheadSeconds() ?? 0,
                            )
                          }
                        >
                          Set explicit end from playhead
                        </button>
                      ) : null}
                      {hasExplicitEnd && onClearEndTimestamp ? (
                        <button
                          type="button"
                          className={`text-left text-xs font-semibold text-muted underline-offset-2 hover:text-terracotta hover:underline ${adminFocusRing}`}
                          onClick={() => onClearEndTimestamp(groupIndex)}
                        >
                          Use automatic end
                        </button>
                      ) : null}
                    </label>
                  </div>
                  {groupIssues.map((issue) => (
                    <p
                      key={`${issue.code}-${issue.message}`}
                      className={`mt-2 text-xs font-semibold ${
                        issue.severity === "error" ? "text-terracotta" : "text-muted"
                      }`}
                      role={issue.severity === "error" ? "alert" : "status"}
                    >
                      {issue.message}
                    </p>
                  ))}
                </div>

                {group.steps.map((step, stepIndex) => {
                  const stepPath = `values.${parentKey}.${groupIndex}.steps.${stepIndex}`;
                  const stepNumber = (stepOffsetByGroup[groupIndex] ?? 0) + stepIndex + 1;
                  const isPulsing = pulsingPath === stepPath;
                  return (
                    <div
                      key={stepIndex}
                      id={recipeGranularAnchorId(stepPath)}
                      data-recipe-field-path={stepPath}
                      className={`flex flex-col gap-2 rounded-sm sm:flex-row sm:items-start sm:gap-3 ${
                        isPulsing ? "mesa-nav-field-pulse" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2 sm:contents">
                        <EditorDragHandle label={`step ${stepNumber}`} />
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted sm:mt-2.5 sm:w-5">
                          {stepNumber}
                        </span>
                      </div>
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <textarea
                          value={step}
                          rows={2}
                          aria-label={`Step ${stepNumber}${group.name ? ` in ${group.name}` : ""}`}
                          onChange={(event) => {
                            const next = [...groups];
                            const steps = [...group.steps];
                            steps[stepIndex] = event.target.value;
                            next[groupIndex] = { ...group, steps };
                            onChange(next);
                          }}
                          className={`${adminInputClass} h-auto min-h-[4.5rem] flex-1 resize-y sm:min-h-[2.75rem]`}
                        />
                        {onRunFieldAi && onApplyFieldSuggestion && onClearFieldSuggestion ? (
                          <GranularFieldAiSlot
                            path={stepPath}
                            parentKey={parentKey}
                            value={step}
                            kind="textarea"
                            typeFields={typeFields}
                            fieldAiBusy={fieldAiBusy}
                            fieldSuggestions={fieldSuggestions}
                            fieldAiNotice={fieldAiNotice}
                            onRunFieldAi={onRunFieldAi}
                            onApplyFieldSuggestion={onApplyFieldSuggestion}
                            onClearFieldSuggestion={onClearFieldSuggestion}
                          />
                        ) : null}
                      </div>
                      <EditorRowActions
                        itemLabel={`step ${stepNumber}`}
                        upDisabled={stepIndex === 0}
                        downDisabled={stepIndex === group.steps.length - 1}
                        onMoveUp={() => {
                          const next = [...groups];
                          next[groupIndex] = {
                            ...group,
                            steps: moveArrayItem(group.steps, stepIndex, stepIndex - 1),
                          };
                          onChange(next);
                        }}
                        onMoveDown={() => {
                          const next = [...groups];
                          next[groupIndex] = {
                            ...group,
                            steps: moveArrayItem(group.steps, stepIndex, stepIndex + 1),
                          };
                          onChange(next);
                        }}
                        onRemove={() => {
                          const next = [...groups];
                          const steps = group.steps.filter((_, i) => i !== stepIndex);
                          next[groupIndex] = { ...group, steps: steps.length ? steps : [""] };
                          onChange(next);
                        }}
                      />
                    </div>
                  );
                })}

                <button
                  type="button"
                  className={editorTextAction}
                  onClick={() => {
                    const next = [...groups];
                    next[groupIndex] = { ...group, steps: [...group.steps, ""] };
                    onChange(next);
                  }}
                >
                  + Add step
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        className={editorTextAction}
        onClick={() => onChange([...groups, { name: "", steps: [""] }])}
      >
        + Add section
      </button>
    </div>
  );
}
