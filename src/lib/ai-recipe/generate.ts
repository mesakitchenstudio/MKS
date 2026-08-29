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
import { getDb } from "@/lib/db";
import { youtubeVideoId, youtubeWatchUrl } from "@/lib/youtube";

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
  code: string;
  message: string;
};

export async function runAiRecipeGeneration(input: {
  youtubeUrl: string;
  typeId: string;
  forceRefresh?: boolean;
}): Promise<AiGenerateSuccess | AiGenerateFailure> {
  const videoId = youtubeVideoId(input.youtubeUrl);
  if (!videoId) {
    return { ok: false, code: "invalid_url", message: "Enter a valid YouTube watch or youtu.be URL." };
  }
  const youtubeUrl = youtubeWatchUrl(videoId) || input.youtubeUrl.trim();

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
    youtubeUrl,
    recipeType: selectedType,
    allTypes,
    categories: schemaCategories,
  });

  if (!generated.ok) {
    return { ok: false, code: generated.code, message: generated.message };
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
  return {
    generatedByAI: true,
    sourceType: "youtube",
    sourceUrl: input.youtubeUrl,
    generatedAt: new Date().toISOString(),
    model: input.model,
    schemaVersion: input.schemaVersion,
    verificationStatus: "unverified",
    confidenceByPath: input.draft.confidenceByPath,
    summary: input.draft.summary,
  };
}
