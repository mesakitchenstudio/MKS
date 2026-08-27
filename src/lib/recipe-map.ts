import type { Category, Faq, IngredientGroup, InstructionGroup, Nutrition, Recipe } from "@/data/types";
import { CORE_VALUE_KEYS } from "@/lib/fields";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";

export type DbRecipeRecord = {
  slug: string;
  title: string;
  excerpt: string;
  featured: boolean;
  seasonal: boolean;
  publishedAt: Date | null;
  updatedAt: Date;
  values: string | Record<string, unknown>;
  categories: { category: { slug: string } }[];
  type?: { fields: { key: string; label: string; kind: string; sortOrder: number }[] };
};

export type ExtraField = {
  key: string;
  label: string;
  kind: string;
  value: unknown;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && !Number.isNaN(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asFaqs(value: unknown): Faq[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as { name?: string; note?: string; question?: string; answer?: string };
    return {
      question: row.question || row.name || "",
      answer: row.answer || row.note || "",
    };
  });
}

function asKeyIngredients(value: unknown): { name: string; note: string }[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item as { name?: string; note?: string };
    return { name: row.name || "", note: row.note || "" };
  });
}

function asNutrition(value: unknown): Nutrition {
  const row = (value || {}) as Partial<Nutrition>;
  return {
    calories: asNumber(row.calories),
    carbs: asNumber(row.carbs),
    protein: asNumber(row.protein),
    fat: asNumber(row.fat),
    fiber: row.fiber,
    sugar: row.sugar,
  };
}

export function parseValues(raw: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    // Some rows store double-encoded JSON strings.
    if (typeof parsed === "string") {
      return parseValues(parsed);
    }
    return {};
  } catch {
    return {};
  }
}

export function toPublicRecipe(record: DbRecipeRecord): Recipe & { extras: ExtraField[] } {
  const values = parseValues(record.values);
  const extras: ExtraField[] = (record.type?.fields || [])
    .filter((field) => !CORE_VALUE_KEYS.includes(field.key as (typeof CORE_VALUE_KEYS)[number]))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((field) => ({
      key: field.key,
      label: field.label,
      kind: field.kind,
      value: values[field.key],
    }))
    .filter((field) => {
      const value = field.value;
      if (value == null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      return true;
    });

  return {
    slug: record.slug,
    title: record.title,
    excerpt: record.excerpt,
    intro: asString(values.intro),
    whyItWorks: asString(values.whyItWorks),
    keyIngredients: asKeyIngredients(values.keyIngredients),
    tips: asStringArray(values.tips),
    faqs: asFaqs(values.faqs),
    image: asString(values.image),
    imageAlt: asString(values.imageAlt, record.title),
    youtubeUrl: asString(values.youtubeUrl) || undefined,
    floatingYoutubeUrl: asString(values.floatingYoutubeUrl) || undefined,
    youtube: parseRecipeYoutubeBlob(values.youtube) ?? undefined,
    publishedAt: (record.publishedAt || record.updatedAt).toISOString().slice(0, 10),
    updatedAt: record.updatedAt.toISOString().slice(0, 10),
    prepMinutes: asNumber(values.prepMinutes),
    cookMinutes:
      typeof values.bakeMinutes === "number" ? asNumber(values.bakeMinutes) : asNumber(values.cookMinutes),
    bakeMinutes:
      typeof values.bakeMinutes === "number" ? asNumber(values.bakeMinutes) : asNumber(values.cookMinutes),
    restMinutes: asNumber(values.restMinutes),
    difficulty: asString(values.difficulty, "Easy") || "Easy",
    utensils: asStringArray(values.utensils),
    servings: asNumber(values.servings, 1),
    servingsUnit: asString(values.servingsUnit, "servings"),
    course: asString(values.course, "Recipe"),
    method: asString(values.method),
    holiday: asString(values.holiday) || undefined,
    cuisine: asString(values.cuisine),
    categories: record.categories.map((item) => item.category.slug),
    tags: asStringArray(values.tags),
    featured: record.featured,
    seasonal: record.seasonal,
    ingredients: (values.ingredients as IngredientGroup[]) || [],
    instructions: (values.instructions as InstructionGroup[]) || [],
    notes: asStringArray(values.notes),
    nutrition: asNutrition(values.nutrition),
    extras,
  };
}

export function toPublicCategory(row: { slug: string; name: string; description: string; group: string }): Category {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    group: row.group as Category["group"],
  };
}

export function recipeToValues(recipe: Recipe): Record<string, unknown> {
  return {
    image: recipe.image,
    imageAlt: recipe.imageAlt,
    youtubeUrl: recipe.youtubeUrl || "",
    floatingYoutubeUrl: recipe.floatingYoutubeUrl || "",
    ...(recipe.youtube ? { youtube: recipe.youtube } : {}),
    intro: recipe.intro,
    whyItWorks: recipe.whyItWorks,
    keyIngredients: recipe.keyIngredients,
    tips: recipe.tips,
    faqs: recipe.faqs.map((item) => ({ name: item.question, note: item.answer })),
    prepMinutes: recipe.prepMinutes,
    bakeMinutes: recipe.bakeMinutes ?? recipe.cookMinutes,
    restMinutes: recipe.restMinutes ?? 0,
    cookMinutes: recipe.bakeMinutes ?? recipe.cookMinutes,
    difficulty: recipe.difficulty || "Easy",
    utensils: recipe.utensils || [],
    servings: recipe.servings,
    servingsUnit: recipe.servingsUnit,
    course: recipe.course,
    method: recipe.method,
    holiday: recipe.holiday || "",
    cuisine: recipe.cuisine,
    tags: recipe.tags,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    notes: recipe.notes,
    nutrition: recipe.nutrition,
  };
}
