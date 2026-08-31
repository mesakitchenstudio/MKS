import { getGeminiClient } from "@/lib/ai-recipe/gemini-client";
import {
  buildAiGeminiError,
  extractJsonFromModelText,
  mapGeminiException,
  type AiGeminiError,
} from "@/lib/ai-recipe/errors";
import { defaultGeminiModel, geminiModelCandidates } from "@/lib/ai-recipe/schema-version";
import type { RecipeAiVideoContext } from "@/lib/ai-recipe/types";

const TARGETED_TIMEOUT_MS = 45_000;

export type TargetedGeminiSuccess = {
  ok: true;
  model: string;
  fields: Record<string, unknown>;
};

export type TargetedGeminiFailure = {
  ok: false;
  error: AiGeminiError;
};

/**
 * Text-only Gemini call for one or more recipe fields.
 * Never attaches a YouTube video URI.
 */
export async function generateTargetedRecipeFields(input: {
  fields: { key: string; label: string; kind: string; path: string }[];
  current: {
    title: string;
    excerpt: string;
    values: Record<string, unknown>;
  };
  videoContext?: RecipeAiVideoContext | null;
  cacheHints?: Record<string, unknown> | null;
}): Promise<TargetedGeminiSuccess | TargetedGeminiFailure> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      error: buildAiGeminiError("GEMINI_CONFIGURATION_ERROR", "config"),
    };
  }

  const fieldList = input.fields
    .map((field) => `- ${field.path} (${field.label}, kind=${field.kind})`)
    .join("\n");

  const contextBlock = [
    input.videoContext?.dishContext ? `Dish: ${input.videoContext.dishContext}` : "",
    input.videoContext?.semanticSummary ? `Summary:\n${input.videoContext.semanticSummary}` : "",
    input.videoContext?.ingredientEvidence?.length
      ? `Ingredient evidence:\n${input.videoContext.ingredientEvidence.slice(0, 20).join("\n")}`
      : "",
    input.videoContext?.instructionStageEvidence?.length
      ? `Stages:\n${input.videoContext.instructionStageEvidence
          .map((stage) => `- ${stage.title}${stage.notes ? `: ${stage.notes}` : ""}`)
          .join("\n")}`
      : "",
    input.videoContext?.timingNotes ? `Timing: ${input.videoContext.timingNotes}` : "",
    input.videoContext?.videoDuration ? `Video duration: ${input.videoContext.videoDuration}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const currentSnapshot = {
    title: input.current.title,
    excerpt: input.current.excerpt,
    cuisine: input.current.values.cuisine,
    holiday: input.current.values.holiday,
    notes: input.current.values.notes,
    intro: truncate(input.current.values.intro, 400),
    tags: input.current.values.tags,
    imageAlt: input.current.values.imageAlt,
    faqs: input.current.values.faqs,
    keyIngredients: input.current.values.keyIngredients,
  };

  const prompt = [
    "You fill missing Mesa Kitchen Studio recipe metadata fields.",
    "Return ONLY a JSON object: { \"fields\": { \"<path>\": <value>, ... } }.",
    "Only include the requested paths. Do not invent ingredients or instructions.",
    "If a field cannot be determined reliably, omit it (do not invent confident nonsense).",
    "For tags (values.tags), return a compact string[] of useful editorial tags (max 12), deduped.",
    "For namedNotes/faqs, return [{ name, note }] arrays.",
    "Prefer HIGH_CONFIDENCE_INFERENCE quality; never claim VERIFIED FROM VIDEO.",
    "",
    "Requested fields:",
    fieldList,
    "",
    "Current recipe snapshot:",
    JSON.stringify(currentSnapshot),
    contextBlock ? `\nCached video analysis:\n${contextBlock}` : "",
    input.cacheHints && Object.keys(input.cacheHints).length
      ? `\nCached draft hints:\n${JSON.stringify(input.cacheHints).slice(0, 4000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let lastError: AiGeminiError | null = null;
  for (const model of geminiModelCandidates()) {
    try {
      const interaction = await ai.interactions.create(
        {
          model,
          input: [{ type: "text", text: prompt }],
          system_instruction:
            "You are Mesa Kitchen Studio's recipe editor assistant. Be concise, culinary, and honest about uncertainty.",
          response_format: {
            type: "text",
            mime_type: "application/json",
          },
        },
        { timeout: TARGETED_TIMEOUT_MS },
      );

      const text =
        interaction.output_text?.trim() ||
        (() => {
          for (const step of interaction.steps ?? []) {
            if (!("content" in step)) continue;
            for (const block of step.content ?? []) {
              if (block.type === "text" && "text" in block && block.text?.trim()) {
                return block.text.trim();
              }
            }
          }
          return "";
        })();

      const jsonText = extractJsonFromModelText(text);
      if (!jsonText) {
        lastError = buildAiGeminiError("RECIPE_SCHEMA_EMPTY", "recipe_schema");
        continue;
      }
      const parsed = JSON.parse(jsonText) as { fields?: Record<string, unknown> };
      const fields =
        parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
          ? parsed.fields
          : (parsed as Record<string, unknown>);
      return { ok: true, model, fields };
    } catch (error) {
      lastError = mapGeminiException(error, "recipe_schema");
      if (lastError.code === "GEMINI_RATE_LIMIT" || lastError.code === "GEMINI_AUTH_FAILED") {
        return { ok: false, error: lastError };
      }
    }
  }

  return {
    ok: false,
    error: lastError || buildAiGeminiError("GEMINI_UNKNOWN_ERROR", "unknown"),
  };
}

function truncate(value: unknown, max: number) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function targetedGeminiDefaultModel() {
  return defaultGeminiModel();
}
