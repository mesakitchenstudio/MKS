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

const VIDEO_CHAPTER_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    duration: {
      type: "string",
      description: "Total video duration as MM:SS or HH:MM:SS when known from the video.",
    },
    sections: {
      type: "array",
      description: "One entry per target recipe section in index order.",
      items: {
        type: "object",
        properties: {
          sectionIndex: {
            type: "number",
            description: "0-based index of the target recipe section.",
          },
          matched: {
            type: "boolean",
            description: "True only when the section start can be located in video evidence.",
          },
          startTime: {
            type: "string",
            description: "Section start as MM:SS or HH:MM:SS when matched is true.",
          },
          label: {
            type: "string",
            description: "Short label for what begins at this time.",
          },
          confidence: {
            type: "string",
            enum: ["VERIFIED", "HIGH_CONFIDENCE_INFERENCE", "ESTIMATED", "UNKNOWN"],
          },
          evidence: {
            type: "string",
            description: "Brief description of the observed video evidence at this time.",
          },
        },
        required: ["sectionIndex", "matched", "confidence", "evidence"],
      },
    },
  },
  required: ["sections"],
};

export type VideoChapterAnalysisSectionInput = {
  sectionIndex: number;
  title: string;
  steps: string[];
};

function buildVideoChapterAnalysisPrompt(sections: VideoChapterAnalysisSectionInput[]): string {
  const targets = sections
    .map((section) => {
      const stepLines = section.steps
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((step) => `   - ${step}`)
        .join("\n");
      return [
        `${section.sectionIndex + 1}. [sectionIndex=${section.sectionIndex}] ${section.title}`,
        stepLines ? `   Recognition context (do NOT use step count to invent timing):\n${stepLines}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    "Analyze this cooking video and identify the timestamp where each specific recipe stage begins.",
    "",
    "Target stages:",
    targets,
    "",
    "Return ONLY JSON with:",
    "- duration: total video duration when known from the video",
    "- sections: one object per target with sectionIndex, matched, startTime (when matched), label, confidence, evidence",
    "",
    "Rules:",
    "- Use sectionIndex exactly as provided (0-based).",
    "- Set matched=true and startTime only when you can locate the stage in actual video evidence (visuals, narration, captions, actions).",
    "- Do NOT estimate from duration, section order, section count, or assumed pacing.",
    "- If a stage cannot be located confidently, set matched=false and omit startTime.",
    "- Evidence must describe what is happening in the video — do not fabricate.",
  ].join("\n");
}

export type GeminiVideoChapterAnalysisResult =
  | { ok: true; model: string; raw: unknown; latencyMs: number }
  | {
      ok: false;
      error: AiGeminiError;
      latencyMs: number;
      stage:
        | "VIDEO_ANALYSIS_REQUEST_FAILED"
        | "VIDEO_ANALYSIS_TIMEOUT"
        | "VIDEO_ANALYSIS_EMPTY"
        | "VIDEO_ANALYSIS_PARSE_FAILED"
        | "VIDEO_ANALYSIS_UNCONFIGURED";
    };

/** Focused Gemini video analysis for instruction-section chapter timestamps. */
export async function analyzeVideoChaptersWithGemini(input: {
  youtubeUrl: string;
  sections: VideoChapterAnalysisSectionInput[];
}): Promise<GeminiVideoChapterAnalysisResult> {
  const started = Date.now();
  const normalized = normalizeYouTubeForGemini(input.youtubeUrl);
  if (!normalized) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      stage: "VIDEO_ANALYSIS_REQUEST_FAILED",
      error: buildAiGeminiError("INVALID_YOUTUBE_URL", "video_probe"),
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      stage: "VIDEO_ANALYSIS_UNCONFIGURED",
      error: buildAiGeminiError("GEMINI_CONFIGURATION_ERROR", "config"),
    };
  }

  const models = geminiModelCandidates();
  const prompt = buildVideoChapterAnalysisPrompt(input.sections);
  const modes: GenerationMode[] = ["structured", "prompt_json"];
  let lastError: AiGeminiError | null = null;
  let lastStage:
    | "VIDEO_ANALYSIS_REQUEST_FAILED"
    | "VIDEO_ANALYSIS_TIMEOUT"
    | "VIDEO_ANALYSIS_EMPTY"
    | "VIDEO_ANALYSIS_PARSE_FAILED"
    | "VIDEO_ANALYSIS_UNCONFIGURED" = "VIDEO_ANALYSIS_REQUEST_FAILED";

  for (const model of models) {
    for (const mode of modes) {
      try {
        const interaction = await createVideoInteraction(ai, {
          model,
          videoUri: normalized.canonicalUrl,
          text:
            mode === "structured"
              ? prompt
              : `${prompt}\n\nReturn ONLY one JSON object. Do not wrap in markdown.`,
          systemInstruction:
            "You are Mesa's video chapter analyst. Ground every timestamp in observed video evidence. Never interpolate from duration or section count.",
          responseFormat:
            mode === "structured"
              ? {
                  type: "text",
                  mime_type: "application/json",
                  schema: VIDEO_CHAPTER_ANALYSIS_SCHEMA,
                }
              : undefined,
        });

        const text = interactionText(interaction);
        if (!text) {
          lastError = buildAiGeminiError("RECIPE_SCHEMA_EMPTY", "recipe_schema", {
            detail: `No chapter analysis text (${mode}).`,
          });
          lastStage = "VIDEO_ANALYSIS_EMPTY";
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

        const parsed = parseRecipeJson(text);
        if (!parsed.ok) {
          lastError = parsed.error;
          lastStage = "VIDEO_ANALYSIS_PARSE_FAILED";
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

        return { ok: true, model, raw: parsed.raw, latencyMs: Date.now() - started };
      } catch (error) {
        lastError = mapGeminiException(error, "recipe_schema");
        lastStage =
          lastError.code === "GEMINI_TIMEOUT"
            ? "VIDEO_ANALYSIS_TIMEOUT"
            : "VIDEO_ANALYSIS_REQUEST_FAILED";
        logGeminiFailure({
          stage: "recipe_schema",
          code: lastError.code,
          model,
          videoId: normalized.videoId,
          httpStatus: lastError.httpStatus,
          detail: lastError.detail,
        });
        if (isGeminiModelError(error)) break;
        if (mode === "structured" && isRetryableRecipeSchemaFailure(lastError.code)) continue;
        break;
      }
    }
  }

  return {
    ok: false,
    latencyMs: Date.now() - started,
    stage: lastStage,
    error: lastError ?? buildAiGeminiError("RECIPE_SCHEMA_GENERATION_FAILED", "recipe_schema"),
  };
}
