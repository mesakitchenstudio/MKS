import type { GoogleGenAI } from "@google/genai";
import { buildAiRecipeResponseSchema } from "@/lib/ai-recipe/json-schema";
import { buildAiRecipeSystemInstruction, buildAiRecipeUserPrompt } from "@/lib/ai-recipe/prompt";
import {
  buildAiGeminiError,
  isGeminiModelError,
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

export type GeminiVideoProbeResult =
  | { ok: true; model: string; summary: string; videoId: string; canonicalUrl: string }
  | { ok: false; error: AiGeminiError; videoId?: string; canonicalUrl?: string };

export type GeminiGenerateResult =
  | { ok: true; model: string; raw: unknown }
  | { ok: false; error: AiGeminiError; videoAnalysisSucceeded?: boolean };

const VIDEO_PROBE_PROMPT =
  "Return only the title or topic of this cooking video and one sentence describing what food is being prepared. Be concise.";

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
    { timeout: GEMINI_REQUEST_TIMEOUT_MS },
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
  const responseSchema = buildAiRecipeResponseSchema({
    recipeType: input.recipeType,
    categories: input.categories,
    allTypes: input.allTypes,
  });
  const userPrompt = buildAiRecipeUserPrompt({
    youtubeUrl: normalized.canonicalUrl,
    recipeType: input.recipeType,
    allTypes: input.allTypes,
    categories: input.categories,
  });
  const systemInstruction = buildAiRecipeSystemInstruction();

  let lastError: AiGeminiError | null = null;

  for (const model of models) {
    try {
      const interaction = await createVideoInteraction(ai, {
        model,
        videoUri: normalized.canonicalUrl,
        text: userPrompt,
        systemInstruction,
        responseFormat: {
          type: "text",
          mime_type: "application/json",
          schema: responseSchema,
        },
      });

      const text = interactionText(interaction);
      if (!text) {
        lastError = buildAiGeminiError("RECIPE_SCHEMA_EMPTY", "recipe_schema");
        logGeminiFailure({
          stage: "recipe_schema",
          code: lastError.code,
          model,
          videoId: normalized.videoId,
        });
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        lastError = buildAiGeminiError("RECIPE_SCHEMA_MALFORMED", "recipe_schema", {
          detail: "Response was not valid JSON.",
        });
        logGeminiFailure({
          stage: "recipe_schema",
          code: lastError.code,
          model,
          videoId: normalized.videoId,
          detail: lastError.detail,
        });
        return { ok: false, error: lastError, videoAnalysisSucceeded: true };
      }

      return { ok: true, model, raw };
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
      if (isGeminiModelError(error) && model !== models.at(-1)) {
        continue;
      }
      return {
        ok: false,
        error: lastError,
        videoAnalysisSucceeded: lastError.code !== "GEMINI_MODEL_ERROR" && lastError.code !== "GEMINI_CONFIGURATION_ERROR",
      };
    }
  }

  return {
    ok: false,
    error: lastError ?? buildAiGeminiError("RECIPE_SCHEMA_GENERATION_FAILED", "recipe_schema"),
    videoAnalysisSucceeded: Boolean(lastError && lastError.code !== "GEMINI_MODEL_ERROR"),
  };
}
