"use client";

import { FieldAiActionButton } from "@/components/admin/FieldAiActionButton";
import {
  fieldPathHasContent,
  resolveFieldAiActionLabel,
  type FieldAiIntent,
} from "@/lib/ai-recipe/field-ai-registry";

export function FieldAiFieldActions({
  path,
  kind,
  value,
  excerpt,
  categoryIds,
  busy,
  disabled,
  onAction,
}: {
  path: string;
  kind?: string;
  value?: unknown;
  excerpt?: string;
  categoryIds?: string[];
  busy?: boolean;
  disabled?: boolean;
  onAction: (intent: FieldAiIntent) => void;
}) {
  const hasContent = fieldPathHasContent({ path, kind, value, excerpt, categoryIds });
  const label = resolveFieldAiActionLabel({ path, hasContent, intent: "generate" });

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
