import { fieldValueHasContent } from "@/lib/field-content";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { isAiFillableFieldKey, type SchemaField } from "@/lib/ai-recipe/schema-version";

/** Keys that Fill missing / field AI must never touch by default. */
export const PROTECTED_AI_FILL_KEYS = new Set([
  "ingredients",
  "instructions",
  "image",
  "youtube",
  "floatingYoutubeUrl",
  "youtubeUrl",
]);

export type MissingAiFieldReason = "empty" | "needs_input";

export type MissingAiField = {
  /** Absolute path used in confidence/provenance (e.g. excerpt, values.cuisine). */
  path: string;
  /** Field key or scalar name. */
  key: string;
  label: string;
  kind: string;
  reason: MissingAiFieldReason;
  /** Section hint for tab badges. */
  section?: "basics" | "details" | "content" | "media" | "advanced";
};

export type MissingAiFieldsResult = {
  missing: MissingAiField[];
  counts: {
    missing: number;
    verified: number;
    inferred: number;
    estimated: number;
  };
};

const BASICS_KEYS = new Set(["excerpt"]);
const DETAILS_KEYS = new Set([
  "difficulty",
  "prepMinutes",
  "bakeMinutes",
  "cookMinutes",
  "restMinutes",
  "utensils",
  "servings",
  "servingsUnit",
  "course",
  "method",
  "holiday",
  "cuisine",
  "dishName",
  "tags",
]);
const CONTENT_KEYS = new Set([
  "intro",
  "whyItWorks",
  "keyIngredients",
  "tips",
  "faqs",
  "notes",
  "ingredients",
  "instructions",
]);
const MEDIA_KEYS = new Set(["imageAlt", "image", "youtubeUrl", "floatingYoutubeUrl", "youtube"]);
const ADVANCED_KEYS = new Set(["nutrition"]);

function sectionForKey(key: string): MissingAiField["section"] {
  if (BASICS_KEYS.has(key)) return "basics";
  if (DETAILS_KEYS.has(key)) return "details";
  if (CONTENT_KEYS.has(key)) return "content";
  if (MEDIA_KEYS.has(key)) return "media";
  if (ADVANCED_KEYS.has(key)) return "advanced";
  return "details";
}

function isEmptyForKind(kind: string | undefined, value: unknown): boolean {
  if (!kind) return !String(value ?? "").trim();
  return !fieldValueHasContent(value, kind);
}

function confidenceAt(meta: RecipeAiMeta | null | undefined, path: string) {
  return meta?.confidenceByPath?.[path]?.confidence;
}

function isHumanLocked(meta: RecipeAiMeta | null | undefined, path: string): boolean {
  return Boolean(meta?.fieldProvenance?.[path]?.humanModifiedAfterGeneration);
}

function isVerifiedPath(meta: RecipeAiMeta | null | undefined, path: string): boolean {
  return confidenceAt(meta, path) === "VERIFIED";
}

/**
 * Canonical list of AI-fillable fields that are empty or marked Needs input (UNKNOWN).
 * Used by Fill missing fields, tab badges, and field-level eligibility checks.
 */
export function listMissingAiFillableFields(input: {
  fields: SchemaField[];
  title: string;
  slug: string;
  excerpt: string;
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
}): MissingAiFieldsResult {
  const meta = input.aiMeta ?? null;
  const missing: MissingAiField[] = [];

  // Excerpt is fillable when empty or UNKNOWN; never when verified/human-locked/populated non-UNKNOWN.
  pushScalarMissing(missing, {
    path: "excerpt",
    key: "excerpt",
    label: "Excerpt",
    kind: "textarea",
    value: input.excerpt,
    meta,
    section: "basics",
  });

  for (const field of input.fields) {
    if (!isAiFillableFieldKey(field.key)) continue;
    if (PROTECTED_AI_FILL_KEYS.has(field.key)) continue;

    const path = `values.${field.key}`;
    if (isHumanLocked(meta, path) || isVerifiedPath(meta, path)) continue;

    const value = input.values[field.key];
    const empty = isEmptyForKind(field.kind, value);
    const confidence = confidenceAt(meta, path);
    const needsInput = confidence === "UNKNOWN";

    if (!empty && !needsInput) continue;

    missing.push({
      path,
      key: field.key,
      label: field.label,
      kind: field.kind,
      reason: empty ? "empty" : "needs_input",
      section: sectionForKey(field.key),
    });
  }

  const summary = meta?.summary;
  return {
    missing,
    counts: {
      missing: missing.length,
      verified: summary?.verified ?? 0,
      inferred: summary?.inferred ?? 0,
      estimated: summary?.estimated ?? 0,
    },
  };
}

function pushScalarMissing(
  missing: MissingAiField[],
  input: {
    path: string;
    key: string;
    label: string;
    kind: string;
    value: string;
    meta: RecipeAiMeta | null;
    section: MissingAiField["section"];
  },
) {
  if (isHumanLocked(input.meta, input.path) || isVerifiedPath(input.meta, input.path)) return;
  const empty = !String(input.value ?? "").trim();
  const needsInput = confidenceAt(input.meta, input.path) === "UNKNOWN";
  if (!empty && !needsInput) return;
  missing.push({
    path: input.path,
    key: input.key,
    label: input.label,
    kind: input.kind,
    reason: empty ? "empty" : "needs_input",
    section: input.section,
  });
}

/** True when a specific field path is eligible for targeted Fill / Generate. */
export function isFieldEligibleForTargetedFill(input: {
  path: string;
  key: string;
  kind?: string;
  value: unknown;
  aiMeta?: RecipeAiMeta | null;
  /** When true, allow regenerating a populated field (explicit field action). */
  allowRepopulate?: boolean;
}): boolean {
  const meta = input.aiMeta ?? null;
  if (PROTECTED_AI_FILL_KEYS.has(input.key)) return false;
  if (input.path === "title" || input.key === "title") return false;
  if (input.path === "slug" || input.key === "slug") return false;
  if (isHumanLocked(meta, input.path) || isVerifiedPath(meta, input.path)) return false;

  if (input.allowRepopulate) return true;

  const empty = isEmptyForKind(input.kind, input.value);
  const needsInput = confidenceAt(meta, input.path) === "UNKNOWN";
  return empty || needsInput;
}

export function countMissingBySection(missing: MissingAiField[]) {
  const counts: Record<string, number> = {
    basics: 0,
    details: 0,
    content: 0,
    media: 0,
    advanced: 0,
  };
  for (const row of missing) {
    const section = row.section || "details";
    counts[section] = (counts[section] ?? 0) + 1;
  }
  return counts;
}
