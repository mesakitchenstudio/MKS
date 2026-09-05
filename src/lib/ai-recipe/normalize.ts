import { fieldValueHasContent } from "@/lib/field-content";
import { emptyValue } from "@/lib/fields";
import { coerceStringList } from "@/lib/coerce-string-list";
import {
  buildProvenanceSnapshots,
  collectAppliedPaths,
  mergeProvenanceAfterApply,
  mergeYoutubeMetadataValues,
  shouldApplyDraftField,
} from "@/lib/ai-recipe/field-tracking";
import { isAiFillableFieldKey } from "@/lib/ai-recipe/schema-version";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import {
  emptyAiSummary,
  isAiConfidence,
  tallyConfidence,
  type AiConfidence,
  type AiFieldAnnotation,
  type RecipeAiMeta,
} from "@/lib/ai-recipe/types";
import { slugify } from "@/lib/fields";
import { buildYoutubeBlobFromAi } from "@/lib/ai-recipe/youtube-chapters";

type ConfidentRaw = {
  value?: unknown;
  confidence?: unknown;
  sourceNote?: unknown;
};

export type NormalizedAiDraft = {
  typeId: string;
  title: string;
  slug: string;
  excerpt: string;
  featured: boolean;
  seasonal: boolean;
  categoryIds: string[];
  values: Record<string, unknown>;
  confidenceByPath: Record<string, AiFieldAnnotation>;
  summary: RecipeAiMeta["summary"];
  insufficientRecipeInformation: boolean;
  insufficientReason: string;
};

function readConfident(raw: unknown): { value: unknown; confidence: AiConfidence; sourceNote: string } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as ConfidentRaw;
  if (!("value" in row)) return null;
  const confidence = isAiConfidence(row.confidence) ? row.confidence : "UNKNOWN";
  return {
    value: row.value,
    confidence,
    sourceNote: String(row.sourceNote ?? "").trim(),
  };
}

/** Accept both Mesa confident wrappers and plain model values. */
function readConfidentOrRaw(
  raw: unknown,
  fallbackConfidence: AiConfidence = "UNKNOWN",
): { value: unknown; confidence: AiConfidence; sourceNote: string } | null {
  if (raw === undefined || raw === null) return null;
  const wrapped = readConfident(raw);
  if (wrapped) return wrapped;
  return {
    value: raw,
    confidence: fallbackConfidence,
    sourceNote: "",
  };
}

function resolveFieldsRaw(root: Record<string, unknown>, fieldKeys: readonly string[]) {
  const bag =
    root.fields && typeof root.fields === "object" && !Array.isArray(root.fields)
      ? { ...(root.fields as Record<string, unknown>) }
      : {};

  // Some model responses nest dynamic fields under `values` (Mesa editor shape)
  // instead of / in addition to `fields`. Prefer `fields`, then `values`, then root.
  const valuesBag =
    root.values && typeof root.values === "object" && !Array.isArray(root.values)
      ? (root.values as Record<string, unknown>)
      : null;

  for (const key of fieldKeys) {
    if (bag[key] !== undefined) continue;
    if (valuesBag && valuesBag[key] !== undefined) {
      bag[key] = valuesBag[key];
      continue;
    }
    if (root[key] !== undefined) {
      bag[key] = root[key];
    }
  }

  return bag;
}

function annotate(
  path: string,
  confidence: AiConfidence,
  sourceNote: string,
  confidenceByPath: Record<string, AiFieldAnnotation>,
  summary: RecipeAiMeta["summary"],
) {
  confidenceByPath[path] = { confidence, sourceNote };
  tallyConfidence(confidence, summary);
}

/** Peel nested { value, confidence, sourceNote } wrappers models sometimes apply recursively. */
function unwrapConfidentLayers(raw: unknown, maxDepth = 4): {
  value: unknown;
  confidence: AiConfidence;
  sourceNote: string;
} {
  let value: unknown = raw;
  let confidence: AiConfidence = "UNKNOWN";
  let sourceNote = "";
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const wrapped = readConfident(value);
    if (!wrapped) break;
    value = wrapped.value;
    confidence = wrapped.confidence;
    sourceNote = wrapped.sourceNote || sourceNote;
  }
  return { value, confidence, sourceNote };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function ingredientLineHasContent(line: { amount: string; item: string; notes: string }) {
  return Boolean(line.amount.trim() || line.item.trim() || line.notes.trim());
}

function normalizeIngredientLine(raw: unknown): {
  amount: string;
  item: string;
  notes: string;
  confidence: AiConfidence;
  sourceNote: string;
} | null {
  const unwrapped = unwrapConfidentLayers(raw);
  const row = asRecord(unwrapped.value);
  if (!row) return null;

  const amount = String(row.amount ?? row.quantity ?? row.qty ?? "").trim();
  const item = String(row.item ?? row.ingredient ?? row.ingredientName ?? "").trim();
  // Models sometimes put the ingredient name in `name` on a flat line (not a group).
  const nameAsItem = !item ? String(row.name ?? "").trim() : "";
  const notes = String(row.notes ?? row.note ?? "").trim();
  const confidence = isAiConfidence(row.confidence)
    ? row.confidence
    : unwrapped.confidence !== "UNKNOWN"
      ? unwrapped.confidence
      : "UNKNOWN";
  const sourceNote = String(row.sourceNote ?? unwrapped.sourceNote ?? "").trim();
  const normalized = {
    amount,
    item: item || nameAsItem,
    notes,
    confidence,
    sourceNote,
  };
  if (!ingredientLineHasContent(normalized)) return null;
  return normalized;
}

function looksLikeFlatIngredientLine(raw: unknown): boolean {
  const unwrapped = unwrapConfidentLayers(raw);
  const row = asRecord(unwrapped.value);
  if (!row) return false;
  const hasItemsBag =
    Array.isArray(row.items) || Array.isArray(row.ingredients) || Array.isArray(row.lines);
  if (hasItemsBag) return false;
  return (
    row.amount != null ||
    row.quantity != null ||
    row.qty != null ||
    row.item != null ||
    row.ingredient != null ||
    row.ingredientName != null ||
    // Flat line using name + amount/quantity
    ((row.name != null || row.notes != null) &&
      (row.amount != null || row.quantity != null || row.qty != null))
  );
}

function readGroupItems(row: Record<string, unknown>): unknown[] {
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.ingredients)) return row.ingredients;
  if (Array.isArray(row.lines)) return row.lines;
  return [];
}

export type NormalizedIngredientGroup = {
  name: string;
  items: { amount: string; item: string; notes: string }[];
};

export function countNonEmptyIngredientItems(groups: NormalizedIngredientGroup[]): number {
  return groups.reduce(
    (sum, group) => sum + group.items.filter((item) => ingredientLineHasContent(item)).length,
    0,
  );
}

/**
 * Coerce Gemini ingredient payloads into Mesa groups.
 * Handles flat ingredient lines, alternate keys, and nested confident wrappers.
 * Never returns stacks of blank placeholder groups.
 */
export function normalizeIngredients(
  value: unknown,
  path: string,
  confidenceByPath: Record<string, AiFieldAnnotation>,
  summary: RecipeAiMeta["summary"],
): NormalizedIngredientGroup[] {
  const unwrapped = unwrapConfidentLayers(value);
  let raw = unwrapped.value;

  // Rare: model returns { groups: [...] } or { ingredients: [...] } instead of a bare array.
  if (!Array.isArray(raw)) {
    const bag = asRecord(raw);
    if (bag) {
      if (Array.isArray(bag.groups)) raw = bag.groups;
      else if (Array.isArray(bag.ingredients)) raw = bag.ingredients;
      else if (Array.isArray(bag.items)) raw = bag.items;
    }
  }

  if (!Array.isArray(raw)) return [];

  // Flat list of ingredient lines → one unnamed group.
  if (raw.length > 0 && raw.every((entry) => looksLikeFlatIngredientLine(entry))) {
    const items: NormalizedIngredientGroup["items"] = [];
    for (const entry of raw) {
      const line = normalizeIngredientLine(entry);
      if (!line) continue;
      const itemIndex = items.length;
      annotate(
        `${path}.0.items.${itemIndex}`,
        line.confidence,
        line.sourceNote,
        confidenceByPath,
        summary,
      );
      items.push({ amount: line.amount, item: line.item, notes: line.notes });
    }
    return items.length ? [{ name: "", items }] : [];
  }

  const groups: NormalizedIngredientGroup[] = [];
  for (const entry of raw) {
    const groupUnwrap = unwrapConfidentLayers(entry);
    const row = asRecord(groupUnwrap.value);
    if (!row) continue;

    // Mis-nested flat line inside an otherwise grouped array.
    if (looksLikeFlatIngredientLine(row)) {
      const line = normalizeIngredientLine(row);
      if (!line) continue;
      if (!groups.length) groups.push({ name: "", items: [] });
      const groupIndex = groups.length - 1;
      const itemIndex = groups[groupIndex].items.length;
      annotate(
        `${path}.${groupIndex}.items.${itemIndex}`,
        line.confidence,
        line.sourceNote,
        confidenceByPath,
        summary,
      );
      groups[groupIndex].items.push({
        amount: line.amount,
        item: line.item,
        notes: line.notes,
      });
      continue;
    }

    const groupName = String(row.name ?? row.sectionName ?? row.title ?? "").trim();
    const rawItems = readGroupItems(row);
    const items: NormalizedIngredientGroup["items"] = [];
    for (const rawItem of rawItems) {
      const line = normalizeIngredientLine(rawItem);
      if (!line) continue;
      const groupIndex = groups.length;
      const itemIndex = items.length;
      annotate(
        `${path}.${groupIndex}.items.${itemIndex}`,
        line.confidence,
        line.sourceNote,
        confidenceByPath,
        summary,
      );
      items.push({ amount: line.amount, item: line.item, notes: line.notes });
    }

    if (!items.length && !groupName) continue;
    if (!items.length) continue; // drop empty named groups too — no blank placeholders
    groups.push({ name: groupName, items });
  }

  // Coalesce stacks of unnamed one-item groups (common AI mistake) into one list.
  return coalesceUnnamedIngredientGroups(groups);
}

function coalesceUnnamedIngredientGroups(
  groups: NormalizedIngredientGroup[],
): NormalizedIngredientGroup[] {
  if (groups.length <= 1) return groups;
  const allUnnamed = groups.every((group) => !group.name.trim());
  if (allUnnamed) {
    return [{ name: "", items: groups.flatMap((group) => group.items) }];
  }
  const merged: NormalizedIngredientGroup[] = [];
  for (const group of groups) {
    const last = merged[merged.length - 1];
    if (!group.name.trim() && last && !last.name.trim()) {
      last.items = [...last.items, ...group.items];
      continue;
    }
    merged.push({ name: group.name, items: [...group.items] });
  }
  return merged;
}

function normalizeNamedNotes(value: unknown, path: string, confidenceByPath: Record<string, AiFieldAnnotation>, summary: RecipeAiMeta["summary"]) {
  const unwrapped = unwrapConfidentLayers(value);
  if (!Array.isArray(unwrapped.value)) return [];
  return unwrapped.value
    .map((entry, index) => {
      const layer = unwrapConfidentLayers(entry);
      const row = asRecord(layer.value) || {};
      const confidence = isAiConfidence(row.confidence)
        ? row.confidence
        : layer.confidence !== "UNKNOWN"
          ? layer.confidence
          : "UNKNOWN";
      annotate(`${path}.${index}`, confidence, String(row.sourceNote ?? layer.sourceNote ?? ""), confidenceByPath, summary);
      return {
        name: String(row.name ?? ""),
        note: String(row.note ?? row.text ?? ""),
      };
    })
    .filter((row) => row.name.trim() || row.note.trim());
}

function normalizeInstructions(value: unknown, path: string, confidenceByPath: Record<string, AiFieldAnnotation>, summary: RecipeAiMeta["summary"]) {
  const unwrapped = unwrapConfidentLayers(value);
  let raw = unwrapped.value;

  // Flat array of step strings / step objects → one section.
  if (Array.isArray(raw) && raw.length > 0) {
    const allSteps = raw.every((entry) => {
      if (typeof entry === "string") return true;
      const row = asRecord(unwrapConfidentLayers(entry).value);
      if (!row) return false;
      return (
        (row.text != null || row.step != null || row.instruction != null) &&
        !Array.isArray(row.steps)
      );
    });
    if (allSteps) {
      const steps = raw
        .map((entry, stepIndex) => {
          if (typeof entry === "string") {
            annotate(`${path}.0.steps.${stepIndex}`, "UNKNOWN", "", confidenceByPath, summary);
            return entry.trim();
          }
          const layer = unwrapConfidentLayers(entry);
          const line = asRecord(layer.value) || {};
          const confidence = isAiConfidence(line.confidence)
            ? line.confidence
            : layer.confidence !== "UNKNOWN"
              ? layer.confidence
              : "UNKNOWN";
          annotate(
            `${path}.0.steps.${stepIndex}`,
            confidence,
            String(line.sourceNote ?? layer.sourceNote ?? ""),
            confidenceByPath,
            summary,
          );
          return String(line.text ?? line.step ?? line.instruction ?? "").trim();
        })
        .filter(Boolean);
      return steps.length ? [{ name: "", steps }] : [];
    }
  }

  if (!Array.isArray(raw)) return [];

  return raw
    .map((group, groupIndex) => {
      const groupLayer = unwrapConfidentLayers(group);
      const row = asRecord(groupLayer.value) || {};
      const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
      const steps = stepsRaw
        .map((step, stepIndex) => {
          if (typeof step === "string") {
            annotate(`${path}.${groupIndex}.steps.${stepIndex}`, "UNKNOWN", "", confidenceByPath, summary);
            return step.trim();
          }
          const layer = unwrapConfidentLayers(step);
          const line = asRecord(layer.value) || {};
          const confidence = isAiConfidence(line.confidence)
            ? line.confidence
            : layer.confidence !== "UNKNOWN"
              ? layer.confidence
              : "UNKNOWN";
          annotate(
            `${path}.${groupIndex}.steps.${stepIndex}`,
            confidence,
            String(line.sourceNote ?? layer.sourceNote ?? ""),
            confidenceByPath,
            summary,
          );
          return String(line.text ?? line.step ?? line.instruction ?? "").trim();
        })
        .filter(Boolean);
      return {
        name: String(row.name ?? row.sectionName ?? "").trim(),
        steps,
      };
    })
    .filter((group) => group.steps.length > 0);
}

function normalizeNutrition(value: unknown) {
  const row = (value || {}) as Record<string, unknown>;
  const num = (key: string) => {
    const n = Number(row[key]);
    return Number.isFinite(n) ? n : 0;
  };
  const out: Record<string, number> = {
    calories: num("calories"),
    carbs: num("carbs"),
    protein: num("protein"),
    fat: num("fat"),
  };
  if (row.fiber != null && Number(row.fiber) !== 0) out.fiber = num("fiber");
  if (row.sugar != null && Number(row.sugar) !== 0) out.sugar = num("sugar");
  return out;
}

function normalizeFieldValue(
  kind: string,
  value: unknown,
  path: string,
  confidenceByPath: Record<string, AiFieldAnnotation>,
  summary: RecipeAiMeta["summary"],
) {
  switch (kind) {
    case "number":
    case "minutes": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    case "boolean":
      return Boolean(value);
    case "list":
    case "tags":
    case "gallery":
      return coerceStringList(value);
    case "namedNotes":
      return normalizeNamedNotes(value, path, confidenceByPath, summary);
    case "ingredients":
      return normalizeIngredients(value, path, confidenceByPath, summary);
    case "instructions":
      return normalizeInstructions(value, path, confidenceByPath, summary);
    case "nutrition":
      return normalizeNutrition(value);
    default:
      return String(value ?? "");
  }
}

export function normalizeAiRecipeResponse(input: {
  raw: unknown;
  typeId: string;
  youtubeUrl: string;
  fields: SchemaField[];
  allowedCategoryIds: Set<string>;
  allowedTypeIds: Set<string>;
}): NormalizedAiDraft {
  const confidenceByPath: Record<string, AiFieldAnnotation> = {};
  const summary = emptyAiSummary();
  const root = (input.raw && typeof input.raw === "object" ? input.raw : {}) as Record<string, unknown>;

  const insufficientRecipeInformation = Boolean(root.insufficientRecipeInformation);
  const insufficientReason = String(root.insufficientReason ?? "").trim();

  const titleC = readConfidentOrRaw(root.title, "VERIFIED");
  const slugC = readConfidentOrRaw(root.slug, "ESTIMATED");
  const excerptC = readConfidentOrRaw(root.excerpt, "HIGH_CONFIDENCE_INFERENCE");
  const featuredC = readConfidentOrRaw(root.featured, "VERIFIED");
  const seasonalC = readConfidentOrRaw(root.seasonal, "VERIFIED");
  const categoriesC = readConfidentOrRaw(root.categoryIds, "HIGH_CONFIDENCE_INFERENCE");

  if (titleC) annotate("title", titleC.confidence, titleC.sourceNote, confidenceByPath, summary);
  if (slugC) annotate("slug", slugC.confidence, slugC.sourceNote, confidenceByPath, summary);
  if (excerptC) annotate("excerpt", excerptC.confidence, excerptC.sourceNote, confidenceByPath, summary);
  if (featuredC) annotate("featured", featuredC.confidence, featuredC.sourceNote, confidenceByPath, summary);
  if (seasonalC) annotate("seasonal", seasonalC.confidence, seasonalC.sourceNote, confidenceByPath, summary);
  if (categoriesC) annotate("categoryIds", categoriesC.confidence, categoriesC.sourceNote, confidenceByPath, summary);

  let typeId = input.typeId;
  if (root.recipeTypeId && String(root.recipeTypeId) !== input.typeId) {
    annotate(
      "recipeTypeId",
      "HIGH_CONFIDENCE_INFERENCE",
      `Model suggested ${String(root.recipeTypeId)}; kept editor type ${input.typeId}`,
      confidenceByPath,
      summary,
    );
  }

  const categoryIds = Array.isArray(categoriesC?.value)
    ? [...new Set(categoriesC.value.map(String).filter((id) => input.allowedCategoryIds.has(id)))]
    : [];

  const title = String(titleC?.value ?? "").trim();
  const slug = slugify(String(slugC?.value ?? title));
  const excerpt = String(excerptC?.value ?? "").trim();
  // Editorial defaults — do not auto-enable
  const featured = false;
  const seasonal = false;

  const fieldsRaw = resolveFieldsRaw(
    root,
    input.fields.map((field) => field.key),
  );
  const values: Record<string, unknown> = {};
  const fieldByKey = new Map(input.fields.map((field) => [field.key, field]));

  for (const field of input.fields) {
    if (!isAiFillableFieldKey(field.key)) {
      values[field.key] = emptyValue(field.kind);
      continue;
    }
    const wrapped = readConfidentOrRaw(fieldsRaw[field.key]);
    if (!wrapped) {
      values[field.key] =
        field.kind === "ingredients" ||
        field.kind === "instructions" ||
        field.kind === "namedNotes"
          ? []
          : emptyValue(field.kind);
      annotate(`values.${field.key}`, "UNKNOWN", "Missing from model response", confidenceByPath, summary);
      continue;
    }
    annotate(`values.${field.key}`, wrapped.confidence, wrapped.sourceNote, confidenceByPath, summary);
    values[field.key] = normalizeFieldValue(
      field.kind,
      wrapped.value,
      `values.${field.key}`,
      confidenceByPath,
      summary,
    );
  }

  reconcileStructuredFieldConfidence(values, input.fields, confidenceByPath);

  // Reject unknown keys silently (do not pass through)
  for (const key of Object.keys(fieldsRaw)) {
    if (!fieldByKey.has(key) || !isAiFillableFieldKey(key)) continue;
  }

  // Preserve exact source URL
  if (fieldByKey.has("youtubeUrl")) {
    values.youtubeUrl = input.youtubeUrl;
    annotate("values.youtubeUrl", "VERIFIED", "Original URL supplied by editor", confidenceByPath, summary);
  }

  // Never invent hero image
  if (fieldByKey.has("image")) {
    values.image = "";
  }

  if (fieldByKey.has("youtube")) {
    const youtubeBlob = buildYoutubeBlobFromAi({
      raw: root.youtubeMetadata ?? root.youtube,
      confidenceByPath,
      summary,
    });
    if (youtubeBlob) {
      values.youtube = youtubeBlob;
    }
  }

  reconcileTimingFields(values, input.fields);

  return {
    typeId,
    title,
    slug,
    excerpt,
    featured,
    seasonal,
    categoryIds,
    values,
    confidenceByPath,
    summary,
    insufficientRecipeInformation,
    insufficientReason,
  };
}

export type AiMergeMode = "fill_empty" | "replace_all_ai_fillable" | "replace_previous_ai";

function reconcileTimingFields(values: Record<string, unknown>, fields: SchemaField[]) {
  const hasRiseHours = fields.some((field) => field.key === "riseHours");
  if (!hasRiseHours) return;
  const rise = typeof values.riseHours === "number" ? values.riseHours : Number(values.riseHours);
  const rest = typeof values.restMinutes === "number" ? values.restMinutes : Number(values.restMinutes);
  if (Number.isFinite(rise) && rise > 0 && Number.isFinite(rest) && rest > 0) {
    if (Math.abs(rise * 60 - rest) <= 5) {
      values.restMinutes = 0;
    }
  }
}

/**
 * VERIFIED/INFERRED structured fields with zero real rows are inconsistent — downgrade.
 */
export function reconcileStructuredFieldConfidence(
  values: Record<string, unknown>,
  fields: SchemaField[],
  confidenceByPath: Record<string, AiFieldAnnotation>,
) {
  for (const field of fields) {
    if (
      field.kind !== "ingredients" &&
      field.kind !== "instructions" &&
      field.kind !== "namedNotes"
    ) {
      continue;
    }
    const path = `values.${field.key}`;
    const annotation = confidenceByPath[path];
    if (!annotation) continue;
    if (
      annotation.confidence !== "VERIFIED" &&
      annotation.confidence !== "HIGH_CONFIDENCE_INFERENCE"
    ) {
      continue;
    }
    if (fieldValueHasContent(values[field.key], field.kind)) continue;

    console.warn(
      `[ai-recipe] Inconsistent confidence for ${path}: ${annotation.confidence} but zero non-empty rows. Downgrading to UNKNOWN.`,
    );
    confidenceByPath[path] = {
      confidence: "UNKNOWN",
      sourceNote:
        annotation.sourceNote?.trim() ||
        "Model claimed verified/inferred content but no usable structured rows were returned.",
    };
  }
}

function isEditorValueEmpty(kind: string | undefined, value: unknown) {
  if (!kind) return !String(value ?? "").trim();
  return !fieldValueHasContent(value, kind);
}

export function editorHasContent(input: {
  title: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  fields: SchemaField[];
}) {
  if (input.title.trim() || input.excerpt.trim() || input.categoryIds.length) return true;
  return input.fields.some((field) => fieldValueHasContent(input.values[field.key], field.kind));
}

export function mergeAiDraftIntoEditor(
  current: {
    title: string;
    slug: string;
    excerpt: string;
    featured: boolean;
    seasonal: boolean;
    categoryIds: string[];
    values: Record<string, unknown>;
  },
  draft: NormalizedAiDraft,
  fields: SchemaField[],
  mode: AiMergeMode,
  meta?: RecipeAiMeta | null,
): {
  title: string;
  slug: string;
  excerpt: string;
  featured: boolean;
  seasonal: boolean;
  categoryIds: string[];
  values: Record<string, unknown>;
  confidenceByPath: Record<string, AiFieldAnnotation>;
  appliedPaths: string[];
  fieldProvenance: RecipeAiMeta["fieldProvenance"];
} {
  const fieldKind = new Map(fields.map((field) => [field.key, field.kind]));
  const nextValues = { ...current.values };
  const confidenceByPath: Record<string, AiFieldAnnotation> = {};

  const takeScalar = (
    path: "title" | "slug" | "excerpt",
    currentValue: string,
    draftValue: string,
    annotation: AiFieldAnnotation | undefined,
  ) => {
    const isEmpty = !currentValue.trim();
    if (shouldApplyDraftField({ path, mode, meta, isEmpty })) {
      if (annotation) confidenceByPath[path] = annotation;
      return draftValue;
    }
    return currentValue;
  };

  const title = takeScalar("title", current.title, draft.title, draft.confidenceByPath.title);
  const slug = takeScalar("slug", current.slug, draft.slug, draft.confidenceByPath.slug);
  const excerpt = takeScalar("excerpt", current.excerpt, draft.excerpt, draft.confidenceByPath.excerpt);

  let categoryIds = current.categoryIds;
  if (
    shouldApplyDraftField({
      path: "categoryIds",
      mode,
      meta,
      isEmpty: current.categoryIds.length === 0,
    })
  ) {
    categoryIds = draft.categoryIds;
    if (draft.confidenceByPath.categoryIds) {
      confidenceByPath.categoryIds = draft.confidenceByPath.categoryIds;
    }
  }

  for (const field of fields) {
    if (!isAiFillableFieldKey(field.key)) continue;
    const path = `values.${field.key}`;
    const currentValue = current.values[field.key];
    const draftValue = draft.values[field.key];
    const empty = isEditorValueEmpty(fieldKind.get(field.key), currentValue);
    if (shouldApplyDraftField({ path, mode, meta, isEmpty: empty })) {
      nextValues[field.key] = draftValue;
      for (const [key, annotation] of Object.entries(draft.confidenceByPath)) {
        if (key === path || key.startsWith(`${path}.`)) {
          confidenceByPath[key] = annotation;
        }
      }
    }
  }

  if (draft.values.youtube) {
    const mergedYoutube = mergeYoutubeMetadataValues({
      current: current.values.youtube,
      draft: draft.values.youtube,
      mode,
      meta,
    });
    if (mergedYoutube) {
      nextValues.youtube = mergedYoutube;
      for (const [key, annotation] of Object.entries(draft.confidenceByPath)) {
        if (key.startsWith("values.youtube.")) {
          confidenceByPath[key] = annotation;
        }
      }
    }
  }

  const merged = {
    title,
    slug,
    excerpt,
    featured: current.featured,
    seasonal: current.seasonal,
    categoryIds,
    values: nextValues,
  };

  const appliedPaths = collectAppliedPaths({
    mode,
    meta,
    fields,
    before: current,
    after: merged,
    fieldKind,
    isEmpty: (_path, value, kind) => isEditorValueEmpty(kind, value),
  });

  const nextSnapshots = buildProvenanceSnapshots({
    title: merged.title,
    slug: merged.slug,
    excerpt: merged.excerpt,
    categoryIds: merged.categoryIds,
    values: merged.values,
    fields,
  });

  const fieldProvenance = mergeProvenanceAfterApply({
    previous: meta,
    mode,
    appliedPaths,
    nextSnapshots,
  });

  return {
    ...merged,
    confidenceByPath,
    appliedPaths,
    fieldProvenance,
  };
}
