import { fieldValueHasContent, nutritionHasPublicContent } from "@/lib/field-content";
import type { RecipeAiVideoContext } from "@/lib/ai-recipe/types";
import type { AiConfidence } from "@/lib/ai-recipe/types";
import type { SchemaCategory, SchemaField } from "@/lib/ai-recipe/schema-version";

export type FieldAiIntent = "generate" | "improve" | "alternative";

export type FieldAiStrategy =
  | "gemini_semantic"
  | "gemini_select"
  | "gemini_numeric"
  | "gemini_tags"
  | "gemini_categories"
  | "gemini_nutrition"
  | "gemini_named_notes"
  | "gemini_list"
  | "source_owned"
  | "none";

export type RecipeAiFieldDef = {
  path: string;
  key: string;
  label: string;
  kind: string;
  strategy: FieldAiStrategy;
  section: "basics" | "details" | "content" | "media" | "advanced";
  confidenceOnGenerate: AiConfidence;
  requiresPreviewWhenPopulated: boolean;
  options?: string[];
  /** Grouped fields (nutrition) share one AI action. */
  groupId?: string;
};

const SOURCE_OWNED_KEYS = new Set([
  "image",
  "youtubeUrl",
  "floatingYoutubeUrl",
  "youtube",
]);

/** Whole-structure fields excluded from Fill missing; granular AI is future work. */
const STRUCTURAL_FILL_EXCLUDED = new Set(["ingredients", "instructions"]);

const BASICS_SCALAR_KEYS = new Set(["excerpt"]);
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

function sectionForKey(key: string): RecipeAiFieldDef["section"] {
  if (key === "title" || key === "excerpt" || key === "categoryIds") return "basics";
  if (DETAILS_KEYS.has(key)) return "details";
  if (CONTENT_KEYS.has(key)) return "content";
  if (MEDIA_KEYS.has(key)) return "media";
  if (ADVANCED_KEYS.has(key)) return "advanced";
  return "details";
}

function strategyForKind(input: {
  key: string;
  kind: string;
}): FieldAiStrategy {
  if (SOURCE_OWNED_KEYS.has(input.key)) return "source_owned";
  if (STRUCTURAL_FILL_EXCLUDED.has(input.key)) return "none";

  switch (input.kind) {
    case "nutrition":
      return "gemini_nutrition";
    case "tags":
      return "gemini_tags";
    case "select":
      return "gemini_select";
    case "number":
    case "minutes":
    case "hours":
      return "gemini_numeric";
    case "namedNotes":
      return "gemini_named_notes";
    case "list":
      return "gemini_list";
    case "text":
    case "textarea":
      return "gemini_semantic";
    case "ingredients":
    case "instructions":
    case "gallery":
    case "image":
    case "boolean":
      return "none";
    default:
      return "gemini_semantic";
  }
}

function confidenceForStrategy(strategy: FieldAiStrategy): AiConfidence {
  if (strategy === "gemini_nutrition") return "ESTIMATED";
  return "HIGH_CONFIDENCE_INFERENCE";
}

function inferDef(input: {
  path: string;
  key: string;
  label: string;
  kind: string;
  options?: string[];
}): RecipeAiFieldDef {
  const strategy = strategyForKind({ key: input.key, kind: input.kind });
  return {
    path: input.path,
    key: input.key,
    label: input.label,
    kind: input.kind,
    strategy,
    section: sectionForKey(input.key),
    confidenceOnGenerate: confidenceForStrategy(strategy),
    requiresPreviewWhenPopulated: strategy !== "gemini_nutrition" && strategy !== "gemini_tags",
    options: input.options?.length ? input.options : undefined,
    groupId: input.kind === "nutrition" ? "nutrition" : undefined,
  };
}

/** Build the full registry for a recipe type (server + client). */
export function buildRecipeAiFieldRegistry(typeFields: SchemaField[]): Map<string, RecipeAiFieldDef> {
  const registry = new Map<string, RecipeAiFieldDef>();

  registry.set(
    "title",
    inferDef({
      path: "title",
      key: "title",
      label: "Title",
      kind: "text",
    }),
  );

  registry.set(
    "excerpt",
    inferDef({
      path: "excerpt",
      key: "excerpt",
      label: "Excerpt",
      kind: "textarea",
    }),
  );

  registry.set(
    "categoryIds",
    {
      path: "categoryIds",
      key: "categoryIds",
      label: "Categories",
      kind: "categories",
      strategy: "gemini_categories",
      section: "basics",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    },
  );

  for (const field of typeFields) {
    const path = `values.${field.key}`;
    registry.set(path, inferDef({
      path,
      key: field.key,
      label: field.label,
      kind: field.kind,
      options: field.options,
    }));
  }

  return registry;
}

export function getRecipeFieldAiDef(
  path: string,
  typeFields: SchemaField[],
): RecipeAiFieldDef | null {
  const registry = buildRecipeAiFieldRegistry(typeFields);
  const direct = registry.get(path);
  if (direct) return direct;

  const instructionSection = path.match(/^values\.instructions\.(\d+)\.name$/);
  if (instructionSection) {
    return {
      path,
      key: "instructions",
      label: "Instruction section title",
      kind: "text",
      strategy: "gemini_semantic",
      section: "content",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  const instructionStep = path.match(/^values\.instructions\.(\d+)\.steps\.(\d+)$/);
  if (instructionStep) {
    return {
      path,
      key: "instructions",
      label: "Instruction step",
      kind: "textarea",
      strategy: "gemini_semantic",
      section: "content",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  const instructionChapterLabel = path.match(/^values\.instructions\.(\d+)\.chapterLabel$/);
  if (instructionChapterLabel) {
    return {
      path,
      key: "instructions",
      label: "Video chapter label",
      kind: "text",
      // Registered for a future phase; no AI controls until generation ships.
      strategy: "none",
      section: "content",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  const faqChild = path.match(/^values\.faqs\.(\d+)\.(name|note)$/);
  if (faqChild) {
    return {
      path,
      key: "faqs",
      label: faqChild[2] === "name" ? "FAQ question" : "FAQ answer",
      kind: "namedNotes",
      strategy: "gemini_named_notes",
      section: "content",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  const keyIngredientChild = path.match(/^values\.keyIngredients\.(\d+)\.(name|note)$/);
  if (keyIngredientChild) {
    return {
      path,
      key: "keyIngredients",
      label: keyIngredientChild[2] === "name" ? "Key ingredient" : "Why it matters",
      kind: "namedNotes",
      strategy: "gemini_named_notes",
      section: "content",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  const youtubeHook = path === "values.youtube.hook";
  if (youtubeHook) {
    return {
      path,
      key: "youtube",
      label: "Video hook",
      kind: "textarea",
      strategy: "gemini_semantic",
      section: "media",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  const ingredientGroupName = path.match(/^values\.ingredients\.(\d+)\.name$/);
  if (ingredientGroupName) {
    return {
      path,
      key: "ingredients",
      label: "Ingredient group title",
      kind: "text",
      strategy: "gemini_semantic",
      section: "content",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  const ingredientCell = path.match(/^values\.ingredients\.(\d+)\.items\.(\d+)\.(amount|item|notes)$/);
  if (ingredientCell) {
    const cell = ingredientCell[3] as "amount" | "item" | "notes";
    const label =
      cell === "amount" ? "Ingredient amount" : cell === "item" ? "Ingredient name" : "Ingredient notes";
    return {
      path,
      key: "ingredients",
      label,
      kind: "text",
      strategy: "gemini_semantic",
      section: "content",
      confidenceOnGenerate: "HIGH_CONFIDENCE_INFERENCE",
      requiresPreviewWhenPopulated: true,
    };
  }

  return null;
}

export function isRecipeFieldAiSupported(path: string, typeFields: SchemaField[]): boolean {
  const def = getRecipeFieldAiDef(path, typeFields);
  if (!def) return false;
  return def.strategy !== "none" && def.strategy !== "source_owned";
}

/** @deprecated Use isRecipeFieldAiSupported */
export function isFieldAiPath(path: string): boolean {
  if (path === "title" || path === "excerpt" || path === "categoryIds") return true;
  if (path.startsWith("values.")) {
    const key = path.slice("values.".length);
    if (SOURCE_OWNED_KEYS.has(key) || STRUCTURAL_FILL_EXCLUDED.has(key)) return false;
    return true;
  }
  return false;
}

export function fieldPathToKey(path: string): string {
  if (path === "excerpt" || path === "categoryIds" || path === "title") return path;
  return path.startsWith("values.") ? path.slice("values.".length) : path;
}

/** Generic empty-value detection for field AI eligibility and UI. */
export function recipeFieldIsEmpty(input: {
  path: string;
  kind?: string;
  value: unknown;
  title?: string;
  excerpt?: string;
  categoryIds?: string[];
}): boolean {
  if (input.path === "title") return !String(input.title ?? "").trim();
  if (input.path === "excerpt") return !String(input.excerpt ?? "").trim();
  if (input.path === "categoryIds") return !(input.categoryIds ?? []).length;
  if (input.kind === "categories") return !(input.categoryIds ?? []).length;

  const kind = input.kind || "text";
  if (kind === "nutrition") return !nutritionHasPublicContent(input.value);
  return !fieldValueHasContent(input.value, kind);
}

export function fieldPathHasContent(input: {
  path: string;
  kind?: string;
  value: unknown;
  excerpt?: string;
  categoryIds?: string[];
}): boolean {
  return !recipeFieldIsEmpty({
    path: input.path,
    kind: input.kind,
    value: input.value,
    title: input.path === "title" ? String(input.value ?? "") : undefined,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
  });
}

export function resolveFieldAiActionLabel(input: {
  path?: string;
  kind?: string;
  strategy?: FieldAiStrategy;
  hasContent: boolean;
  intent?: FieldAiIntent;
}): string {
  if (input.path === "categoryIds" || input.strategy === "gemini_categories") {
    return input.hasContent ? "✦ Review categories" : "✦ Suggest categories";
  }
  if (input.strategy === "gemini_nutrition" || input.kind === "nutrition") {
    return input.hasContent ? "✦ Recalculate" : "✦ Estimate nutrition";
  }
  if (input.path === "title") {
    return input.hasContent ? "✦ Improve title" : "✦ Generate title";
  }
  if (input.path === "values.tags" || input.strategy === "gemini_tags") {
    return input.hasContent ? "✦ Improve tags" : "✦ Suggest tags";
  }
  if (!input.hasContent) return "✦ Generate";
  if (input.intent === "alternative") return "✦ Try another";
  return "✦ Improve";
}

export function dedupeSuggestedTags(tags: string[], max = 12): string[] {
  const normalized = tags.map((tag) => String(tag ?? "").trim()).filter(Boolean);
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
    steps: Array.isArray(section.steps)
      ? (section.steps as string[]).slice(0, 6).map((step) => truncateText(step, 120))
      : [],
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

export function buildTargetedFieldContext(input: {
  path: string;
  def?: RecipeAiFieldDef | null;
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
  const { path, current, videoContext, def } = input;
  const key = fieldPathToKey(path);
  const base: Record<string, unknown> = {
    recipeTypeContext: {
      method: current.values.method,
      course: current.values.course,
      cuisine: current.values.cuisine,
      servings: current.values.servings,
      servingsUnit: current.values.servingsUnit,
      difficulty: current.values.difficulty,
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
    case "title":
      return {
        ...base,
        taskNote:
          "Generate a strong WEBSITE recipe title from recipe content. Do NOT copy the YouTube video title verbatim.",
        youtubeTitleHint: videoContext?.dishContext,
        intro: truncateText(current.values.intro, 400),
        whyItWorks: truncateText(current.values.whyItWorks, 200),
        ingredients: ingredientSummary(current.values),
        instructions: instructionSummary(current.values),
        method: current.values.method,
        cuisine: current.values.cuisine,
        course: current.values.course,
      };
    case "excerpt":
      return {
        ...base,
        title: current.title,
        intro: truncateText(current.values.intro, 300),
        whyItWorks: truncateText(current.values.whyItWorks, 200),
      };
    case "categoryIds":
      return {
        ...base,
        title: current.title,
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
    case "values.nutrition":
      return {
        ...base,
        title: current.title,
        servings: current.values.servings,
        servingsUnit: current.values.servingsUnit,
        ingredients: ingredientSummary(current.values),
        note: "Estimate per serving. Return integers. If ingredients are insufficient, return null fields.",
      };
    case "values.whyItWorks":
      return {
        ...base,
        title: current.title,
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
        title: current.title,
        excerpt: truncateText(current.excerpt, 200),
        whyItWorks: truncateText(current.values.whyItWorks, 200),
        dishContext: videoContext?.dishContext,
        ingredients: ingredientSummary(current.values).slice(0, 8),
      };
    case "values.imageAlt":
      return {
        ...base,
        title: current.title,
        imageUrl: current.values.image,
        imageDescriptionHint: truncateText(current.values.imageAlt, 200),
        intro: truncateText(current.values.intro, 200),
        dishContext: videoContext?.dishContext,
      };
    case "values.tags":
      return {
        ...base,
        title: current.title,
        intro: truncateText(current.values.intro, 200),
        cuisine: current.values.cuisine,
        method: current.values.method,
        course: current.values.course,
        existingTags: Array.isArray(current.values.tags) ? current.values.tags : [],
      };
    case "values.holiday":
      return {
        ...base,
        title: current.title,
        intro: truncateText(current.values.intro, 300),
        ingredients: ingredientSummary(current.values).slice(0, 10),
        cuisine: current.values.cuisine,
        method: current.values.method,
        allowedValues: def?.options?.length ? def.options : ["Year-round", "All year", "Spring", "Summer", "Fall", "Winter", "Holiday"],
        taskNote:
          "If the recipe is not genuinely seasonal, return a neutral value like Year-round or All year. Do not invent holidays without evidence.",
      };
    case "values.faqs":
      return {
        ...base,
        title: current.title,
        ingredients: ingredientSummary(current.values),
        method: current.values.method,
        instructions: instructionSummary(current.values),
        faqQuestion:
          Array.isArray(input.currentValue) && input.currentValue.length
            ? (input.currentValue as { name?: string }[])[0]?.name
            : undefined,
      };
    default: {
      const instructionSection = path.match(/^values\.instructions\.(\d+)\.name$/);
      if (instructionSection) {
        const index = Number(instructionSection[1]);
        const sections = Array.isArray(current.values.instructions)
          ? (current.values.instructions as { name?: string; steps?: string[] }[])
          : [];
        return {
          ...base,
          title: current.title,
          sectionIndex: index,
          existingSteps: sections[index]?.steps ?? [],
          neighboringSections: sections.map((section) => section.name).filter(Boolean),
          instructions: instructionSummary(current.values),
        };
      }
      const instructionStep = path.match(/^values\.instructions\.(\d+)\.steps\.(\d+)$/);
      if (instructionStep) {
        const sectionIndex = Number(instructionStep[1]);
        const stepIndex = Number(instructionStep[2]);
        const sections = Array.isArray(current.values.instructions)
          ? (current.values.instructions as { name?: string; steps?: string[] }[])
          : [];
        const section = sections[sectionIndex];
        return {
          ...base,
          title: current.title,
          sectionName: section?.name,
          sectionIndex,
          stepIndex,
          priorStep: section?.steps?.[stepIndex - 1],
          nextStep: section?.steps?.[stepIndex + 1],
          instructions: instructionSummary(current.values),
        };
      }
      const faqNote = path.match(/^values\.faqs\.(\d+)\.note$/);
      if (faqNote) {
        const rows = Array.isArray(current.values.faqs)
          ? (current.values.faqs as { name?: string; note?: string }[])
          : [];
        return {
          ...base,
          title: current.title,
          faqQuestion: rows[Number(faqNote[1])]?.name,
          ingredients: ingredientSummary(current.values),
        };
      }
      const keyIngredientNote = path.match(/^values\.keyIngredients\.(\d+)\.note$/);
      if (keyIngredientNote) {
        const rows = Array.isArray(current.values.keyIngredients)
          ? (current.values.keyIngredients as { name?: string; note?: string }[])
          : [];
        return {
          ...base,
          title: current.title,
          ingredientName: rows[Number(keyIngredientNote[1])]?.name,
          ingredients: ingredientSummary(current.values),
        };
      }
      const ingredientGroupName = path.match(/^values\.ingredients\.(\d+)\.name$/);
      if (ingredientGroupName) {
        const groupIndex = Number(ingredientGroupName[1]);
        const groups = Array.isArray(current.values.ingredients)
          ? (current.values.ingredients as { name?: string; items?: { item?: string; amount?: string; notes?: string }[] }[])
          : [];
        return {
          ...base,
          title: current.title,
          servings: current.values.servings,
          servingsUnit: current.values.servingsUnit,
          groupIndex,
          groupItems: groups[groupIndex]?.items ?? [],
          neighboringGroupNames: groups.map((group) => group.name).filter(Boolean),
          allIngredients: ingredientSummary(current.values),
          instructions: instructionSummary(current.values),
          taskNote: "Generate ONLY the requested group title. Do not rewrite other groups or rows.",
        };
      }
      const ingredientCell = path.match(/^values\.ingredients\.(\d+)\.items\.(\d+)\.(amount|item|notes)$/);
      if (ingredientCell) {
        const groupIndex = Number(ingredientCell[1]);
        const rowIndex = Number(ingredientCell[2]);
        const cell = ingredientCell[3];
        const groups = Array.isArray(current.values.ingredients)
          ? (current.values.ingredients as { name?: string; items?: { item?: string; amount?: string; notes?: string }[] }[])
          : [];
        const group = groups[groupIndex];
        const row = group?.items?.[rowIndex];
        return {
          ...base,
          title: current.title,
          servings: current.values.servings,
          servingsUnit: current.values.servingsUnit,
          groupName: group?.name,
          groupIndex,
          rowIndex,
          cell,
          currentRow: row,
          siblingRows: (group?.items ?? []).filter((_, index) => index !== rowIndex),
          allIngredients: ingredientSummary(current.values),
          instructions: instructionSummary(current.values),
          taskNote:
            "Generate ONLY the requested ingredient cell (amount, name, or notes). Do not modify neighboring rows.",
        };
      }
      if (def?.strategy === "gemini_numeric") {
        return {
          ...base,
          title: current.title,
          intro: truncateText(current.values.intro, 250),
          instructions: instructionSummary(current.values),
          timing: {
            prepMinutes: current.values.prepMinutes,
            bakeMinutes: current.values.bakeMinutes,
            cookMinutes: current.values.cookMinutes,
            restMinutes: current.values.restMinutes,
          },
        };
      }
      if (def?.strategy === "gemini_select" && def.options?.length) {
        return {
          ...base,
          title: current.title,
          intro: truncateText(current.values.intro, 300),
          ingredients: ingredientSummary(current.values).slice(0, 10),
          allowedOptions: def.options,
        };
      }
      return {
        ...base,
        title: current.title,
        intro: truncateText(current.values.intro, 300),
        whyItWorks: truncateText(current.values.whyItWorks, 200),
        ingredients: ingredientSummary(current.values).slice(0, 10),
        instructions: instructionSummary(current.values),
      };
    }
  }
}

export function fieldAiResponseSchemaHint(def: RecipeAiFieldDef | null, path: string): string {
  if (!def) return '{ "value": "..." }';
  switch (def.strategy) {
    case "gemini_categories":
      return '{ "categoryIds": ["<existing-category-id>", ...] } — only IDs from taxonomy.';
    case "gemini_tags":
      return '{ "tags": ["tag1", "tag2"] } — max 12, deduped editorial tags.';
    case "gemini_nutrition":
      return '{ "calories": number, "carbs": number, "protein": number, "fat": number } — per serving integers.';
    case "gemini_numeric":
      return '{ "value": number }';
    case "gemini_select":
      return def.options?.length
        ? `{ "value": "<one of: ${def.options.join(", ")}>" }`
        : '{ "value": "..." }';
    case "gemini_named_notes":
    case "gemini_list":
      return path === "values.faqs" || def.key === "faqs"
        ? '{ "value": [{ "name": "question", "note": "answer" }] }'
        : '{ "value": [{ "name": "...", "note": "..." }] } or string[] for lists';
    default:
      return '{ "value": "..." }';
  }
}

function extractRawValue(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === "object" && raw !== null && "value" in (raw as object)) {
    return (raw as { value: unknown }).value;
  }
  return raw;
}

function normalizeSelectValue(raw: unknown, options: string[] | undefined, kind: string): string | null {
  const text = String(extractRawValue(raw) ?? "").trim();
  if (!text) return null;
  if (!options?.length || kind === "text") return text;

  const exact = options.find((option) => option.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  const neutralPatterns = [
    { pattern: /year.?round|all year|anytime|everyday|not seasonal|general/i, values: ["Year-round", "All year", "Anytime"] },
    { pattern: /spring/i, values: ["Spring"] },
    { pattern: /summer/i, values: ["Summer"] },
    { pattern: /fall|autumn/i, values: ["Fall", "Autumn"] },
    { pattern: /winter/i, values: ["Winter"] },
  ];
  for (const row of neutralPatterns) {
    if (row.pattern.test(text)) {
      const match = options.find((option) =>
        row.values.some((candidate) => candidate.toLowerCase() === option.toLowerCase()),
      );
      if (match) return match;
    }
  }
  return text;
}

function normalizeNutritionValue(raw: unknown): Record<string, number> | null {
  const row =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : extractRawValue(raw) && typeof extractRawValue(raw) === "object"
        ? (extractRawValue(raw) as Record<string, unknown>)
        : null;
  if (!row) return null;

  const keys = ["calories", "carbs", "protein", "fat"] as const;
  const out: Record<string, number> = {};
  let any = false;
  for (const key of keys) {
    const n = Number(row[key]);
    if (Number.isFinite(n) && n > 0) {
      out[key] = Math.round(n);
      any = true;
    } else {
      out[key] = 0;
    }
  }
  return any ? out : null;
}

function evergreenHolidayValue(options: string[] | undefined): string {
  if (options?.length) {
    const match = options.find((option) => /year.?round|all year|anytime|everyday/i.test(option));
    if (match) return match;
  }
  return "Year-round";
}

function resolveCategoryIdsFromAiResponse(input: {
  raw: unknown;
  allowedCategoryIds: Set<string>;
  categories?: SchemaCategory[];
}): string[] | null {
  const tokens = Array.isArray(input.raw)
    ? input.raw
    : Array.isArray((input.raw as { categoryIds?: unknown }).categoryIds)
      ? (input.raw as { categoryIds: unknown[] }).categoryIds
      : typeof input.raw === "object" && input.raw !== null && "value" in (input.raw as object)
        ? extractRawValue(input.raw)
        : input.raw != null
          ? [input.raw]
          : [];

  if (!Array.isArray(tokens)) return null;

  const byName = new Map(
    (input.categories ?? []).map((category) => [category.name.trim().toLowerCase(), category.id]),
  );
  const bySlug = new Map(
    (input.categories ?? []).map((category) => [category.slug.trim().toLowerCase(), category.id]),
  );

  const resolved: string[] = [];
  for (const token of tokens) {
    const text = String(token ?? "").trim();
    if (!text) continue;
    if (input.allowedCategoryIds.has(text)) {
      resolved.push(text);
      continue;
    }
    const byLabel = byName.get(text.toLowerCase());
    if (byLabel && input.allowedCategoryIds.has(byLabel)) {
      resolved.push(byLabel);
      continue;
    }
    const slugKey = text.toLowerCase().replace(/\s+/g, "-");
    const bySlugId = bySlug.get(slugKey);
    if (bySlugId && input.allowedCategoryIds.has(bySlugId)) {
      resolved.push(bySlugId);
    }
  }

  const unique = [...new Set(resolved)];
  return unique.length ? unique : null;
}

export function normalizeFieldAiResponse(input: {
  path: string;
  raw: unknown;
  def?: RecipeAiFieldDef | null;
  allowedCategoryIds?: Set<string>;
  categories?: SchemaCategory[];
}): unknown | null {
  const { path, raw, def } = input;
  if (raw == null) {
    if (path === "values.holiday" || def?.key === "holiday") {
      return evergreenHolidayValue(def?.options);
    }
    return null;
  }

  if (path === "categoryIds" || def?.strategy === "gemini_categories") {
    return resolveCategoryIdsFromAiResponse({
      raw,
      allowedCategoryIds: input.allowedCategoryIds ?? new Set(),
      categories: input.categories,
    });
  }

  if (path === "values.tags" || def?.strategy === "gemini_tags") {
    const tags = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { tags?: unknown }).tags)
        ? (raw as { tags: unknown[] }).tags
        : [];
    const deduped = dedupeSuggestedTags(tags.map((tag) => String(tag ?? "")));
    return deduped.length ? deduped : null;
  }

  if (path === "values.nutrition" || def?.strategy === "gemini_nutrition") {
    return normalizeNutritionValue(raw);
  }

  if (def?.strategy === "gemini_numeric") {
    const value = extractRawValue(raw);
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  if (def?.strategy === "gemini_select" || path === "values.holiday" || def?.key === "holiday") {
    const holidayKind =
      path === "values.holiday" || def?.key === "holiday" ? "select" : def?.kind ?? "text";
    const selected = normalizeSelectValue(raw, def?.options, holidayKind);
    if (selected) return selected;
    if (path === "values.holiday" || def?.key === "holiday") {
      return evergreenHolidayValue(def?.options);
    }
    return null;
  }

  const extracted = extractRawValue(raw);
  if (typeof extracted === "string" && extracted.trim()) return extracted.trim();
  if (Array.isArray(extracted) && extracted.length) return extracted;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function confidenceForFieldDef(def: RecipeAiFieldDef | null): AiConfidence {
  if (def?.strategy === "gemini_nutrition") return "ESTIMATED";
  return def?.confidenceOnGenerate ?? "HIGH_CONFIDENCE_INFERENCE";
}

export function sourceNoteForFieldDef(def: RecipeAiFieldDef | null): string {
  if (def?.strategy === "gemini_nutrition") return "Estimate — verify";
  return "Targeted AI fill";
}
