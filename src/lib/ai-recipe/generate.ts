import { CORE_VALUE_KEYS } from "@/lib/fields";
import { generateRecipeDraftWithGemini } from "@/lib/ai-recipe/gemini";
import { normalizeAiRecipeResponse, type NormalizedAiDraft } from "@/lib/ai-recipe/normalize";
import {
  computeRecipeSchemaVersion,
  type SchemaCategory,
  type SchemaField,
  type SchemaRecipeType,
} from "@/lib/ai-recipe/schema-version";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { AiGeminiErrorCode } from "@/lib/ai-recipe/errors";
import { normalizeYouTubeForGemini } from "@/lib/ai-recipe/youtube-url";
import { youtubeVideoId } from "@/lib/youtube";
import { enrichDraftYoutubeFromDescription } from "@/lib/youtube-description";
import { aiChaptersFromGeminiRaw } from "@/lib/ai-recipe/youtube-chapters";
import { buildRecipeAiVideoContext } from "@/lib/ai-recipe/video-context";
import { getDb } from "@/lib/db";

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

export type AiGenerateSuccess = {
  ok: true;
  cached: boolean;
  draft: NormalizedAiDraft;
  meta: RecipeAiMeta;
  schemaVersion: string;
  model: string;
};

export type AiGenerateFailure = {
  ok: false;
  code: AiGeminiErrorCode | "invalid_url" | "invalid_type" | "insufficient" | "rate_limit";
  message: string;
  detail?: string;
  videoAnalysisSucceeded?: boolean;
};

export async function runAiRecipeGeneration(input: {
  youtubeUrl: string;
  typeId: string;
  forceRefresh?: boolean;
}): Promise<AiGenerateSuccess | AiGenerateFailure> {
  const normalized = normalizeYouTubeForGemini(input.youtubeUrl);
  if (!normalized) {
    return { ok: false, code: "INVALID_YOUTUBE_URL", message: "Enter a valid YouTube watch, youtu.be, or Shorts URL." };
  }
  const { videoId, canonicalUrl: youtubeUrl } = normalized;

  const db = getDb();
  const [types, categories, recipeType] = await Promise.all([
    db.recipeType.findMany({
      include: { fields: true },
      orderBy: { name: "asc" },
    }),
    db.category.findMany({ orderBy: { name: "asc" } }),
    db.recipeType.findUnique({
      where: { id: input.typeId },
      include: { fields: true },
    }),
  ]);

  if (!recipeType) {
    return { ok: false, code: "invalid_type", message: "Unknown recipe type." };
  }

  const allTypes = types.map(mapType);
  const selectedType = mapType(recipeType);
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

  if (!input.forceRefresh) {
    const cached = await db.aiRecipeGenerationCache.findUnique({
      where: {
        videoId_typeId_schemaVersion: {
          videoId,
          typeId: selectedType.id,
          schemaVersion,
        },
      },
    });
    if (cached) {
      try {
        const raw = JSON.parse(cached.responseJson) as unknown;
        const draft = normalizeAiRecipeResponse({
          raw,
          typeId: selectedType.id,
          youtubeUrl,
          fields: selectedType.fields,
          allowedCategoryIds: new Set(schemaCategories.map((category) => category.id)),
          allowedTypeIds: new Set(allTypes.map((type) => type.id)),
        });
        if (draft.insufficientRecipeInformation) {
          return {
            ok: false,
            code: "insufficient",
            message:
              draft.insufficientReason ||
              "This video does not contain enough recipe information to draft reliably.",
          };
        }
        await enrichDraftYoutubeFromDescription({
          values: draft.values,
          videoId,
          confidenceByPath: draft.confidenceByPath,
          summary: draft.summary,
          aiChapters: aiChaptersFromGeminiRaw(raw),
        });
        const meta = buildMeta({
          youtubeUrl,
          model: cached.model,
          schemaVersion,
          draft,
        });
        return {
          ok: true,
          cached: true,
          draft,
          meta,
          schemaVersion,
          model: cached.model,
        };
      } catch {
        // fall through to regenerate
      }
    }
  }

  const generated = await generateRecipeDraftWithGemini({
    youtubeUrl: normalized.originalUrl,
    recipeType: selectedType,
    allTypes,
    categories: schemaCategories,
  });

  if (!generated.ok) {
    return {
      ok: false,
      code: generated.error.code,
      message: generated.error.message,
      detail: generated.error.detail,
      videoAnalysisSucceeded: generated.videoAnalysisSucceeded,
    };
  }

  const draft = normalizeAiRecipeResponse({
    raw: generated.raw,
    typeId: selectedType.id,
    youtubeUrl,
    fields: selectedType.fields,
    allowedCategoryIds: new Set(schemaCategories.map((category) => category.id)),
    allowedTypeIds: new Set(allTypes.map((type) => type.id)),
  });

  if (draft.insufficientRecipeInformation) {
    return {
      ok: false,
      code: "insufficient",
      message:
        draft.insufficientReason ||
        "This video does not contain enough recipe information to draft reliably.",
    };
  }

  await enrichDraftYoutubeFromDescription({
    values: draft.values,
    videoId,
    confidenceByPath: draft.confidenceByPath,
    summary: draft.summary,
    aiChapters: aiChaptersFromGeminiRaw(generated.raw),
  });

  await db.aiRecipeGenerationCache.upsert({
    where: {
      videoId_typeId_schemaVersion: {
        videoId,
        typeId: selectedType.id,
        schemaVersion,
      },
    },
    create: {
      videoId,
      typeId: selectedType.id,
      schemaVersion,
      model: generated.model,
      responseJson: JSON.stringify(generated.raw),
    },
    update: {
      model: generated.model,
      responseJson: JSON.stringify(generated.raw),
    },
  });

  const meta = buildMeta({
    youtubeUrl,
    model: generated.model,
    schemaVersion,
    draft,
  });

  return {
    ok: true,
    cached: false,
    draft,
    meta,
    schemaVersion,
    model: generated.model,
  };
}

function buildMeta(input: {
  youtubeUrl: string;
  model: string;
  schemaVersion: string;
  draft: NormalizedAiDraft;
}): RecipeAiMeta {
  const sourceVideoId = youtubeVideoId(input.youtubeUrl) || undefined;
  const generatedAt = new Date().toISOString();
  return {
    generatedByAI: true,
    sourceType: "youtube",
    sourceUrl: input.youtubeUrl,
    sourceVideoId,
    generatedAt,
    model: input.model,
    schemaVersion: input.schemaVersion,
    verificationStatus: "unverified",
    confidenceByPath: input.draft.confidenceByPath,
    summary: input.draft.summary,
    videoContext: buildRecipeAiVideoContext({
      youtubeUrl: input.youtubeUrl,
      model: input.model,
      schemaVersion: input.schemaVersion,
      draft: input.draft,
      generatedAt,
    }),
  };
}
