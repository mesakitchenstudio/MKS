import { slugify } from "@/lib/fields";
import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import { youtubeWatchUrl } from "@/lib/youtube";
import {
  classifyRecipeTypeForYoutubeVideo,
  buildYoutubeDraftAiMeta,
  type RecipeTypeConfidence,
} from "@/lib/ai-recipe/classify-recipe-type";
import { runAiRecipeGeneration } from "@/lib/ai-recipe/generate";
import { mergeAiDraftIntoEditor } from "@/lib/ai-recipe/normalize";
import { emptyAiSummary, tallyConfidence, type RecipeAiMeta } from "@/lib/ai-recipe/types";
import {
  applyYoutubeVideoLinkToValues,
  fillEmptyHeroImageFromYoutubeThumbnail,
} from "@/lib/youtube-data/recipe-link";
import {
  findRecipeIdLinkedToVideo,
  loadSyncedVideoForLink,
} from "@/lib/youtube-data/video-selector";
import { buildRecipeVideoIndex, recipeMainVideoId } from "@/lib/youtube-data/matching";

export type CreateFromYoutubeTypeSource = "ai" | "manual";

export type CreateFromYoutubeResult =
  | {
      ok: true;
      recipeId: string;
      recipeTitle: string;
      recipeSlug: string;
      typeId: string;
      typeName: string;
      alreadyExisted: boolean;
      analysisOk: boolean;
      analysisMessage?: string;
    }
  | {
      ok: false;
      code:
        | "video_not_found"
        | "invalid_type"
        | "missing_type"
        | "no_types"
        | "unauthorized"
        | "create_failed";
      message: string;
    };

export type ClassifyForCreateResult =
  | {
      ok: true;
      confidence: "HIGH";
      recipeTypeId: string;
      recipeTypeName: string;
      reasoning: string;
      existingRecipe?: { id: string; title: string; slug: string };
    }
  | {
      ok: true;
      confidence: "MEDIUM" | "LOW";
      recipeTypeId?: string;
      recipeTypeName?: string;
      reasoning?: string;
      message?: string;
      needsTypeConfirmation: true;
      existingRecipe?: { id: string; title: string; slug: string };
    }
  | {
      ok: false;
      code: "video_not_found" | "no_types" | "already_linked";
      message: string;
      existingRecipe?: { id: string; title: string; slug: string };
    };

/** Per-process lock so rapid double-clicks on one instance do not create duplicates. */
const createLocks = new Map<string, Promise<CreateFromYoutubeResult>>();

export async function findAllRecipesLinkedToVideo(videoId: string): Promise<
  { id: string; title: string; slug: string; createdAt: Date }[]
> {
  const { recipes } = await buildRecipeVideoIndex({ includeDrafts: true });
  const matches = recipes.filter((recipe) => recipeMainVideoId(recipe) === videoId);
  if (!matches.length) return [];

  const db = getDb();
  const rows = await db.recipe.findMany({
    where: { id: { in: matches.map((row) => row.id) } },
    select: { id: true, title: true, slug: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

/**
 * Classify type for create-from-YouTube. Returns existing recipe if already linked.
 * HIGH → client may proceed without confirmation.
 * MEDIUM/LOW → client must confirm or pick a type.
 */
export async function classifyRecipeTypeForCreate(
  videoId: string,
): Promise<ClassifyForCreateResult> {
  const existing = await findRecipeIdLinkedToVideo(videoId);
  if (existing) {
    const db = getDb();
    const recipe = await db.recipe.findUnique({
      where: { id: existing.id },
      select: { id: true, title: true, slug: true },
    });
    return {
      ok: false,
      code: "already_linked",
      message: `This YouTube video is already linked to “${existing.title}”.`,
      existingRecipe: recipe ?? { id: existing.id, title: existing.title, slug: "" },
    };
  }

  const video = await loadSyncedVideoForLink(videoId);
  if (!video) {
    return { ok: false, code: "video_not_found", message: "YouTube video was not found in Mesa sync data." };
  }

  const result = await classifyRecipeTypeForYoutubeVideo(videoId);
  if (!result.ok) {
    return {
      ok: true,
      confidence: "LOW",
      needsTypeConfirmation: true,
      message: result.message,
    };
  }

  if (result.classification.confidence === "HIGH") {
    return {
      ok: true,
      confidence: "HIGH",
      recipeTypeId: result.classification.recipeTypeId,
      recipeTypeName: result.classification.recipeTypeName,
      reasoning: result.classification.reasoning,
    };
  }

  return {
    ok: true,
    confidence: result.classification.confidence === "MEDIUM" ? "MEDIUM" : "LOW",
    recipeTypeId: result.classification.recipeTypeId,
    recipeTypeName: result.classification.recipeTypeName,
    reasoning: result.classification.reasoning,
    needsTypeConfirmation: true,
    message:
      result.classification.confidence === "MEDIUM"
        ? "AI suggested a recipe type with medium confidence. Confirm or change it."
        : result.classification.reasoning || "AI could not confidently determine the recipe type.",
  };
}

/**
 * Create a draft recipe linked to a synced YouTube video, then run AI population.
 * Never publishes. If analysis fails after draft creation, the draft and link are kept.
 */
export async function createAndPopulateRecipeFromYoutubeVideo(input: {
  videoId: string;
  typeId: string;
  typeSource: CreateFromYoutubeTypeSource;
  typeConfidence?: RecipeTypeConfidence;
}): Promise<CreateFromYoutubeResult> {
  const videoId = String(input.videoId || "").trim();
  const typeId = String(input.typeId || "").trim();
  if (!videoId) {
    return { ok: false, code: "video_not_found", message: "videoId is required." };
  }
  if (!typeId) {
    return { ok: false, code: "missing_type", message: "Select a recipe type before creating a draft." };
  }

  const inflight = createLocks.get(videoId);
  if (inflight) return inflight;

  const promise = createAndPopulateInner(input).finally(() => {
    createLocks.delete(videoId);
  });
  createLocks.set(videoId, promise);
  return promise;
}

async function createAndPopulateInner(input: {
  videoId: string;
  typeId: string;
  typeSource: CreateFromYoutubeTypeSource;
  typeConfidence?: RecipeTypeConfidence;
}): Promise<CreateFromYoutubeResult> {
  const videoId = String(input.videoId || "").trim();
  const typeId = String(input.typeId || "").trim();
  const db = getDb();

  const existing = await findRecipeIdLinkedToVideo(videoId);
  if (existing) {
    const recipe = await db.recipe.findUnique({
      where: { id: existing.id },
      select: { id: true, title: true, slug: true, typeId: true, type: { select: { name: true } } },
    });
    if (recipe) {
      return {
        ok: true,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        recipeSlug: recipe.slug,
        typeId: recipe.typeId,
        typeName: recipe.type.name,
        alreadyExisted: true,
        analysisOk: true,
      };
    }
  }

  const [video, recipeType] = await Promise.all([
    loadSyncedVideoForLink(videoId),
    db.recipeType.findUnique({
      where: { id: typeId },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    }),
  ]);

  if (!video) {
    return { ok: false, code: "video_not_found", message: "YouTube video was not found in Mesa sync data." };
  }
  if (!recipeType) {
    return { ok: false, code: "invalid_type", message: "Unknown recipe type." };
  }

  const baseTitle = video.title.trim() || "Untitled recipe";
  let slug = slugify(baseTitle);
  const slugTaken = await db.recipe.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${videoId.slice(0, 6).toLowerCase()}`;

  const values = applyYoutubeVideoLinkToValues({}, video);
  const heroApplied = Boolean(String(values.image ?? "").trim());
  const seedMeta = buildYoutubeDraftAiMeta({
    videoId,
    recipeTypeSource: input.typeSource,
    recipeTypeConfidence: input.typeSource === "ai" ? input.typeConfidence : undefined,
    recipeTypeConfirmed: input.typeSource === "manual",
    heroImageSource: heroApplied ? "youtube_thumbnail" : undefined,
    heroImageYoutubeVideoId: heroApplied ? videoId : undefined,
  });

  let recipe: { id: string; title: string; slug: string };
  try {
    recipe = await db.recipe.create({
      data: {
        title: baseTitle,
        slug,
        excerpt: "",
        typeId: recipeType.id,
        status: "draft",
        featured: false,
        seasonal: false,
        publishedAt: null,
        values: JSON.stringify(values),
        aiMeta: JSON.stringify(seedMeta),
      },
      select: { id: true, title: true, slug: true },
    });
  } catch (error) {
    // Race: another request may have linked the same video between check and create.
    const again = await findRecipeIdLinkedToVideo(videoId);
    if (again) {
      const linked = await db.recipe.findUnique({
        where: { id: again.id },
        select: { id: true, title: true, slug: true, typeId: true, type: { select: { name: true } } },
      });
      if (linked) {
        return {
          ok: true,
          recipeId: linked.id,
          recipeTitle: linked.title,
          recipeSlug: linked.slug,
          typeId: linked.typeId,
          typeName: linked.type.name,
          alreadyExisted: true,
          analysisOk: true,
        };
      }
    }
    return {
      ok: false,
      code: "create_failed",
      message: error instanceof Error ? error.message : "Could not create draft recipe.",
    };
  }

  // Deduplicate if concurrent creates both succeeded.
  const linkedAll = await findAllRecipesLinkedToVideo(videoId);
  if (linkedAll.length > 1) {
    const keeper = linkedAll[0];
    const extras = linkedAll.slice(1);
    for (const extra of extras) {
      await db.recipeCategory.deleteMany({ where: { recipeId: extra.id } });
      await db.recipe.delete({ where: { id: extra.id } });
    }
    if (keeper.id !== recipe.id) {
      return {
        ok: true,
        recipeId: keeper.id,
        recipeTitle: keeper.title,
        recipeSlug: keeper.slug,
        typeId: recipeType.id,
        typeName: recipeType.name,
        alreadyExisted: true,
        analysisOk: true,
      };
    }
    recipe = keeper;
  }

  const analysis = await populateDraftWithAi({
    recipeId: recipe.id,
    typeId: recipeType.id,
    videoId,
    seedMeta,
    fields: recipeType.fields.map((field) => ({
      key: field.key,
      label: field.label,
      kind: field.kind,
      required: field.required,
      helpText: field.helpText,
      options: (() => {
        try {
          return JSON.parse(field.options || "[]") as string[];
        } catch {
          return [];
        }
      })(),
    })),
  });

  try {
    const { attachRecipeToSeriesItemsByVideoId } = await import("@/lib/series-playlist");
    await attachRecipeToSeriesItemsByVideoId({ videoId, recipeId: recipe.id });
  } catch {
    // Series link is best-effort; recipe creation still succeeded.
  }

  return {
    ok: true,
    recipeId: recipe.id,
    recipeTitle: analysis.title || recipe.title,
    recipeSlug: analysis.slug || recipe.slug,
    typeId: recipeType.id,
    typeName: recipeType.name,
    alreadyExisted: false,
    analysisOk: analysis.ok,
    analysisMessage: analysis.message,
  };
}

async function populateDraftWithAi(input: {
  recipeId: string;
  typeId: string;
  videoId: string;
  seedMeta: ReturnType<typeof buildYoutubeDraftAiMeta>;
  fields: {
    key: string;
    label: string;
    kind: string;
    required: boolean;
    helpText: string;
    options: string[];
  }[];
}): Promise<{ ok: boolean; message?: string; title?: string; slug?: string }> {
  const db = getDb();
  const watchUrl = youtubeWatchUrl(input.videoId) || `https://www.youtube.com/watch?v=${input.videoId}`;

  const generated = await runAiRecipeGeneration({
    youtubeUrl: watchUrl,
    typeId: input.typeId,
  });

  if (!generated.ok) {
    await db.recipe.update({
      where: { id: input.recipeId },
      data: {
        aiMeta: JSON.stringify({
          ...input.seedMeta,
          generatedByAI: true,
          verificationStatus: "unverified",
          generatedAt: new Date().toISOString(),
          sourceVideoId: input.videoId,
          sourceUrl: watchUrl,
        } satisfies RecipeAiMeta),
        status: "draft",
        publishedAt: null,
      },
    });
    return {
      ok: false,
      message:
        generated.message ||
        "Draft created, but AI analysis could not be completed. You can regenerate the analysis or edit the recipe manually.",
    };
  }

  const recipe = await db.recipe.findUnique({ where: { id: input.recipeId } });
  if (!recipe) {
    return { ok: false, message: "Draft recipe was not found after creation." };
  }

  const currentValues = parseValues(recipe.values);
  const merged = mergeAiDraftIntoEditor(
    {
      title: recipe.title,
      slug: recipe.slug,
      excerpt: recipe.excerpt,
      featured: recipe.featured,
      seasonal: recipe.seasonal,
      categoryIds: [],
      values: currentValues,
    },
    {
      ...generated.draft,
      insufficientRecipeInformation: false,
      insufficientReason: "",
    },
    input.fields,
    "fill_empty",
    input.seedMeta as RecipeAiMeta,
  );

  // Keep canonical YouTube link and Hero thumbnail from synced video data.
  const video = await loadSyncedVideoForLink(input.videoId);
  let values = video
    ? applyYoutubeVideoLinkToValues(merged.values, video, { aiMeta: input.seedMeta })
    : merged.values;

  const withHero = fillEmptyHeroImageFromYoutubeThumbnail(values, input.seedMeta, {
    syncedThumbnailUrl: video?.thumbnailUrl,
    videoId: input.videoId,
  });
  values = withHero.values;

  const heroApplied = Boolean(String(values.image ?? "").trim());
  const summary = emptyAiSummary();
  const confidenceByPath = {
    ...(generated.meta.confidenceByPath ?? {}),
    ...merged.confidenceByPath,
  };
  for (const annotation of Object.values(confidenceByPath)) {
    tallyConfidence(annotation.confidence, summary);
  }

  const aiMeta: RecipeAiMeta = {
    ...generated.meta,
    generatedByAI: true,
    verificationStatus: "unverified",
    confidenceByPath,
    summary,
    fieldProvenance: merged.fieldProvenance,
    recipeTypeSource: input.seedMeta.recipeTypeSource,
    recipeTypeConfidence: input.seedMeta.recipeTypeConfidence,
    recipeTypeConfirmed: input.seedMeta.recipeTypeConfirmed,
    sourceVideoId: input.videoId,
    sourceUrl: watchUrl,
    heroImageSource: heroApplied
      ? withHero.aiMeta?.heroImageSource ||
        input.seedMeta.heroImageSource ||
        "youtube_thumbnail"
      : input.seedMeta.heroImageSource,
    heroImageYoutubeVideoId: heroApplied
      ? withHero.aiMeta?.heroImageYoutubeVideoId || input.videoId
      : input.seedMeta.heroImageYoutubeVideoId,
  };

  await db.recipe.update({
    where: { id: input.recipeId },
    data: {
      title: merged.title || recipe.title,
      slug: merged.slug || recipe.slug,
      excerpt: merged.excerpt,
      values: JSON.stringify(values),
      aiMeta: JSON.stringify(aiMeta),
      featured: false,
      seasonal: false,
      status: "draft",
      publishedAt: null,
    },
  });

  if (merged.categoryIds.length) {
    await db.recipeCategory.deleteMany({ where: { recipeId: input.recipeId } });
    await db.recipeCategory.createMany({
      data: merged.categoryIds.map((categoryId) => ({
        recipeId: input.recipeId,
        categoryId,
      })),
    });
  }

  return { ok: true, title: merged.title || recipe.title, slug: merged.slug || recipe.slug };
}
