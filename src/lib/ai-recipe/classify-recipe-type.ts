import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import { getGeminiClient } from "@/lib/ai-recipe/gemini-client";
import { extractJsonFromModelText, mapGeminiException } from "@/lib/ai-recipe/errors";
import { geminiModelCandidates } from "@/lib/ai-recipe/schema-version";
import { getDb } from "@/lib/db";
import { loadSyncedVideoForLink } from "@/lib/youtube-data/video-selector";
import { youtubeWatchUrl } from "@/lib/youtube";

export type RecipeTypeConfidence = "HIGH" | "MEDIUM" | "LOW";

export type RecipeTypeClassification = {
  recipeTypeId: string;
  recipeTypeName: string;
  confidence: RecipeTypeConfidence;
  reasoning: string;
};

export type ClassifyRecipeTypeResult =
  | { ok: true; classification: RecipeTypeClassification; model: string }
  | { ok: false; confidence: "LOW"; message: string };

type MesaRecipeTypeOption = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

function normalizeConfidence(value: unknown): RecipeTypeConfidence {
  const upper = String(value ?? "").trim().toUpperCase();
  if (upper === "HIGH" || upper === "MEDIUM" || upper === "LOW") return upper;
  return "LOW";
}

export function buildRecipeTypeClassificationPrompt(input: {
  video: {
    title: string;
    description: string;
    tags: string[];
    durationDisplay: string;
    durationSeconds: number;
  };
  types: MesaRecipeTypeOption[];
}): string {
  const chapters = parseYoutubeDescriptionChapters(input.video.description);
  const chapterLines = chapters.map((chapter) => `- ${chapter.label}`).join("\n");
  const typeLines = input.types
    .map(
      (type) =>
        `- id: ${type.id}\n  name: ${type.name}\n  slug: ${type.slug}\n  description: ${type.description || "(no description)"}`,
    )
    .join("\n");

  return [
    "Classify this YouTube cooking video into exactly ONE existing Mesa Kitchen Studio recipe type.",
    "Choose based on the food being prepared, not casual words in the title.",
    "You MUST choose recipeTypeId from the allowed list below. Never invent a new type.",
    "",
    "Examples of correct semantics:",
    "- churros, cheesecake, brownies → Dessert or Cake when those types exist",
    "- garlic bread, flatbread, sourdough → Bread",
    "- mushroom pasta, curry, stew → Main",
    "- caesar dressing, salsa, pesto → Condiment",
    "- egg toast, pancakes, omelette → Breakfast",
    "- chocolate chip cookies → Cookie",
    "",
    "Return JSON only:",
    '{ "recipeTypeId": "<id from list>", "confidence": "HIGH|MEDIUM|LOW", "reasoning": "<one sentence>" }',
    "",
    "Use HIGH only when the dish clearly fits one Mesa type.",
    "Use MEDIUM when likely but not obvious.",
    "Use LOW when ambiguous or insufficient evidence.",
    "",
    "=== YouTube video ===",
    `Title: ${input.video.title}`,
    `Duration: ${input.video.durationDisplay || `${input.video.durationSeconds}s`}`,
    `Tags: ${input.video.tags.length ? input.video.tags.join(", ") : "(none)"}`,
    chapterLines ? `Chapter labels:\n${chapterLines}` : "Chapter labels: (none parsed)",
    "",
    "Description excerpt:",
    input.video.description.trim().slice(0, 4000) || "(empty)",
    "",
    "=== Allowed Mesa recipe types (choose one id) ===",
    typeLines,
  ].join("\n");
}

export function resolveRecipeTypeFromModelOutput(
  raw: { recipeTypeId?: unknown; recipeTypeName?: unknown; confidence?: unknown; reasoning?: unknown },
  types: MesaRecipeTypeOption[],
): RecipeTypeClassification | null {
  const byId = new Map(types.map((type) => [type.id, type]));
  const byName = new Map(types.map((type) => [type.name.toLowerCase(), type]));

  let typeId = String(raw.recipeTypeId ?? "").trim();
  if (!byId.has(typeId)) {
    const nameGuess = String(raw.recipeTypeName ?? typeId).trim().toLowerCase();
    const fromName = byName.get(nameGuess);
    if (fromName) typeId = fromName.id;
  }

  const match = byId.get(typeId);
  if (!match) return null;

  return {
    recipeTypeId: match.id,
    recipeTypeName: match.name,
    confidence: normalizeConfidence(raw.confidence),
    reasoning: String(raw.reasoning ?? "").trim(),
  };
}

export async function classifyRecipeTypeForYoutubeVideo(
  videoId: string,
): Promise<ClassifyRecipeTypeResult> {
  const db = getDb();
  const [video, types] = await Promise.all([
    loadSyncedVideoForLink(videoId),
    db.recipeType.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!video) {
    return { ok: false, confidence: "LOW", message: "YouTube video was not found in Mesa sync data." };
  }
  if (!types.length) {
    return { ok: false, confidence: "LOW", message: "No Mesa recipe types are configured." };
  }

  const typeOptions: MesaRecipeTypeOption[] = types.map((type) => ({
    id: type.id,
    name: type.name,
    slug: type.slug,
    description: type.description,
  }));

  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      confidence: "LOW",
      message: "Gemini is not configured. Select a recipe type manually.",
    };
  }

  const prompt = buildRecipeTypeClassificationPrompt({ video, types: typeOptions });
  const systemInstruction =
    "You classify cooking videos into existing Mesa Kitchen Studio recipe types. Output JSON only.";

  const schema = {
    type: "object",
    properties: {
      recipeTypeId: { type: "string" },
      confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
      reasoning: { type: "string" },
    },
    required: ["recipeTypeId", "confidence", "reasoning"],
  };

  let lastError = "Classification failed.";
  for (const model of geminiModelCandidates()) {
    try {
      const interaction = await ai.interactions.create(
        {
          model,
          input: [{ type: "text", text: prompt }],
          system_instruction: systemInstruction,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema,
          },
        },
        { timeout: 45_000 },
      );

      const text =
        interaction.output_text?.trim() ||
        interaction.steps?.flatMap((step) =>
          "content" in step ? step.content ?? [] : [],
        )
          .map((block) => ("text" in block ? block.text : ""))
          .find(Boolean) ||
        "";

      const jsonText = extractJsonFromModelText(text);
      if (!jsonText) {
        lastError = "AI returned an unreadable classification response.";
        continue;
      }

      const parsed = JSON.parse(jsonText) as {
        recipeTypeId?: unknown;
        recipeTypeName?: unknown;
        confidence?: unknown;
        reasoning?: unknown;
      };
      const resolved = resolveRecipeTypeFromModelOutput(parsed, typeOptions);
      if (!resolved) {
        lastError = "AI chose a recipe type that is not in Mesa.";
        continue;
      }

      if (resolved.confidence === "LOW") {
        return {
          ok: false,
          confidence: "LOW",
          message: resolved.reasoning || "AI could not confidently determine the recipe type.",
        };
      }

      return { ok: true, classification: resolved, model };
    } catch (error) {
      const mapped = mapGeminiException(error, "unknown");
      lastError = mapped.message;
      continue;
    }
  }

  return { ok: false, confidence: "LOW", message: lastError };
}

export function buildYoutubeDraftAiMeta(input: {
  videoId: string;
  recipeTypeSource: "ai" | "manual";
  recipeTypeConfidence?: RecipeTypeConfidence;
  recipeTypeConfirmed?: boolean;
}) {
  const watchUrl = youtubeWatchUrl(input.videoId) || "";
  return {
    generatedByAI: false,
    sourceType: "youtube" as const,
    sourceUrl: watchUrl,
    sourceVideoId: input.videoId,
    generatedAt: "",
    model: "",
    schemaVersion: "",
    verificationStatus: "none" as const,
    confidenceByPath: {},
    summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
    recipeTypeSource: input.recipeTypeSource,
    recipeTypeConfidence: input.recipeTypeConfidence,
    recipeTypeConfirmed: Boolean(input.recipeTypeConfirmed),
  };
}
