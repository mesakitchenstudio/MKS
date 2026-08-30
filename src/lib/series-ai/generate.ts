import "server-only";
import { getGeminiClient } from "@/lib/ai-recipe/gemini-client";
import {
  buildAiGeminiError,
  extractJsonFromModelText,
  mapGeminiException,
} from "@/lib/ai-recipe/errors";
import { geminiModelCandidates } from "@/lib/ai-recipe/schema-version";
import { getDb } from "@/lib/db";
import {
  buildSeriesAiContext,
  selectSeriesHero,
  seriesContextForPrompt,
  suggestFeaturedItemId,
  type SeriesAiContext,
} from "@/lib/series-ai/context";
import {
  buildSeriesProvenanceSnapshot,
  seriesFieldIsEmpty,
  shouldApplySeriesAiField,
} from "@/lib/series-ai/provenance";
import {
  parseSeriesAiMeta,
  serializeSeriesAiMeta,
  SERIES_AI_SCALAR_PATHS,
  itemCustomDescriptionPath,
  itemCustomTitlePath,
  type SeriesAiMergeMode,
  type SeriesAiMeta,
  type SeriesHeroImageSource,
} from "@/lib/series-ai/types";

export type SeriesAiDraftFields = {
  title: string;
  shortTitle: string;
  description: string;
  intro: string;
  seoTitle: string;
  seoDescription: string;
  items: Array<{
    itemId: string;
    customTitle: string;
    customDescription: string;
  }>;
};

export type SeriesAiGenerateResult =
  | {
      ok: true;
      seriesId: string;
      model: string;
      draftStatus: NonNullable<SeriesAiMeta["draftStatus"]>;
      appliedPaths: string[];
      heroSource: SeriesHeroImageSource | "";
      heroLabel: string;
    }
  | {
      ok: false;
      message: string;
      code?: string;
    };

const SERIES_EDITORIAL_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    shortTitle: { type: "string" },
    description: { type: "string" },
    intro: { type: "string" },
    seoTitle: { type: "string" },
    seoDescription: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          itemId: { type: "string" },
          customTitle: { type: "string" },
          customDescription: { type: "string" },
        },
        required: ["itemId", "customTitle", "customDescription"],
      },
    },
  },
  required: [
    "title",
    "shortTitle",
    "description",
    "intro",
    "seoTitle",
    "seoDescription",
    "items",
  ],
};

function systemInstruction() {
  return [
    "You are the Mesa Kitchen Studio Series editorial assistant.",
    "Write warm, calm, practical, table-centered cooking collection copy.",
    "Do not use clickbait, keyword stuffing, unsupported claims, or health/dietary claims.",
    "Ground every sentence in the supplied playlist, video, and recipe data.",
    "Prefer linked recipe titles for item customTitle when they are already strong editorial titles.",
    "Otherwise rewrite promotional YouTube titles into clearer Mesa-facing titles.",
    "Return JSON only matching the schema.",
  ].join("\n");
}

function userPrompt(context: SeriesAiContext) {
  return [
    "Create a Mesa Series editorial draft from this local collection data.",
    "Fill useful Mesa-owned fields for human review before publishing.",
    "",
    "Field guidance:",
    "- title: concise collection title (not overly long)",
    "- shortTitle: short nav/card title",
    "- description: 1–3 sentence series summary",
    "- intro: 2–4 short paragraphs for the Series page",
    "- seoTitle: useful search title, include Mesa Kitchen Studio when natural",
    "- seoDescription: ~140–160 characters when practical",
    "- items[].itemId: must match supplied itemId exactly",
    "- items[].customTitle: Mesa-facing item title",
    "- items[].customDescription: 1–2 sentences why this item belongs",
    "",
    "Do not invent ingredients, techniques, or claims not supported by the data.",
    "Do not set published state.",
    "",
    "DATA:",
    JSON.stringify(seriesContextForPrompt(context)),
  ].join("\n");
}

function interactionText(interaction: {
  output_text?: string | null;
  steps?: Array<unknown>;
}) {
  if (interaction.output_text?.trim()) return interaction.output_text.trim();
  for (const step of interaction.steps ?? []) {
    if (!step || typeof step !== "object" || !("content" in step)) continue;
    const content = (step as { content?: Array<{ type?: string; text?: string }> }).content;
    for (const block of content ?? []) {
      if (block.type === "text" && block.text?.trim()) return block.text.trim();
    }
  }
  return "";
}

export async function callGeminiForSeriesEditorial(
  context: SeriesAiContext,
): Promise<{ ok: true; draft: SeriesAiDraftFields; model: string } | { ok: false; message: string; code?: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      code: "GEMINI_CONFIGURATION_ERROR",
      message: "Gemini is not configured on the server.",
    };
  }

  const prompt = userPrompt(context);
  const system = systemInstruction();
  let lastMessage = "Could not generate Series editorial draft.";

  for (const model of geminiModelCandidates()) {
    try {
      const interaction = await ai.interactions.create(
        {
          model,
          input: [{ type: "text", text: prompt }],
          system_instruction: system,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: SERIES_EDITORIAL_SCHEMA,
          },
        },
        { timeout: 90_000 },
      );
      const text = interactionText(interaction);
      const jsonText = extractJsonFromModelText(text);
      if (!jsonText) {
        lastMessage = "Gemini returned an empty editorial response.";
        continue;
      }
      const raw = JSON.parse(jsonText) as Partial<SeriesAiDraftFields>;
      const itemIds = new Set(context.items.map((item) => item.itemId));
      const items = Array.isArray(raw.items)
        ? raw.items
            .map((row) => ({
              itemId: String(row.itemId || "").trim(),
              customTitle: String(row.customTitle || "").trim(),
              customDescription: String(row.customDescription || "").trim(),
            }))
            .filter((row) => itemIds.has(row.itemId))
        : [];

      // Ensure every item has a slot (even if empty) for merge logic
      for (const item of context.items) {
        if (!items.some((row) => row.itemId === item.itemId)) {
          items.push({ itemId: item.itemId, customTitle: "", customDescription: "" });
        }
      }

      const draft: SeriesAiDraftFields = {
        title: String(raw.title || "").trim(),
        shortTitle: String(raw.shortTitle || "").trim(),
        description: String(raw.description || "").trim(),
        intro: String(raw.intro || "").trim(),
        seoTitle: String(raw.seoTitle || "").trim(),
        seoDescription: String(raw.seoDescription || "").trim(),
        items,
      };
      return { ok: true, draft, model };
    } catch (error) {
      const mapped = mapGeminiException(error, "recipe_schema");
      lastMessage = mapped.message;
      if (mapped.code === "GEMINI_CONFIGURATION_ERROR" || mapped.code === "GEMINI_AUTH_FAILED") {
        return { ok: false, code: mapped.code, message: mapped.message };
      }
    }
  }

  return { ok: false, message: lastMessage, code: buildAiGeminiError("RECIPE_SCHEMA_GENERATION_FAILED", "recipe_schema").code };
}

function evaluateDraftStatus(input: {
  title: string;
  shortTitle: string;
  description: string;
  intro: string;
  seoTitle: string;
  seoDescription: string;
  heroImage: string;
  items: Array<{ customTitle: string; customDescription: string; hasDisplayTitle: boolean }>;
}): SeriesAiMeta["draftStatus"] {
  const scalars = [
    input.title,
    input.shortTitle,
    input.description,
    input.intro,
    input.seoTitle,
    input.seoDescription,
    input.heroImage,
  ];
  const scalarOk = scalars.every((value) => Boolean(value.trim()));
  const itemsOk =
    input.items.length === 0 ||
    input.items.every(
      (item) =>
        (item.customTitle.trim() || item.hasDisplayTitle) && Boolean(item.customDescription.trim()),
    );
  if (scalarOk && itemsOk) return "complete";
  if (scalars.some((value) => Boolean(value.trim())) || input.items.some((i) => i.customDescription.trim())) {
    return "needs_review";
  }
  return "partial";
}

/**
 * Generate (or regenerate) Mesa Series editorial fields from local synced data.
 * Never changes isPublished. Never overwrites manual hero.
 */
export async function generateSeriesEditorialDraft(input: {
  seriesId: string;
  mode?: SeriesAiMergeMode;
}): Promise<SeriesAiGenerateResult> {
  const mode: SeriesAiMergeMode = input.mode || "fill_empty";
  const db = getDb();
  const context = await buildSeriesAiContext(input.seriesId);
  if (!context) {
    return { ok: false, message: "Series not found.", code: "not_found" };
  }

  const series = await db.series.findUnique({ where: { id: input.seriesId } });
  if (!series) return { ok: false, message: "Series not found.", code: "not_found" };

  const previousMeta = parseSeriesAiMeta(series.aiMeta);
  const gemini = await callGeminiForSeriesEditorial(context);
  if (!gemini.ok) {
    const failedMeta: SeriesAiMeta = {
      ...previousMeta,
      draftStatus: "failed",
      lastError: gemini.message,
    };
    await db.series.update({
      where: { id: input.seriesId },
      data: { aiMeta: serializeSeriesAiMeta(failedMeta) },
    });
    return { ok: false, message: gemini.message, code: gemini.code };
  }

  const draft = gemini.draft;
  const appliedPaths: string[] = [];
  const nextProvenance = { ...(previousMeta.fieldProvenance || {}) };

  const nextScalars: Record<(typeof SERIES_AI_SCALAR_PATHS)[number], string> = {
    title: series.title,
    shortTitle: series.shortTitle,
    description: series.description,
    intro: series.intro,
    seoTitle: series.seoTitle,
    seoDescription: series.seoDescription,
  };

  for (const path of SERIES_AI_SCALAR_PATHS) {
    const currentValue = nextScalars[path];
    const draftValue = draft[path];
    if (!draftValue.trim()) continue;
    if (
      shouldApplySeriesAiField({
        path,
        mode,
        meta: previousMeta,
        isEmpty: seriesFieldIsEmpty(currentValue),
      })
    ) {
      nextScalars[path] = draftValue;
      nextProvenance[path] = buildSeriesProvenanceSnapshot(path, draftValue);
      appliedPaths.push(path);
    }
  }

  const itemUpdates: Array<{
    id: string;
    customTitle: string;
    customDescription: string;
    featured: boolean;
  }> = [];

  for (const item of context.items) {
    const draftItem = draft.items.find((row) => row.itemId === item.itemId);
    let customTitle = item.customTitle;
    let customDescription = item.customDescription;

    const titlePath = itemCustomTitlePath(item.itemId);
    const descPath = itemCustomDescriptionPath(item.itemId);
    const preferredTitle =
      draftItem?.customTitle?.trim() ||
      item.recipe?.title?.trim() ||
      "";

    if (
      preferredTitle &&
      shouldApplySeriesAiField({
        path: titlePath,
        mode,
        meta: previousMeta,
        isEmpty: seriesFieldIsEmpty(customTitle),
      })
    ) {
      customTitle = preferredTitle;
      nextProvenance[titlePath] = buildSeriesProvenanceSnapshot(titlePath, preferredTitle);
      appliedPaths.push(titlePath);
    }

    if (
      draftItem?.customDescription?.trim() &&
      shouldApplySeriesAiField({
        path: descPath,
        mode,
        meta: previousMeta,
        isEmpty: seriesFieldIsEmpty(customDescription),
      })
    ) {
      customDescription = draftItem.customDescription.trim();
      nextProvenance[descPath] = buildSeriesProvenanceSnapshot(descPath, customDescription);
      appliedPaths.push(descPath);
    }

    itemUpdates.push({
      id: item.itemId,
      customTitle,
      customDescription,
      featured: item.featured,
    });
  }

  // Featured suggestion (once)
  let featuredChosenByHuman = Boolean(previousMeta.featuredChosenByHuman);
  if (!featuredChosenByHuman && !itemUpdates.some((item) => item.featured)) {
    const suggested = suggestFeaturedItemId(context);
    if (suggested) {
      for (const item of itemUpdates) {
        item.featured = item.id === suggested;
      }
      appliedPaths.push("featured");
    }
  }

  // Hero auto-select — never overwrite manual
  let heroImage = series.heroImage;
  let heroImageSource = (series.heroImageSource || "") as SeriesHeroImageSource | "";
  let heroLabel = "";
  const manualHero = heroImageSource === "manual" && Boolean(heroImage.trim());
  if (!manualHero && seriesFieldIsEmpty(heroImage)) {
    const selected = selectSeriesHero({
      ...context,
      heroImage,
      heroImageSource,
      title: nextScalars.title,
      items: context.items.map((item) => {
        const update = itemUpdates.find((row) => row.id === item.itemId);
        return {
          ...item,
          featured: update?.featured ?? item.featured,
          customTitle: update?.customTitle ?? item.customTitle,
          customDescription: update?.customDescription ?? item.customDescription,
        };
      }),
    });
    if (selected) {
      heroImage = selected.url;
      heroImageSource = selected.source;
      heroLabel = selected.label;
      appliedPaths.push("heroImage");
    }
  } else if (manualHero) {
    heroLabel = "Manual upload";
  } else if (heroImage.trim()) {
    heroLabel = heroImageSource.startsWith("auto_") ? "Auto hero" : "Existing hero";
  }

  const draftStatus = evaluateDraftStatus({
    ...nextScalars,
    heroImage,
    items: itemUpdates.map((item) => {
      const ctx = context.items.find((row) => row.itemId === item.id);
      return {
        customTitle: item.customTitle,
        customDescription: item.customDescription,
        hasDisplayTitle: Boolean(
          item.customTitle.trim() || ctx?.recipe?.title || ctx?.video?.title,
        ),
      };
    }),
  });

  const nextMeta: SeriesAiMeta = {
    generatedByAI: true,
    generatedAt: new Date().toISOString(),
    model: gemini.model,
    verificationStatus: "unverified",
    draftStatus,
    mergeModeLastUsed: mode,
    fieldProvenance: nextProvenance,
    featuredChosenByHuman,
    lastError: undefined,
  };

  await db.$transaction(async (tx) => {
    await tx.series.update({
      where: { id: input.seriesId },
      data: {
        title: nextScalars.title || series.title,
        shortTitle: nextScalars.shortTitle,
        description: nextScalars.description,
        intro: nextScalars.intro,
        seoTitle: nextScalars.seoTitle,
        seoDescription: nextScalars.seoDescription,
        heroImage,
        heroImageSource,
        aiMeta: serializeSeriesAiMeta(nextMeta),
        // never touch isPublished
      },
    });
    for (const item of itemUpdates) {
      await tx.seriesItem.update({
        where: { id: item.id },
        data: {
          customTitle: item.customTitle,
          customDescription: item.customDescription,
          featured: item.featured,
        },
      });
    }
  });

  return {
    ok: true,
    seriesId: input.seriesId,
    model: gemini.model,
    draftStatus: draftStatus || "needs_review",
    appliedPaths,
    heroSource: heroImageSource,
    heroLabel,
  };
}
