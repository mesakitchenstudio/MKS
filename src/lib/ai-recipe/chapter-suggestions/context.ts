import { getDb } from "@/lib/db";
import { CORE_VALUE_KEYS } from "@/lib/fields";
import {
  computeRecipeSchemaVersion,
  type SchemaCategory,
  type SchemaField,
  type SchemaRecipeType,
} from "@/lib/ai-recipe/schema-version";
import { normalizeInstructionGroups } from "@/lib/instruction-chapters";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import { youtubeVideoId } from "@/lib/youtube";
import {
  collectChapterSuggestionEvidence,
  type ChapterSuggestionEvidenceBundle,
} from "@/lib/ai-recipe/chapter-suggestions/evidence";

function mapType(row: {
  id: string;
  name: string;
  slug: string;
  fields: {
    key: string;
    label: string;
    helpText: string;
    kind: string;
    required: boolean;
    options: string;
    sortOrder: number;
  }[];
}): SchemaRecipeType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    fields: row.fields
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(
        (field): SchemaField => ({
          key: field.key,
          label: field.label,
          kind: field.kind,
          required: field.required,
          helpText: field.helpText,
          options: JSON.parse(field.options || "[]") as string[],
        }),
      ),
  };
}

export type ChapterSuggestionContext =
  | {
      ok: true;
      videoId: string;
      typeId: string;
      schemaVersion: string;
      youtubeUrl: string;
      groups: ReturnType<typeof normalizeInstructionGroups>;
      evidence: ChapterSuggestionEvidenceBundle;
      cacheRaw: unknown | null;
      youtubeDescription: string | null;
    }
  | {
      ok: false;
      code: "bad_request" | "no_video" | "invalid_type" | "no_suggestions";
      message: string;
    };

export async function loadChapterSuggestionContext(input: {
  typeId: string;
  youtubeUrl?: string;
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
}): Promise<ChapterSuggestionContext> {
  const typeId = String(input.typeId || "").trim();
  if (!typeId) {
    return { ok: false, code: "bad_request", message: "typeId is required." };
  }

  const videoId =
    youtubeVideoId(String(input.youtubeUrl ?? "")) ??
    youtubeVideoId(String(input.values.youtubeUrl ?? "")) ??
    input.aiMeta?.sourceVideoId ??
    null;
  const youtubeUrl = String(input.youtubeUrl ?? input.values.youtubeUrl ?? "").trim();
  if (!videoId) {
    return {
      ok: false,
      code: "no_video",
      message: "Link a YouTube video before suggesting chapters.",
    };
  }

  const db = getDb();
  const [types, categories, recipeType] = await Promise.all([
    db.recipeType.findMany({ include: { fields: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.recipeType.findUnique({ where: { id: typeId }, include: { fields: true } }),
  ]);
  if (!recipeType) {
    return { ok: false, code: "invalid_type", message: "Recipe type not found." };
  }

  const allTypes = types.map(mapType);
  const schemaCategories: SchemaCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    group: category.group,
  }));
  const schemaVersion = computeRecipeSchemaVersion({
    types: allTypes,
    categories: schemaCategories,
    coreFieldKeys: CORE_VALUE_KEYS,
  });

  let cacheRaw: unknown | null = null;
  const cached = await db.aiRecipeGenerationCache.findUnique({
    where: {
      videoId_typeId_schemaVersion: {
        videoId,
        typeId,
        schemaVersion,
      },
    },
  });
  if (cached?.responseJson) {
    try {
      cacheRaw = JSON.parse(cached.responseJson) as unknown;
    } catch {
      cacheRaw = null;
    }
  }

  let youtubeDescription: string | null = null;
  const syncedVideo = await db.youTubeVideo.findUnique({
    where: { videoId },
    select: { description: true },
  });
  if (syncedVideo?.description) {
    youtubeDescription = syncedVideo.description;
  }

  const evidence = collectChapterSuggestionEvidence({
    values: input.values,
    aiMeta: input.aiMeta ?? null,
    videoId,
    cacheRaw,
    youtubeDescription,
  });

  const groups = normalizeInstructionGroups(input.values.instructions);
  if (!groups.length) {
    return {
      ok: false,
      code: "no_suggestions",
      message: "Add instruction sections before suggesting chapters.",
    };
  }

  return {
    ok: true,
    videoId,
    typeId,
    schemaVersion,
    youtubeUrl: youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`,
    groups,
    evidence,
    cacheRaw,
    youtubeDescription,
  };
}
