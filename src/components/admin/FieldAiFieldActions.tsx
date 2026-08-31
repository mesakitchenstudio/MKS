"use client";

import { FieldAiActionButton } from "@/components/admin/FieldAiActionButton";
import {
  fieldPathHasContent,
  resolveFieldAiActionLabel,
  type FieldAiIntent,
  type FieldAiStrategy,
} from "@/lib/ai-recipe/field-ai-registry";

export function FieldAiFieldActions({
  path,
  kind,
  strategy,
  value,
  excerpt,
  categoryIds,
  busy,
  disabled,
  onAction,
}: {
  path: string;
  kind?: string;
  strategy?: FieldAiStrategy;
  value?: unknown;
  excerpt?: string;
  categoryIds?: string[];
  busy?: boolean;
  disabled?: boolean;
  onAction: (intent: FieldAiIntent) => void;
}) {
  const hasContent = fieldPathHasContent({ path, kind, value, excerpt, categoryIds });
  const label = resolveFieldAiActionLabel({ path, kind, strategy, hasContent, intent: "generate" });

  return (
    <FieldAiActionButton
      label={label}
      busyLabel="Generating…"
      busy={busy}
      disabled={disabled}
      onClick={() => onAction(hasContent ? "improve" : "generate")}
    />
  );
}
