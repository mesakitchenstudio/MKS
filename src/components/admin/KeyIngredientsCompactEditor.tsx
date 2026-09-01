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
import { adminFocusRing, adminInputClass } from "@/lib/admin-ui";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";

const compactInputClass =
  "h-9 w-full rounded-sm border border-line bg-paper px-3 text-sm outline-none focus:border-olive focus:ring-2 focus:ring-olive/15";
const editorTextAction = `text-sm font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`;

export function KeyIngredientsCompactEditor({
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
  pulsingPath = null,
  expandedIndex: controlledExpandedIndex,
  onExpandedIndexChange,
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
  pulsingPath?: string | null;
  expandedIndex?: number | null;
  onExpandedIndexChange?: (index: number | null) => void;
}) {
  const [internalExpandedIndex, setInternalExpandedIndex] = useState<number | null>(null);
  const expandedIndex = controlledExpandedIndex ?? internalExpandedIndex;
  const setExpandedIndex = onExpandedIndexChange ?? setInternalExpandedIndex;

  return (
    <div className="grid gap-2">
      {items.map((item, index) => {
        const name = String(item.name ?? "").trim();
        const note = String(item.note ?? "").trim();
        const notePath = `values.${parentKey}.${index}.note`;
        const expanded = expandedIndex === index;
        const missingExplanation = name && !note;

        return (
          <div
            key={index}
            id={recipeGranularAnchorId(notePath)}
            data-recipe-field-path={notePath}
            className={`border border-line/80 ${pulsingPath === notePath ? "mesa-nav-field-pulse" : ""}`}
          >
            <button
              type="button"
              aria-expanded={expanded}
              className={`flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left hover:bg-cream/40 sm:flex-row sm:items-center sm:justify-between ${adminFocusRing}`}
              onClick={() => setExpandedIndex(expanded ? null : index)}
            >
              <span className="font-semibold text-ink">{name || `Key ingredient ${index + 1}`}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                {missingExplanation ? (
                  <span className="text-terracotta">Missing explanation</span>
                ) : note ? (
                  <span className="line-clamp-1 max-w-md normal-case tracking-normal text-muted">{note}</span>
                ) : (
                  "Empty"
                )}
              </span>
            </button>
            {expanded ? (
              <div className="grid gap-3 border-t border-line/70 px-3 py-3 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-ink">Ingredient</span>
                  <input
                    value={item.name || ""}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, name: event.target.value };
                      onChange(next);
                    }}
                    className={compactInputClass}
                  />
                </label>
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold text-ink">Why it matters</span>
                  <textarea
                    value={item.note || ""}
                    rows={3}
                    onChange={(event) => {
                      const next = [...items];
                      next[index] = { ...item, note: event.target.value };
                      onChange(next);
                    }}
                    className={`${adminInputClass} h-auto min-h-[4.5rem] resize-y`}
                  />
                  {onRunFieldAi &&
                  onApplyFieldSuggestion &&
                  onClearFieldSuggestion &&
                  isRecipeFieldAiSupported(notePath, typeFields) ? (
                    <div className="grid gap-1.5">
                      <FieldAiActionButton
                        label={resolveFieldAiActionLabel({
                          path: notePath,
                          kind: "namedNotes",
                          strategy: getRecipeFieldAiDef(notePath, typeFields)?.strategy,
                          hasContent: fieldPathHasContent({ path: notePath, value: item.note ?? "" }),
                        })}
                        busy={fieldAiBusy === notePath}
                        onClick={() => onRunFieldAi(notePath, parentKey)}
                      />
                      {fieldSuggestions[notePath] ? (
                        <FieldAiSuggestionPanel
                          currentValue={fieldSuggestions[notePath].currentValue}
                          suggestion={fieldSuggestions[notePath].suggestion}
                          busy={fieldAiBusy === notePath}
                          onUseSuggestion={() => onApplyFieldSuggestion(notePath)}
                          onTryAnother={() => onRunFieldAi(notePath, parentKey, "alternative")}
                          onKeepCurrent={() => onClearFieldSuggestion(notePath)}
                        />
                      ) : null}
                    </div>
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
        + Add item
      </button>
    </div>
  );
}
