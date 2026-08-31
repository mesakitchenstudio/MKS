import { fieldValueHasContent } from "@/lib/field-content";
import type { RecipeAiVideoContext } from "@/lib/ai-recipe/types";
import type { SchemaCategory } from "@/lib/ai-recipe/schema-version";

export type FieldAiIntent = "generate" | "improve" | "alternative";

/** Absolute paths allowed for field-level AI (client + server allowlist). */
export const FIELD_AI_PATHS = new Set([
  "excerpt",
  "categoryIds",
  "values.intro",
  "values.whyItWorks",
  "values.keyIngredients",
  "values.tips",
  "values.faqs",
  "values.notes",
  "values.cuisine",
  "values.holiday",
  "values.method",
  "values.course",
  "values.dishName",
  "values.tags",
  "values.imageAlt",
]);

export function isFieldAiPath(path: string): boolean {
  return FIELD_AI_PATHS.has(path);
}

export function fieldPathToKey(path: string): string {
  if (path === "excerpt" || path === "categoryIds") return path;
  return path.startsWith("values.") ? path.slice("values.".length) : path;
}

export function resolveFieldAiActionLabel(input: {
  path?: string;
  hasContent: boolean;
  intent?: FieldAiIntent;
}): string {
  if (input.path === "categoryIds") {
    return input.hasContent ? "✦ Review categories" : "✦ Suggest categories";
  }
  if (!input.hasContent) return "✦ Generate";
  if (input.intent === "alternative") return "✦ Try another";
  return "✦ Improve";
}

export function fieldPathHasContent(input: {
  path: string;
  kind?: string;
  excerpt?: string;
  categoryIds?: string[];
  value: unknown;
}): boolean {
  if (input.path === "excerpt") return Boolean(String(input.excerpt ?? "").trim());
  if (input.path === "categoryIds") return (input.categoryIds ?? []).length > 0;
  return fieldValueHasContent(input.value, input.kind || "text");
}

/** Deduplicate tags; prefer shorter canonical forms when one tag contains another. */
export function dedupeSuggestedTags(tags: string[], max = 12): string[] {
  const normalized = tags
    .map((tag) => String(tag ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const tag of normalized) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    const dominated = out.some((existing) => {
      const a = existing.toLowerCase();
      const b = key;
      return a !== b && (a.includes(b) || b.includes(a));
    });
    if (dominated) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

function truncateText(value: unknown, max: number): string {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function instructionSummary(values: Record<string, unknown>) {
  const sections = Array.isArray(values.instructions)
    ? (values.instructions as { name?: string; steps?: unknown[] }[])
    : [];
  return sections.slice(0, 8).map((section) => ({
    name: section.name,
    stepCount: Array.isArray(section.steps) ? section.steps.length : 0,
  }));
}

function ingredientSummary(values: Record<string, unknown>) {
  const groups = Array.isArray(values.ingredients)
    ? (values.ingredients as { name?: string; items?: { item?: string; amount?: string }[] }[])
    : [];
  return groups
    .flatMap((group) =>
      (group.items ?? []).slice(0, 12).map((item) => ({
        item: item.item,
        amount: item.amount,
        group: group.name,
      })),
    )
    .slice(0, 24);
}

/**
 * Compact, field-specific context for targeted Gemini calls.
 * Never includes raw video payloads.
 */
export function buildTargetedFieldContext(input: {
  path: string;
  current: {
    title: string;
    excerpt: string;
    categoryIds?: string[];
    values: Record<string, unknown>;
  };
  videoContext?: RecipeAiVideoContext | null;
  categories?: SchemaCategory[];
  currentValue?: unknown;
  intent?: FieldAiIntent;
}): Record<string, unknown> {
  const { path, current, videoContext } = input;
  const key = fieldPathToKey(path);
  const base: Record<string, unknown> = {
    title: current.title,
    recipeTypeContext: {
      method: current.values.method,
      course: current.values.course,
      cuisine: current.values.cuisine,
      servings: current.values.servings,
      servingsUnit: current.values.servingsUnit,
    },
  };

  if (input.intent === "improve" || input.intent === "alternative") {
    base.currentValue = input.currentValue;
    base.task =
      input.intent === "alternative"
        ? "Propose a meaningfully different alternative."
        : "Improve clarity and usefulness while staying accurate.";
  }

  switch (path) {
    case "excerpt":
      return {
        ...base,
        intro: truncateText(current.values.intro, 300),
        whyItWorks: truncateText(current.values.whyItWorks, 200),
      };
    case "categoryIds":
      return {
        ...base,
        intro: truncateText(current.values.intro, 250),
        method: current.values.method,
        course: current.values.course,
        cuisine: current.values.cuisine,
        ingredients: ingredientSummary(current.values),
        instructions: instructionSummary(current.values),
        existingCategoryIds: input.current.categoryIds ?? [],
        taxonomy: (input.categories ?? []).map((category) => ({
          id: category.id,
          name: category.name,
          group: category.group,
        })),
      };
    case "values.whyItWorks":
      return {
        ...base,
        intro: truncateText(current.values.intro, 400),
        ingredients: ingredientSummary(current.values),
        instructions: instructionSummary(current.values),
        method: current.values.method,
        semanticSummary: videoContext?.semanticSummary
          ? truncateText(videoContext.semanticSummary, 500)
          : undefined,
      };
    case "values.intro":
      return {
        ...base,
        excerpt: truncateText(current.excerpt, 200),
        whyItWorks: truncateText(current.values.whyItWorks, 200),
        dishContext: videoContext?.dishContext,
        ingredients: ingredientSummary(current.values).slice(0, 8),
      };
    case "values.imageAlt":
      return {
        ...base,
        imageUrl: current.values.image,
        imageDescriptionHint: truncateText(current.values.imageAlt, 200),
        intro: truncateText(current.values.intro, 200),
        dishContext: videoContext?.dishContext,
      };
    case "values.tags":
      return {
        ...base,
        intro: truncateText(current.values.intro, 200),
        cuisine: current.values.cuisine,
        method: current.values.method,
        course: current.values.course,
        existingTags: Array.isArray(current.values.tags) ? current.values.tags : [],
      };
    case "values.faqs":
      return {
        ...base,
        ingredients: ingredientSummary(current.values),
        method: current.values.method,
        instructions: instructionSummary(current.values),
        faqQuestion:
          Array.isArray(input.currentValue) && input.currentValue.length
            ? (input.currentValue as { name?: string }[])[0]?.name
            : undefined,
      };
    default:
      if (key === "cuisine" || key === "holiday" || key === "method" || key === "course") {
        return {
          ...base,
          intro: truncateText(current.values.intro, 300),
          ingredients: ingredientSummary(current.values).slice(0, 10),
        };
      }
      return {
        ...base,
        intro: truncateText(current.values.intro, 300),
        whyItWorks: truncateText(current.values.whyItWorks, 200),
        ingredients: ingredientSummary(current.values).slice(0, 10),
        instructions: instructionSummary(current.values),
      };
  }
}

export function fieldAiResponseSchemaHint(path: string): string {
  if (path === "categoryIds") {
    return '{ "categoryIds": ["<existing-category-id>", ...] } — only IDs from taxonomy.';
  }
  if (path === "values.tags") {
    return '{ "tags": ["tag1", "tag2"] } — max 12, deduped editorial tags.';
  }
  if (path === "values.faqs" || path === "values.keyIngredients" || path === "values.tips") {
    return '{ "value": [{ "name": "...", "note": "..." }] }';
  }
  return '{ "value": "..." }';
}

export function normalizeFieldAiResponse(input: {
  path: string;
  raw: unknown;
  allowedCategoryIds?: Set<string>;
}): unknown | null {
  const { path, raw } = input;
  if (raw == null) return null;

  if (path === "categoryIds") {
    const ids =
      Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { categoryIds?: unknown }).categoryIds)
          ? (raw as { categoryIds: unknown[] }).categoryIds
          : [];
    const allowed = input.allowedCategoryIds;
    const filtered = ids
      .map((id) => String(id ?? "").trim())
      .filter((id) => id && (!allowed || allowed.has(id)));
    return filtered.length ? filtered : null;
  }

  if (path === "values.tags") {
    const tags = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { tags?: unknown }).tags)
        ? (raw as { tags: unknown[] }).tags
        : [];
    const deduped = dedupeSuggestedTags(tags.map((tag) => String(tag ?? "")));
    return deduped.length ? deduped : null;
  }

  if (typeof raw === "object" && raw !== null && "value" in (raw as object)) {
    return (raw as { value: unknown }).value;
  }

  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw.length) return raw;
  return null;
}
