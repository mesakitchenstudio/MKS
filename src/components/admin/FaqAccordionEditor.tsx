"use client";

import { useState } from "react";
import type { AiTargetedFillApplyPayload } from "@/components/admin/AiRecipeAssistant";
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

function FaqGranularAi({
  path,
  parentKey,
  value,
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
  const hasContent = fieldPathHasContent({ path, kind: def?.kind, value });
  const label = resolveFieldAiActionLabel({ path, kind: def?.kind, strategy: def?.strategy, hasContent });
  const suggestion = fieldSuggestions[path];
  const busy = fieldAiBusy === path;
  return (
    <div className="grid gap-1.5">
      <FieldAiActionButton label={label} busy={busy} onClick={() => onRunFieldAi(path, parentKey)} />
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
      {fieldAiNotice[path] ? (
        <p className="text-xs font-semibold text-terracotta" role="status">
          {fieldAiNotice[path]}
        </p>
      ) : null}
    </div>
  );
}

export function FaqAccordionEditor({
  items,
  onChange,
  parentKey,
  typeFields,
  fieldAiBusy = null,
  fieldSuggestions = {},
  fieldAiNotice = {},
  onRunFieldAi,
  onApplyFieldSuggestion,
  onClearFieldSuggestion,
  expandedRows,
  onToggleRow,
  pulsingPath = null,
}: {
  items: { name?: string; note?: string }[];
  onChange: (value: unknown) => void;
  parentKey: string;
  typeFields: SchemaField[];
  fieldAiBusy?: string | null;
  fieldSuggestions?: Record<
    string,
    { currentValue: unknown; suggestion: unknown; pending: AiTargetedFillApplyPayload }
  >;
  fieldAiNotice?: Record<string, string>;
  onRunFieldAi?: (path: string, parentKey: string, intent?: FieldAiIntent) => void;
  onApplyFieldSuggestion?: (path: string) => void;
  onClearFieldSuggestion?: (path: string) => void;
  expandedRows: Record<number, boolean>;
  onToggleRow: (index: number) => void;
  pulsingPath?: string | null;
}) {
  const [internalExpanded, setInternalExpanded] = useState<Record<number, boolean>>({});
  const expanded = expandedRows ?? internalExpanded;
  const toggle = onToggleRow ?? ((index: number) => setInternalExpanded((c) => ({ ...c, [index]: !c[index] })));

  return (
    <div className="grid gap-2">
      {items.map((item, index) => {
        const question = String(item.name ?? "").trim();
        const answer = String(item.note ?? "").trim();
        const isOpen = expanded[index] ?? false;
        const notePath = `values.${parentKey}.${index}.note`;
        const namePath = `values.${parentKey}.${index}.name`;
        const summary = question || `Question ${index + 1}`;
        const missingAnswer = question && !answer;

        return (
          <div
            key={index}
            id={recipeGranularAnchorId(notePath)}
            data-recipe-field-path={notePath}
            className={`border border-line/80 ${pulsingPath === notePath || pulsingPath === namePath ? "mesa-nav-field-pulse" : ""}`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-cream/40 ${adminFocusRing}`}
              onClick={() => toggle(index)}
            >
              <span className="min-w-0 truncate font-semibold text-ink">{summary}</span>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {missingAnswer ? (
                  <span className="text-terracotta">Missing answer</span>
                ) : answer ? (
                  "Answered"
                ) : (
                  "Empty"
                )}
              </span>
            </button>
            {isOpen ? (
              <div className="grid gap-3 border-t border-line/70 px-3 py-3 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-ink">Question</span>
                  <input
                    value={item.name || ""}
                    placeholder="Question"
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, name: event.target.value };
                      onChange(next);
                    }}
                    className={compactInputClass}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-ink">Answer</span>
                  <textarea
                    value={item.note || ""}
                    placeholder="Answer"
                    rows={3}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, note: event.target.value };
                      onChange(next);
                    }}
                    className={`${adminInputClass} h-auto min-h-[4.5rem] resize-y`}
                  />
                  {onRunFieldAi && onApplyFieldSuggestion && onClearFieldSuggestion ? (
                    <FaqGranularAi
                      path={notePath}
                      parentKey={parentKey}
                      value={item.note ?? ""}
                      typeFields={typeFields}
                      fieldAiBusy={fieldAiBusy}
                      fieldSuggestions={fieldSuggestions}
                      fieldAiNotice={fieldAiNotice}
                      onRunFieldAi={onRunFieldAi}
                      onApplyFieldSuggestion={onApplyFieldSuggestion}
                      onClearFieldSuggestion={onClearFieldSuggestion}
                    />
                  ) : null}
                </label>
              </div>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        className={editorTextAction}
        onClick={() => onChange([...items, { name: "", note: "" }])}
      >
        + Add question
      </button>
    </div>
  );
}
