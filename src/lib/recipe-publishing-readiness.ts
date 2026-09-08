import {
  listMissingRequiredFields,
  sectionForFieldKey,
  type EditorFieldShape,
  type EditorSectionId,
} from "@/lib/recipe-editor-completeness";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import {
  isLikelyExternalStockImageUrl,
  isRecognizedPublicRecipeImageUrl,
} from "@/lib/recipe-catalog-integrity";
import { normalizeRecipeImageSrc } from "@/lib/recipe-images";
import { youtubeVideoId } from "@/lib/youtube";
import {
  validateYoutubeMetadataEditorState,
  youtubeMetadataToEditorState,
} from "@/lib/youtube-metadata-editor";

export type RecipePublishingStatus =
  | "ready"
  | "ready_with_recommendations"
  | "not_ready";

export type RecipePublishingCheck = {
  /** Stable machine-readable id, e.g. recipe.title */
  id: string;
  label: string;
  passed: boolean;
  severity: "required" | "recommended";
  section: EditorSectionId | "publishing";
  message: string;
  /** Editor field key for scroll/focus when applicable. */
  fieldKey?: string;
};

export type RecipePublishingReadiness = {
  status: RecipePublishingStatus;
  required: RecipePublishingCheck[];
  recommended: RecipePublishingCheck[];
  counts: {
    requiredPassed: number;
    requiredTotal: number;
    recommendedPassed: number;
    recommendedTotal: number;
  };
};

export type RecipePublishingReadinessInput = {
  title: string;
  slug?: string;
  excerpt?: string;
  typeId?: string;
  fields: EditorFieldShape[];
  values: Record<string, unknown>;
  categoryIds?: string[];
  aiMeta?: RecipeAiMeta | null;
  resolveSection?: (key: string) => EditorSectionId;
  typeFields?: SchemaField[];
};

const FIELD_CHECK_IDS: Record<string, string> = {
  title: "recipe.title",
  excerpt: "recipe.description",
  slug: "recipe.slug",
  typeId: "recipe.type",
  dishName: "recipe.dish_name",
  image: "recipe.hero_image",
  imageAlt: "recipe.hero_alt",
  youtubeUrl: "recipe.youtube",
  youtube: "recipe.youtube_metadata",
  floatingYoutubeUrl: "recipe.floating_youtube",
  ingredients: "recipe.ingredients",
  instructions: "recipe.instructions",
  prepMinutes: "recipe.prep_time",
  cookMinutes: "recipe.cook_time",
  bakeMinutes: "recipe.bake_time",
  restMinutes: "recipe.rest_time",
  servings: "recipe.yield",
  servingsUnit: "recipe.yield_unit",
  intro: "recipe.intro",
  whyItWorks: "recipe.why_it_works",
  keyIngredients: "recipe.key_ingredients",
  tips: "recipe.tips",
  faqs: "recipe.faqs",
  notes: "recipe.notes",
  nutrition: "recipe.nutrition",
  difficulty: "recipe.difficulty",
  utensils: "recipe.utensils",
  tags: "recipe.tags",
  course: "recipe.course",
  method: "recipe.method",
  holiday: "recipe.holiday",
  cuisine: "recipe.cuisine",
  categoryIds: "recipe.category",
};

export function publishingCheckIdForField(key: string): string {
  if (FIELD_CHECK_IDS[key]) return FIELD_CHECK_IDS[key];
  const snake = key
    .replace(/([A-Z])/g, "_$1")
    .replace(/__/g, "_")
    .toLowerCase();
  return `recipe.${snake}`;
}

function sectionLabel(section: EditorSectionId | "publishing") {
  if (section === "publishing") return "Publishing";
  return section.charAt(0).toUpperCase() + section.slice(1);
}

function requiredMessage(key: string, label: string) {
  if (key === "title") return "Title is required before publishing.";
  if (key === "ingredients") return "Add at least one ingredient before publishing.";
  if (key === "instructions") return "Add at least one instruction step before publishing.";
  return `${label} is required before publishing.`;
}

/**
 * Canonical publishing readiness for Mesa recipes.
 * Single source for editor UI, publish gate, and future Content Health.
 *
 * REQUIRED = blocks publish (existing completeness + malformed YouTube when present).
 * RECOMMENDED = quality/SEO/catalog improvements (non-blocking).
 */
export function getRecipePublishingReadiness(
  input: RecipePublishingReadinessInput,
): RecipePublishingReadiness {
  const sectionFor = input.resolveSection ?? sectionForFieldKey;
  const required: RecipePublishingCheck[] = [];
  const recommended: RecipePublishingCheck[] = [];

  const missing = listMissingRequiredFields({
    fields: input.fields,
    title: input.title,
    values: input.values,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
    aiMeta: input.aiMeta,
    resolveSection: sectionFor,
    typeFields: input.typeFields,
  });
  const missingByKey = new Map(missing.map((row) => [row.key, row]));

  // Title is always required (not a RecipeTypeField).
  const titleOk = String(input.title || "").trim().length > 0;
  required.push({
    id: "recipe.title",
    label: "Recipe title",
    passed: titleOk,
    severity: "required",
    section: "basics",
    message: titleOk
      ? "Recipe title is set."
      : requiredMessage("title", "Title"),
    fieldKey: "title",
  });

  if (input.typeId !== undefined) {
    const typeOk = String(input.typeId || "").trim().length > 0;
    required.push({
      id: "recipe.type",
      label: "Recipe type",
      passed: typeOk,
      severity: "required",
      section: "basics",
      message: typeOk ? "Recipe type is set." : "Recipe type is required before publishing.",
      fieldKey: "typeId",
    });
  }

  if (input.slug !== undefined) {
    const slugOk = String(input.slug || "").trim().length > 0;
    required.push({
      id: "recipe.slug",
      label: "Slug",
      passed: slugOk,
      severity: "required",
      section: "basics",
      message: slugOk ? "Slug is set." : "Slug is required before publishing.",
      fieldKey: "slug",
    });
  }

  // Dynamic required fields from RecipeTypeField.required — do not hard-code types.
  for (const field of input.fields) {
    if (!field.required) continue;
    if (field.key === "title") continue;
    const miss = missingByKey.get(field.key);
    const passed = !miss;
    const section = miss?.section ?? sectionFor(field.key);
    required.push({
      id: publishingCheckIdForField(field.key),
      label: field.label,
      passed,
      severity: "required",
      section,
      message: passed
        ? `${field.label} is complete.`
        : requiredMessage(field.key, field.label),
      fieldKey: field.key,
    });
  }

  // Malformed YouTube (when present) remains a publish blocker — existing rule.
  const youtubeUrl = String(input.values.youtubeUrl ?? "").trim();
  if (youtubeUrl && !youtubeVideoId(youtubeUrl)) {
    required.push({
      id: "recipe.youtube_url",
      label: "YouTube URL",
      passed: false,
      severity: "required",
      section: "media",
      message: "Enter a valid YouTube watch or youtu.be URL.",
      fieldKey: "youtubeUrl",
    });
  }

  // Production stores public RecipeYoutube blobs ({ time, label }), not editor rows
  // ({ timeInput, label }). Normalize before validate so legacy shapes are findings, not crashes.
  const youtubeRaw = input.values.youtube;
  if (youtubeRaw != null && typeof youtubeRaw === "object" && !Array.isArray(youtubeRaw)) {
    const youtubeState = youtubeMetadataToEditorState(youtubeRaw);
    const youtubeIssues = validateYoutubeMetadataEditorState(youtubeState);
    if (youtubeIssues.length) {
      required.push({
        id: "recipe.youtube_metadata",
        label: "YouTube metadata",
        passed: false,
        severity: "required",
        section: "advanced",
        message: youtubeIssues[0]?.message ?? "Fix YouTube metadata before publishing.",
        fieldKey: "youtube",
      });
    }
  }

  // ——— Recommended (non-blocking quality) ———
  const requiredFailedKeys = new Set(
    required.filter((check) => !check.passed).map((check) => check.fieldKey).filter(Boolean),
  );

  const normalizedImage = normalizeRecipeImageSrc(String(input.values.image ?? ""));
  const rawImage = String(input.values.image ?? "").trim();
  const imageRequiredFailed = requiredFailedKeys.has("image");

  if (!imageRequiredFailed) {
    if (!normalizedImage) {
      recommended.push({
        id: "recipe.hero_image",
        label: "Hero image",
        passed: false,
        severity: "recommended",
        section: "media",
        message:
          "No hero image — public recipe cards will show the Mesa placeholder until one is added.",
        fieldKey: "image",
      });
    } else if (!isRecognizedPublicRecipeImageUrl(rawImage)) {
      recommended.push({
        id: "recipe.hero_image_host",
        label: "Hero image host",
        passed: false,
        severity: "recommended",
        section: "media",
        message:
          "Hero image URL may not load on the public site. Upload an image or use an allowed host.",
        fieldKey: "image",
      });
    } else if (isLikelyExternalStockImageUrl(rawImage)) {
      recommended.push({
        id: "recipe.hero_image_stock",
        label: "Hero image source",
        passed: false,
        severity: "recommended",
        section: "media",
        message:
          "Hero image is external stock photography. Confirm it shows this exact recipe before publishing.",
        fieldKey: "image",
      });
    } else {
      recommended.push({
        id: "recipe.hero_image",
        label: "Hero image",
        passed: true,
        severity: "recommended",
        section: "media",
        message: "Hero image is set.",
        fieldKey: "image",
      });
    }
  }

  const prep = input.values.prepMinutes;
  if (!requiredFailedKeys.has("prepMinutes")) {
    const prepOk = typeof prep === "number" && !Number.isNaN(prep);
    recommended.push({
      id: "recipe.prep_time",
      label: "Preparation time",
      passed: prepOk,
      severity: "recommended",
      section: "details",
      message: prepOk
        ? "Preparation time is set."
        : "Preparation time is missing — cards will show 0 min in the timing line.",
      fieldKey: "prepMinutes",
    });
  }

  const servings = input.values.servings;
  if (!requiredFailedKeys.has("servings")) {
    const yieldOk =
      typeof servings === "number" && !Number.isNaN(servings) && servings > 0;
    recommended.push({
      id: "recipe.yield",
      label: "Yield",
      passed: yieldOk,
      severity: "recommended",
      section: "details",
      message: yieldOk
        ? "Yield is set."
        : "Yield is missing — cards will show an incomplete servings line.",
      fieldKey: "servings",
    });
  }

  const excerpt = String(input.excerpt ?? "").trim();
  recommended.push({
    id: "recipe.description",
    label: "SEO description",
    passed: excerpt.length > 0,
    severity: "recommended",
    section: "basics",
    message: excerpt
      ? "SEO description (excerpt) is set."
      : "Add a short description — it improves cards, search snippets, and schema.",
    fieldKey: "excerpt",
  });

  // YouTube is recommended, not required, unless malformed (handled above).
  if (!(youtubeUrl && !youtubeVideoId(youtubeUrl))) {
    const hasVideo = Boolean(youtubeUrl && youtubeVideoId(youtubeUrl));
    recommended.push({
      id: "recipe.youtube",
      label: "YouTube video",
      passed: hasVideo,
      severity: "recommended",
      section: "media",
      message: hasVideo
        ? "YouTube video is linked."
        : "Link a YouTube video when this recipe has one — recommended for Mesa’s video-led recipes.",
      fieldKey: "youtubeUrl",
    });
  }

  const requiredPassed = required.filter((check) => check.passed).length;
  const recommendedPassed = recommended.filter((check) => check.passed).length;
  const requiredFailed = required.length - requiredPassed;
  const recommendedFailed = recommended.length - recommendedPassed;

  let status: RecipePublishingStatus = "ready";
  if (requiredFailed > 0) status = "not_ready";
  else if (recommendedFailed > 0) status = "ready_with_recommendations";

  return {
    status,
    required,
    recommended,
    counts: {
      requiredPassed,
      requiredTotal: required.length,
      recommendedPassed,
      recommendedTotal: recommended.length,
    },
  };
}

/** Derive legacy publish error map from the canonical readiness engine. */
export function publishErrorsFromReadiness(
  readiness: RecipePublishingReadiness,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const check of readiness.required) {
    if (check.passed) continue;
    const key = check.fieldKey || check.id.replace(/^recipe\./, "");
    if (!errors[key]) errors[key] = check.message;
  }
  return errors;
}

/** Shared publish validator — same required rules as getRecipePublishingReadiness. */
export function validateRecipeForPublish(
  input: RecipePublishingReadinessInput,
): Record<string, string> {
  return publishErrorsFromReadiness(getRecipePublishingReadiness(input));
}

export function humanizePublishingStatus(status: RecipePublishingStatus): string {
  if (status === "ready") return "Ready to publish";
  if (status === "ready_with_recommendations") return "Ready with recommendations";
  return "Not ready to publish";
}

export function publishingSectionHeading(section: EditorSectionId | "publishing") {
  return sectionLabel(section);
}
