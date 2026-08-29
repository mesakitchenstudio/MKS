import { fieldValueHasContent } from "@/lib/field-content";
import { emptyValue } from "@/lib/fields";
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
  if (!raw || typeof raw !== "object") return null;
  const row = raw as ConfidentRaw;
  const confidence = isAiConfidence(row.confidence) ? row.confidence : "UNKNOWN";
  return {
    value: row.value,
    confidence,
    sourceNote: String(row.sourceNote ?? "").trim(),
  };
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

function normalizeNamedNotes(value: unknown, path: string, confidenceByPath: Record<string, AiFieldAnnotation>, summary: RecipeAiMeta["summary"]) {
  if (!Array.isArray(value)) return emptyValue("namedNotes");
  return value.map((entry, index) => {
    const row = (entry || {}) as Record<string, unknown>;
    const confidence = isAiConfidence(row.confidence) ? row.confidence : "UNKNOWN";
    annotate(`${path}.${index}`, confidence, String(row.sourceNote ?? ""), confidenceByPath, summary);
    return {
      name: String(row.name ?? ""),
      note: String(row.note ?? ""),
    };
  });
}

function normalizeIngredients(value: unknown, path: string, confidenceByPath: Record<string, AiFieldAnnotation>, summary: RecipeAiMeta["summary"]) {
  if (!Array.isArray(value)) return emptyValue("ingredients");
  return value.map((group, groupIndex) => {
    const row = (group || {}) as { name?: string; items?: unknown[] };
    const items = Array.isArray(row.items) ? row.items : [];
    return {
      name: String(row.name ?? ""),
      items: items.map((item, itemIndex) => {
        const line = (item || {}) as Record<string, unknown>;
        const confidence = isAiConfidence(line.confidence) ? line.confidence : "UNKNOWN";
        annotate(
          `${path}.${groupIndex}.items.${itemIndex}`,
          confidence,
          String(line.sourceNote ?? ""),
          confidenceByPath,
          summary,
        );
        const ingredientName = String(line.item ?? line.ingredient ?? "");
        return {
          amount: String(line.amount ?? ""),
          item: ingredientName,
          notes: String(line.notes ?? ""),
        };
      }),
    };
  });
}

function normalizeInstructions(value: unknown, path: string, confidenceByPath: Record<string, AiFieldAnnotation>, summary: RecipeAiMeta["summary"]) {
  if (!Array.isArray(value)) return emptyValue("instructions");
  return value.map((group, groupIndex) => {
    const row = (group || {}) as { name?: string; sectionName?: string | null; steps?: unknown[] };
    const steps = Array.isArray(row.steps) ? row.steps : [];
    return {
      name: String(row.name ?? row.sectionName ?? ""),
      steps: steps.map((step, stepIndex) => {
        if (typeof step === "string") {
          annotate(`${path}.${groupIndex}.steps.${stepIndex}`, "UNKNOWN", "", confidenceByPath, summary);
          return step;
        }
        const line = (step || {}) as Record<string, unknown>;
        const confidence = isAiConfidence(line.confidence) ? line.confidence : "UNKNOWN";
        annotate(
          `${path}.${groupIndex}.steps.${stepIndex}`,
          confidence,
          String(line.sourceNote ?? ""),
          confidenceByPath,
          summary,
        );
        return String(line.text ?? "");
      }),
    };
  });
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
      return Array.isArray(value) ? value.map((item) => String(item ?? "")) : [];
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

  const titleC = readConfident(root.title);
  const slugC = readConfident(root.slug);
  const excerptC = readConfident(root.excerpt);
  const featuredC = readConfident(root.featured);
  const seasonalC = readConfident(root.seasonal);
  const categoriesC = readConfident(root.categoryIds);

  if (titleC) annotate("title", titleC.confidence, titleC.sourceNote, confidenceByPath, summary);
  if (slugC) annotate("slug", slugC.confidence, slugC.sourceNote, confidenceByPath, summary);
  if (excerptC) annotate("excerpt", excerptC.confidence, excerptC.sourceNote, confidenceByPath, summary);
  if (featuredC) annotate("featured", featuredC.confidence, featuredC.sourceNote, confidenceByPath, summary);
  if (seasonalC) annotate("seasonal", seasonalC.confidence, seasonalC.sourceNote, confidenceByPath, summary);
  if (categoriesC) annotate("categoryIds", categoriesC.confidence, categoriesC.sourceNote, confidenceByPath, summary);

  let typeId = String(root.recipeTypeId || input.typeId);
  if (!input.allowedTypeIds.has(typeId)) typeId = input.typeId;

  const categoryIds = Array.isArray(categoriesC?.value)
    ? [...new Set(categoriesC.value.map(String).filter((id) => input.allowedCategoryIds.has(id)))]
    : [];

  const title = String(titleC?.value ?? "").trim();
  const slug = slugify(String(slugC?.value ?? title));
  const excerpt = String(excerptC?.value ?? "").trim();
  // Editorial defaults — do not auto-enable
  const featured = false;
  const seasonal = false;

  const fieldsRaw =
    root.fields && typeof root.fields === "object" ? (root.fields as Record<string, unknown>) : {};
  const values: Record<string, unknown> = {};
  const fieldByKey = new Map(input.fields.map((field) => [field.key, field]));

  for (const field of input.fields) {
    if (!isAiFillableFieldKey(field.key)) {
      values[field.key] = emptyValue(field.kind);
      continue;
    }
    const wrapped = readConfident(fieldsRaw[field.key]);
    if (!wrapped) {
      values[field.key] = emptyValue(field.kind);
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

export type AiMergeMode = "fill_empty" | "replace";

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
): {
  title: string;
  slug: string;
  excerpt: string;
  featured: boolean;
  seasonal: boolean;
  categoryIds: string[];
  values: Record<string, unknown>;
  confidenceByPath: Record<string, AiFieldAnnotation>;
} {
  const fieldKind = new Map(fields.map((field) => [field.key, field.kind]));
  const nextValues = { ...current.values };
  const confidenceByPath: Record<string, AiFieldAnnotation> = {};

  const takeScalar = (
    path: string,
    currentValue: string,
    draftValue: string,
    annotation: AiFieldAnnotation | undefined,
  ) => {
    if (mode === "replace" || !currentValue.trim()) {
      if (annotation) confidenceByPath[path] = annotation;
      return draftValue;
    }
    return currentValue;
  };

  const title = takeScalar("title", current.title, draft.title, draft.confidenceByPath.title);
  const slug = takeScalar("slug", current.slug, draft.slug, draft.confidenceByPath.slug);
  const excerpt = takeScalar("excerpt", current.excerpt, draft.excerpt, draft.confidenceByPath.excerpt);

  let categoryIds = current.categoryIds;
  if (mode === "replace" || current.categoryIds.length === 0) {
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
    if (mode === "replace" || empty) {
      nextValues[field.key] = draftValue;
      // Copy related nested annotations
      for (const [key, annotation] of Object.entries(draft.confidenceByPath)) {
        if (key === path || key.startsWith(`${path}.`)) {
          confidenceByPath[key] = annotation;
        }
      }
    }
  }

  return {
    title,
    slug,
    excerpt,
    featured: current.featured,
    seasonal: current.seasonal,
    categoryIds,
    values: nextValues,
    confidenceByPath,
  };
}
