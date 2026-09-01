"use client";

import { useMemo } from "react";
import type { AiTargetedFillApplyPayload } from "@/components/admin/AiRecipeAssistant";
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
import { recipeGranularAnchorId } from "@/lib/recipe-editor-field-anchor";
import { adminFocusRing, adminInputClass, adminTertiaryButtonClass } from "@/lib/admin-ui";
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
}: {
  groups: { name?: string; steps: string[] }[];
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
}) {
  const totalSteps = useMemo(
    () => groups.reduce((sum, group) => sum + group.steps.length, 0),
    [groups],
  );
  const stepOffsetByGroup = groups.map((_, index) =>
    groups.slice(0, index).reduce((total, prior) => total + prior.steps.length, 0),
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-3">
        <p className="text-xs text-muted">
          <span className="font-semibold text-ink">{totalSteps} steps</span>
          <span className="mx-1.5">·</span>
          {groups.length} section{groups.length === 1 ? "" : "s"}
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

        return (
          <div key={groupIndex} className="border border-line/80 bg-cream/20">
            <button
              type="button"
              aria-expanded={expanded}
              className={`flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-cream/50 ${adminFocusRing}`}
              onClick={() => onToggleGroup(groupIndex)}
            >
              <span className="mt-0.5 shrink-0 text-sm text-muted" aria-hidden>
                {expanded ? "▾" : "▸"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xs font-semibold tabular-nums text-muted">{groupIndex + 1}</span>
                  <span className="font-semibold text-ink">{sectionTitle}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {stepCount} step{stepCount === 1 ? "" : "s"}
                  {status ? <span className="text-terracotta/90"> · {status}</span> : null}
                  <span className="invisible ml-2 sm:visible">· Timestamp —</span>
                </span>
              </span>
            </button>

            {expanded ? (
              <div className="grid gap-3 border-t border-line/70 px-3 pb-4 pt-3">
                <div className="flex flex-wrap items-start gap-2">
                  <input
                    id={recipeGranularAnchorId(namePath)}
                    value={group.name || ""}
                    placeholder="Section name (optional)"
                    aria-label={`Instruction section ${groupIndex + 1} title`}
                    onChange={(event) => {
                      const next = [...groups];
                      next[groupIndex] = { ...group, name: event.target.value };
                      onChange(next);
                    }}
                    className={`${compactInputClass} max-w-md flex-1`}
                  />
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
