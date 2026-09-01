import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { AiMergeMode } from "@/lib/ai-recipe/normalize";
import { isAiFillableFieldKey } from "@/lib/ai-recipe/schema-version";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import {
  buildProvenanceAfterStaffEdit,
  isFieldLocked,
  isFieldProtectedFromBulkAi,
} from "@/lib/ai-recipe/field-state";
import { recipeFieldIsEmpty } from "@/lib/ai-recipe/field-ai-registry";
import { emptyAiSummary, tallyConfidence } from "@/lib/ai-recipe/types";
import {
  serializeYoutubeMetadataEditorState,
  youtubeMetadataToEditorState,
  type YoutubeMetadataEditorState,
} from "@/lib/youtube-metadata-editor";

export type AiFieldProvenance = {
  aiGenerated: true;
  aiGeneratedValue: unknown;
  humanModifiedAfterGeneration: boolean;
  reviewState?: import("@/lib/ai-recipe/field-state").FieldReviewState;
  source?: import("@/lib/ai-recipe/field-state").FieldSource;
  originalAi?: {
    value: unknown;
    source?: import("@/lib/ai-recipe/field-state").FieldSource;
    confidence?: import("@/lib/ai-recipe/types").AiConfidence;
    generatedAt?: string;
  };
  /** Review state preserved when a field is locked, restored on unlock. */
  lockedFromReviewState?: import("@/lib/ai-recipe/field-state").FieldReviewState;
};

export function stableJsonValue(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

export function aiValuesEqual(a: unknown, b: unknown): boolean {
  return stableJsonValue(a) === stableJsonValue(b);
}

export function markFieldHumanModified(
  meta: RecipeAiMeta | null,
  path: string,
  nextValue?: unknown,
): RecipeAiMeta | null {
  if (!meta?.fieldProvenance?.[path]) return meta;
  const previous = meta.fieldProvenance[path];
  if (previous.reviewState === "locked") return meta;
  if (previous.reviewState === "edited" && previous.humanModifiedAfterGeneration) return meta;

  const snapshot = buildProvenanceAfterStaffEdit({
    path,
    nextValue: nextValue ?? previous.aiGeneratedValue,
    previous,
  });

  return {
    ...meta,
    fieldProvenance: {
      ...meta.fieldProvenance,
      [path]: snapshot,
    },
  };
}

export function noteHumanEditorChange(
  meta: RecipeAiMeta | null,
  path: string,
  nextValue: unknown,
): RecipeAiMeta | null {
  if (!meta) return meta;

  if (isMeaningfullyEmptyEditorPath(path, nextValue)) {
    let updated: RecipeAiMeta | null = meta;
    if (meta.fieldProvenance?.[path]) {
      updated = markFieldHumanModified(meta, path, nextValue);
    }
    return stripActiveConfidenceAnnotation(updated ?? meta, path);
  }

  if (!meta.fieldProvenance?.[path]) return meta;
  const provenance = meta.fieldProvenance[path];
  if (provenance.humanModifiedAfterGeneration) return meta;
  if (aiValuesEqual(provenance.aiGeneratedValue, nextValue)) return meta;

  // Form hydration / blank-template reshaping of empty structured fields is not a human edit.
  const previousEmpty = isBlankAiStructuredValue(provenance.aiGeneratedValue);
  const nextEmpty = isBlankAiStructuredValue(nextValue);
  if (previousEmpty && nextEmpty) return meta;

  return markFieldHumanModified(meta, path, nextValue);
}

function isMeaningfullyEmptyEditorPath(path: string, value: unknown): boolean {
  if (path === "title" || path === "excerpt" || path === "slug") {
    return !String(value ?? "").trim();
  }
  if (path === "categoryIds") {
    return !Array.isArray(value) || value.length === 0;
  }
  if (path.startsWith("values.")) {
    return recipeFieldIsEmpty({ path, kind: "text", value });
  }
  return isBlankAiStructuredValue(value);
}

function stripActiveConfidenceAnnotation(meta: RecipeAiMeta, path: string): RecipeAiMeta {
  if (!meta.confidenceByPath?.[path]) return meta;
  const confidenceByPath = { ...meta.confidenceByPath };
  delete confidenceByPath[path];
  const summary = emptyAiSummary();
  for (const row of Object.values(confidenceByPath)) {
    if (row?.confidence) tallyConfidence(row.confidence, summary);
  }
  return { ...meta, confidenceByPath, summary };
}

/** Empty ingredient/instruction/namedNotes placeholders (including stacks of blank groups). */
function isBlankAiStructuredValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (typeof value === "number") return value === 0;
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;

  // Ingredient groups
  if (
    value.every((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const row = entry as { name?: string; items?: unknown[]; steps?: unknown[]; note?: string };
      if (Array.isArray(row.items)) {
        return (
          !String(row.name ?? "").trim() &&
          row.items.every((item) => {
            if (!item || typeof item !== "object") return !String(item ?? "").trim();
            const line = item as { amount?: string; item?: string; notes?: string };
            return (
              !String(line.amount ?? "").trim() &&
              !String(line.item ?? "").trim() &&
              !String(line.notes ?? "").trim()
            );
          })
        );
      }
      if (Array.isArray(row.steps)) {
        return (
          !String(row.name ?? "").trim() &&
          row.steps.every((step) => !String(step ?? "").trim())
        );
      }
      if ("note" in row || "name" in row) {
        return !String(row.name ?? "").trim() && !String(row.note ?? "").trim();
      }
      return false;
    })
  ) {
    return true;
  }
  return false;
}

export function isRecipeAiVerified(meta: RecipeAiMeta | null | undefined) {
  return meta?.verificationStatus === "verified";
}

export function canReplaceFieldOnRegenerate(
  path: string,
  meta: RecipeAiMeta | null | undefined,
  isEmpty = false,
  explicitOverride = false,
): boolean {
  if (!meta) return false;
  if (isRecipeAiVerified(meta) && !explicitOverride) return false;
  if (isFieldLocked(path, meta)) return false;
  if (isFieldProtectedFromBulkAi(path, meta) && !explicitOverride && !isEmpty) return false;
  const provenance = meta.fieldProvenance?.[path];
  if (!provenance?.aiGenerated) return isEmpty;
  if (provenance.humanModifiedAfterGeneration && !isEmpty && !explicitOverride) return false;
  return true;
}

export function shouldApplyDraftField(input: {
  path: string;
  mode: AiMergeMode;
  meta: RecipeAiMeta | null | undefined;
  isEmpty: boolean;
  explicitOverride?: boolean;
}): boolean {
  const { path, mode, meta, isEmpty, explicitOverride = false } = input;
  if (isFieldLocked(path, meta)) return false;
  if (mode === "fill_empty") {
    if (isFieldProtectedFromBulkAi(path, meta)) return false;
    return isEmpty;
  }
  if (mode === "replace_all_ai_fillable") {
    if (isFieldProtectedFromBulkAi(path, meta) && !explicitOverride) return false;
    return true;
  }
  if (mode === "replace_previous_ai") return canReplaceFieldOnRegenerate(path, meta, isEmpty, explicitOverride);
  return false;
}

export function youtubeProvenanceValues(blob: unknown): Record<string, unknown> {
  const state = youtubeMetadataToEditorState(blob);
  return {
    "values.youtube.duration": state.duration,
    "values.youtube.hook": state.hook,
    "values.youtube.timestamps": state.timestamps.map((row) => ({
      timeInput: row.timeInput,
      label: row.label,
    })),
  };
}

export function noteHumanYoutubeMetadataChange(
  meta: RecipeAiMeta | null,
  _previousBlob: unknown,
  nextBlob: unknown,
): RecipeAiMeta | null {
  const next = youtubeProvenanceValues(nextBlob);
  let updated = meta;
  for (const path of Object.keys(next)) {
    updated = noteHumanEditorChange(updated, path, next[path]);
  }
  return updated;
}

export function mergeYoutubeMetadataValues(input: {
  current: unknown;
  draft: unknown;
  mode: AiMergeMode;
  meta: RecipeAiMeta | null | undefined;
}): Record<string, unknown> | null {
  const current = youtubeMetadataToEditorState(input.current);
  const draft = youtubeMetadataToEditorState(input.draft);
  const next: YoutubeMetadataEditorState = {
    ...current,
    preserved: { ...current.preserved },
    timestamps: current.timestamps.map((row) => ({ ...row })),
    relatedVideos: current.relatedVideos.map((row) => ({ ...row })),
  };

  const apply = (path: string, isEmpty: boolean, applyValue: () => void) => {
    if (shouldApplyDraftField({ path, mode: input.mode, meta: input.meta, isEmpty })) {
      applyValue();
    }
  };

  apply("values.youtube.duration", !current.duration.trim(), () => {
    next.duration = draft.duration;
  });
  apply("values.youtube.hook", !current.hook.trim(), () => {
    next.hook = draft.hook;
  });
  apply(
    "values.youtube.timestamps",
    !current.timestamps.some((row) => row.label.trim() || row.timeInput.trim()),
    () => {
      const draftHasChapters = draft.timestamps.some(
        (row) => row.label.trim() || row.timeInput.trim(),
      );
      // YouTube-owned / already-synced chapters must not be wiped or replaced by Gemini.
      if (!draftHasChapters) return;
      if (current.timestamps.some((row) => row.label.trim() || row.timeInput.trim())) return;
      next.timestamps = draft.timestamps.map((row) => ({ ...row }));
    },
  );

  return serializeYoutubeMetadataEditorState(next);
}

export function collectYoutubeAppliedPaths(input: {
  mode: AiMergeMode;
  meta: RecipeAiMeta | null | undefined;
  before: unknown;
  after: unknown;
}): string[] {
  const before = youtubeProvenanceValues(input.before);
  const after = youtubeProvenanceValues(input.after);
  const paths: string[] = [];
  for (const path of Object.keys(after)) {
    const isEmpty =
      path === "values.youtube.duration"
        ? !String(before[path] ?? "").trim()
        : path === "values.youtube.hook"
          ? !String(before[path] ?? "").trim()
          : !Array.isArray(before[path]) ||
            !(before[path] as unknown[]).some(
              (row) =>
                typeof row === "object" &&
                row &&
                (String((row as { label?: string }).label ?? "").trim() ||
                  String((row as { timeInput?: string }).timeInput ?? "").trim()),
            );
    if (
      shouldApplyDraftField({ path, mode: input.mode, meta: input.meta, isEmpty }) &&
      !aiValuesEqual(before[path], after[path])
    ) {
      paths.push(path);
    }
  }
  return paths;
}

export function buildProvenanceSnapshots(input: {
  title: string;
  slug: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  fields: SchemaField[];
}): Record<string, AiFieldProvenance> {
  const snapshots: Record<string, AiFieldProvenance> = {};

  const add = (path: string, value: unknown) => {
    snapshots[path] = {
      aiGenerated: true,
      aiGeneratedValue: value,
      humanModifiedAfterGeneration: false,
    };
  };

  add("title", input.title);
  add("slug", input.slug);
  add("excerpt", input.excerpt);
  add("categoryIds", input.categoryIds);

  for (const field of input.fields) {
    if (!isAiFillableFieldKey(field.key)) continue;
    add(`values.${field.key}`, input.values[field.key]);
  }

  if (input.values.youtube) {
    for (const [path, value] of Object.entries(youtubeProvenanceValues(input.values.youtube))) {
      add(path, value);
    }
  }

  return snapshots;
}

export function mergeProvenanceAfterApply(input: {
  previous: RecipeAiMeta | null | undefined;
  mode: AiMergeMode;
  appliedPaths: string[];
  nextSnapshots: Record<string, AiFieldProvenance>;
}): Record<string, AiFieldProvenance> {
  const merged: Record<string, AiFieldProvenance> = { ...(input.previous?.fieldProvenance ?? {}) };

  for (const path of input.appliedPaths) {
    const snapshot = input.nextSnapshots[path];
    if (snapshot) {
      merged[path] = snapshot;
    }
  }

  if (input.mode === "replace_all_ai_fillable") {
    return { ...input.nextSnapshots };
  }

  return merged;
}

export function collectAppliedPaths(input: {
  mode: AiMergeMode;
  meta: RecipeAiMeta | null | undefined;
  fields: SchemaField[];
  before: {
    title: string;
    slug: string;
    excerpt: string;
    categoryIds: string[];
    values: Record<string, unknown>;
  };
  after: {
    title: string;
    slug: string;
    excerpt: string;
    categoryIds: string[];
    values: Record<string, unknown>;
  };
  isEmpty: (path: string, value: unknown, kind?: string) => boolean;
  fieldKind: Map<string, string>;
}): string[] {
  const paths: string[] = [];
  const scalarPaths = ["title", "slug", "excerpt"] as const;

  for (const path of scalarPaths) {
    const value = input.after[path];
    const empty = !String(input.before[path] ?? "").trim();
    if (
      shouldApplyDraftField({ path, mode: input.mode, meta: input.meta, isEmpty: empty }) &&
      !aiValuesEqual(input.before[path], value)
    ) {
      paths.push(path);
    }
  }

  const categoriesEmpty = input.before.categoryIds.length === 0;
  if (
    shouldApplyDraftField({
      path: "categoryIds",
      mode: input.mode,
      meta: input.meta,
      isEmpty: categoriesEmpty,
    }) &&
    !aiValuesEqual(input.before.categoryIds, input.after.categoryIds)
  ) {
    paths.push("categoryIds");
  }

  for (const field of input.fields) {
    if (!isAiFillableFieldKey(field.key)) continue;
    const path = `values.${field.key}`;
    const kind = input.fieldKind.get(field.key);
    const empty = input.isEmpty(path, input.before.values[field.key], kind);
    if (
      shouldApplyDraftField({ path, mode: input.mode, meta: input.meta, isEmpty: empty }) &&
      !aiValuesEqual(input.before.values[field.key], input.after.values[field.key])
    ) {
      paths.push(path);
    }
  }

  paths.push(
    ...collectYoutubeAppliedPaths({
      mode: input.mode,
      meta: input.meta,
      before: input.before.values.youtube,
      after: input.after.values.youtube,
    }),
  );

  return paths;
}
