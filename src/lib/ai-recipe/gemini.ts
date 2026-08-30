import type { GoogleGenAI } from "@google/genai";
import {
  buildAiRecipeResponseSchemaForGemini,
} from "@/lib/ai-recipe/json-schema";
import { buildAiRecipeSystemInstruction, buildAiRecipeUserPrompt } from "@/lib/ai-recipe/prompt";
import {
  buildAiGeminiError,
  extractJsonFromModelText,
  isGeminiModelError,
  isRetryableRecipeSchemaFailure,
  logGeminiFailure,
  mapGeminiException,
  type AiGeminiError,
} from "@/lib/ai-recipe/errors";
import { getGeminiClient } from "@/lib/ai-recipe/gemini-client";
import {
  geminiModelCandidates,
  type SchemaCategory,
  type SchemaRecipeType,
} from "@/lib/ai-recipe/schema-version";
import { normalizeYouTubeForGemini } from "@/lib/ai-recipe/youtube-url";

/** Per-call SDK timeout — keep below the Vercel route maxDuration budget. */
const GEMINI_REQUEST_TIMEOUT_MS = 270_000;
/** Total wall-clock budget for one generate attempt (route maxDuration is 300s). */
const GEMINI_GENERATION_BUDGET_MS = 260_000;
const MIN_GEMINI_ATTEMPT_MS = 20_000;

export type GeminiVideoProbeResult =
  | { ok: true; model: string; summary: string; videoId: string; canonicalUrl: string }
  | { ok: false; error: AiGeminiError; videoId?: string; canonicalUrl?: string };

export type GeminiGenerateResult =
  | { ok: true; model: string; raw: unknown }
  | { ok: false; error: AiGeminiError; videoAnalysisSucceeded?: boolean };

const VIDEO_PROBE_PROMPT =
  "Return only the title or topic of this cooking video and one sentence describing what food is being prepared. Be concise.";

const PROMPT_JSON_SUFFIX = [
  "",
  "Return ONLY one JSON object matching the requested Mesa draft shape.",
  "Do not wrap the JSON in markdown code fences.",
  "Populate intro, ingredients, instructions, prepMinutes, and servings at minimum.",
  "Each scalar field should use { value, confidence, sourceNote } when possible.",
  "Plain values are also accepted for fields, e.g. fields.intro can be a string or a confident wrapper.",
  "Ingredient lines use amount, item, notes nested under group items[] (never a flat top-level ingredient array).",
  "Instruction steps use steps[].text.",
].join("\n");

type GenerationMode = "structured" | "prompt_json";

async function createVideoInteraction(
  ai: GoogleGenAI,
  input: {
    model: string;
    videoUri: string;
    text: string;
    systemInstruction?: string;
    responseFormat?: {
      type: "text";
      mime_type: "application/json";
      schema: Record<string, unknown>;
    };
  },
  timeoutMs: number = GEMINI_REQUEST_TIMEOUT_MS,
) {
  return ai.interactions.create(
    {
      model: input.model,
      input: [
        { type: "video", uri: input.videoUri },
        { type: "text", text: input.text },
      ],
      system_instruction: input.systemInstruction,
      response_format: input.responseFormat,
    },
    { timeout: timeoutMs },
  );
}

type GeminiInteraction = Awaited<ReturnType<typeof createVideoInteraction>>;

function interactionText(interaction: GeminiInteraction) {
  if (interaction.output_text?.trim()) return interaction.output_text.trim();
  for (const step of interaction.steps ?? []) {
    if (!("content" in step)) continue;
    for (const block of step.content ?? []) {
      if (block.type === "text" && "text" in block && block.text?.trim()) {
        return block.text.trim();
      }
    }
  }
  return "";
}

function parseRecipeJson(text: string): { ok: true; raw: unknown } | { ok: false; error: AiGeminiError } {
  const jsonText = extractJsonFromModelText(text);
  if (!jsonText) {
    return { ok: false, error: buildAiGeminiError("RECIPE_SCHEMA_EMPTY", "recipe_schema") };
  }
  try {
    return { ok: true, raw: JSON.parse(jsonText) };
  } catch {
    return {
      ok: false,
      error: buildAiGeminiError("RECIPE_SCHEMA_MALFORMED", "recipe_schema", {
        detail: "Response was not valid JSON.",
      }),
    };
  }
}

/** Stage A — verify Gemini can read the public YouTube video. */
export async function testYouTubeVideoUnderstanding(youtubeUrl: string): Promise<GeminiVideoProbeResult> {
  const normalized = normalizeYouTubeForGemini(youtubeUrl);
  if (!normalized) {
    return {
      ok: false,
      error: buildAiGeminiError("INVALID_YOUTUBE_URL", "video_probe"),
    };
  }

  const apiKeyPresent = Boolean(getGeminiClient());
  if (!apiKeyPresent) {
    return {
      ok: false,
      videoId: normalized.videoId,
      canonicalUrl: normalized.canonicalUrl,
      error: buildAiGeminiError("GEMINI_CONFIGURATION_ERROR", "config"),
    };
  }

  const ai = getGeminiClient()!;
  const models = geminiModelCandidates();
  let lastError: AiGeminiError | null = null;

  for (const model of models) {
    try {
      const interaction = await createVideoInteraction(ai, {
        model,
        videoUri: normalized.canonicalUrl,
        text: VIDEO_PROBE_PROMPT,
      });
      const summary = interactionText(interaction);
      if (!summary) {
        lastError = buildAiGeminiError("VIDEO_INPUT_FAILED", "video_probe", {
          detail: "Gemini returned no text for the video probe.",
        });
        logGeminiFailure({
          stage: "video_probe",
          code: lastError.code,
          model,
          videoId: normalized.videoId,
          detail: lastError.detail,
        });
        continue;
      }
      return {
        ok: true,
        model,
        summary,
        videoId: normalized.videoId,
        canonicalUrl: normalized.canonicalUrl,
      };
    } catch (error) {
      lastError = mapGeminiException(error, "video_probe");
      logGeminiFailure({
        stage: "video_probe",
        code: lastError.code,
        model,
        videoId: normalized.videoId,
        httpStatus: lastError.httpStatus,
        detail: lastError.detail,
      });
      if (isGeminiModelError(error) && model !== models.at(-1)) {
        continue;
      }
      return {
        ok: false,
        videoId: normalized.videoId,
        canonicalUrl: normalized.canonicalUrl,
        error: lastError,
      };
    }
  }

  return {
    ok: false,
    videoId: normalized.videoId,
    canonicalUrl: normalized.canonicalUrl,
    error: lastError ?? buildAiGeminiError("VIDEO_INPUT_FAILED", "video_probe"),
  };
}

export async function generateRecipeDraftWithGemini(input: {
  youtubeUrl: string;
  recipeType: SchemaRecipeType;
  allTypes: SchemaRecipeType[];
  categories: SchemaCategory[];
}): Promise<GeminiGenerateResult> {
  const normalized = normalizeYouTubeForGemini(input.youtubeUrl);
  if (!normalized) {
    return { ok: false, error: buildAiGeminiError("INVALID_YOUTUBE_URL", "video_probe") };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      error: buildAiGeminiError("GEMINI_CONFIGURATION_ERROR", "config"),
    };
  }

  const models = geminiModelCandidates();
  const responseSchema = buildAiRecipeResponseSchemaForGemini({
    recipeType: input.recipeType,
    categories: input.categories,
    allTypes: input.allTypes,
  });
  const baseUserPrompt = buildAiRecipeUserPrompt({
    youtubeUrl: normalized.canonicalUrl,
    recipeType: input.recipeType,
    allTypes: input.allTypes,
    categories: input.categories,
  });
  const systemInstruction = buildAiRecipeSystemInstruction();
  const modes: GenerationMode[] = ["structured", "prompt_json"];

  let lastError: AiGeminiError | null = null;
  let videoAnalysisSucceeded = false;
  const startedAt = Date.now();
  const remainingBudgetMs = () => GEMINI_GENERATION_BUDGET_MS - (Date.now() - startedAt);

  for (const model of models) {
    let skipModel = false;

    for (const mode of modes) {
      const budgetMs = remainingBudgetMs();
      if (budgetMs < MIN_GEMINI_ATTEMPT_MS) {
        lastError =
          lastError ??
          buildAiGeminiError("GEMINI_TIMEOUT", "recipe_schema", {
            detail: "Video analysis exceeded the server time limit. Try again in a moment.",
          });
        skipModel = true;
        break;
      }

      try {
        const interaction = await createVideoInteraction(
          ai,
          {
            model,
            videoUri: normalized.canonicalUrl,
            text: mode === "structured" ? baseUserPrompt : `${baseUserPrompt}${PROMPT_JSON_SUFFIX}`,
            systemInstruction,
            responseFormat:
              mode === "structured"
                ? {
                    type: "text",
                    mime_type: "application/json",
                    schema: responseSchema,
                  }
                : undefined,
          },
          Math.min(GEMINI_REQUEST_TIMEOUT_MS, budgetMs),
        );

        const text = interactionText(interaction);
        if (!text) {
          lastError = buildAiGeminiError("RECIPE_SCHEMA_EMPTY", "recipe_schema", {
            detail: `No text returned (${mode}).`,
          });
          logGeminiFailure({
            stage: "recipe_schema",
            code: lastError.code,
            model,
            videoId: normalized.videoId,
            detail: lastError.detail,
          });
          if (mode === "structured") continue;
          break;
        }

        videoAnalysisSucceeded = true;
        const parsed = parseRecipeJson(text);
        if (!parsed.ok) {
          lastError = parsed.error;
          logGeminiFailure({
            stage: "recipe_schema",
            code: lastError.code,
            model,
            videoId: normalized.videoId,
            detail: lastError.detail,
          });
          if (mode === "structured") continue;
          break;
        }

        return { ok: true, model, raw: parsed.raw };
      } catch (error) {
        lastError = mapGeminiException(error, "recipe_schema");
        if (lastError.code === "GEMINI_UNKNOWN_ERROR") {
          lastError.code = "RECIPE_SCHEMA_GENERATION_FAILED";
          lastError.message = buildAiGeminiError("RECIPE_SCHEMA_GENERATION_FAILED", "recipe_schema").message;
        }
        logGeminiFailure({
          stage: "recipe_schema",
          code: lastError.code,
          model,
          videoId: normalized.videoId,
          httpStatus: lastError.httpStatus,
          detail: lastError.detail,
        });

        if (isGeminiModelError(error)) {
          skipModel = true;
          break;
        }
        if (mode === "structured" && isRetryableRecipeSchemaFailure(lastError.code)) {
          continue;
        }
        break;
      }
    }

    if (skipModel && model !== models.at(-1)) {
      continue;
    }
  }

  return {
    ok: false,
    error: lastError ?? buildAiGeminiError("RECIPE_SCHEMA_GENERATION_FAILED", "recipe_schema"),
    videoAnalysisSucceeded,
  };
}
