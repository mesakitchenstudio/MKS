import type { GoogleGenAI } from "@google/genai";
import { buildAiRecipeResponseSchema } from "@/lib/ai-recipe/json-schema";
import { buildAiRecipeSystemInstruction, buildAiRecipeUserPrompt } from "@/lib/ai-recipe/prompt";
import {
  buildAiGeminiError,
  extractGeminiErrorMessage,
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

export type GeminiVideoProbeResult =
  | { ok: true; model: string; summary: string; videoId: string; canonicalUrl: string }
  | { ok: false; error: AiGeminiError; videoId?: string; canonicalUrl?: string };

export type GeminiGenerateResult =
  | { ok: true; model: string; raw: unknown; videoProbeSummary: string }
  | { ok: false; error: AiGeminiError; videoAnalysisSucceeded?: boolean };

const VIDEO_PROBE_PROMPT =
  "Return only the title or topic of this cooking video and one sentence describing what food is being prepared. Be concise.";

function interactionText(interaction: { output_text?: string; steps?: { content?: { text?: string; type?: string }[] }[] }) {
  if (interaction.output_text?.trim()) return interaction.output_text.trim();
  for (const step of interaction.steps ?? []) {
    for (const block of step.content ?? []) {
      if (block.type === "text" && block.text?.trim()) {
        return block.text.trim();
      }
    }
  }
  return "";
}

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
  return ai.interactions.create({
    model: input.model,
    input: [
      { type: "video", uri: input.videoUri },
      { type: "text", text: input.text },
    ],
    system_instruction: input.systemInstruction,
    response_format: input.responseFormat,
  });
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
  const probe = await testYouTubeVideoUnderstanding(input.youtubeUrl);
  if (!probe.ok) {
    return { ok: false, error: probe.error };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      error: buildAiGeminiError("GEMINI_CONFIGURATION_ERROR", "config"),
    };
  }

  const model = probe.model;
  const responseSchema = buildAiRecipeResponseSchema({
    recipeType: input.recipeType,
    categories: input.categories,
    allTypes: input.allTypes,
  });

  try {
    const interaction = await createVideoInteraction(ai, {
      model,
      videoUri: probe.canonicalUrl,
      text: buildAiRecipeUserPrompt({
        youtubeUrl: probe.canonicalUrl,
        recipeType: input.recipeType,
        allTypes: input.allTypes,
        categories: input.categories,
      }),
      systemInstruction: buildAiRecipeSystemInstruction(),
      responseFormat: {
        type: "text",
        mime_type: "application/json",
        schema: responseSchema,
      },
    });

    const text = interactionText(interaction);
    if (!text) {
      const error = buildAiGeminiError("RECIPE_SCHEMA_EMPTY", "recipe_schema");
      logGeminiFailure({
        stage: "recipe_schema",
        code: error.code,
        model,
        videoId: probe.videoId,
      });
      return { ok: false, error, videoAnalysisSucceeded: true };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      const error = buildAiGeminiError("RECIPE_SCHEMA_MALFORMED", "recipe_schema", {
        detail: "Response was not valid JSON.",
      });
      logGeminiFailure({
        stage: "recipe_schema",
        code: error.code,
        model,
        videoId: probe.videoId,
        detail: error.detail,
      });
      return { ok: false, error, videoAnalysisSucceeded: true };
    }

    return {
      ok: true,
      model,
      raw,
      videoProbeSummary: probe.summary,
    };
  } catch (error) {
    const mapped = mapGeminiException(error, "recipe_schema");
    if (mapped.code === "GEMINI_UNKNOWN_ERROR") {
      mapped.code = "RECIPE_SCHEMA_GENERATION_FAILED";
      mapped.message = buildAiGeminiError("RECIPE_SCHEMA_GENERATION_FAILED", "recipe_schema").message;
    }
    logGeminiFailure({
      stage: "recipe_schema",
      code: mapped.code,
      model,
      videoId: probe.videoId,
      httpStatus: mapped.httpStatus,
      detail: mapped.detail,
    });
    return { ok: false, error: mapped, videoAnalysisSucceeded: true };
  }
}
