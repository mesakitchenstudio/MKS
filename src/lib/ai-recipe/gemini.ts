import { GoogleGenAI } from "@google/genai";
import { buildAiRecipeResponseSchema } from "@/lib/ai-recipe/json-schema";
import { buildAiRecipeSystemInstruction, buildAiRecipeUserPrompt } from "@/lib/ai-recipe/prompt";
import {
  defaultGeminiModel,
  geminiApiKey,
  type SchemaCategory,
  type SchemaRecipeType,
} from "@/lib/ai-recipe/schema-version";

export type GeminiGenerateResult =
  | { ok: true; model: string; raw: unknown; cached: false }
  | { ok: false; code: string; message: string };

function mapGeminiError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error || "Generation failed");
  const lower = message.toLowerCase();
  if (lower.includes("api key") || lower.includes("permission") || lower.includes("401")) {
    return { code: "config", message: "Gemini API is not configured correctly." };
  }
  if (lower.includes("429") || lower.includes("rate") || lower.includes("quota")) {
    return { code: "rate_limit", message: "Gemini rate limit reached. Try again in a few minutes." };
  }
  if (lower.includes("timeout") || lower.includes("deadline")) {
    return { code: "timeout", message: "Gemini timed out while analyzing the video. Try again." };
  }
  if (lower.includes("not found") || lower.includes("unavailable") || lower.includes("private")) {
    return {
      code: "video_unavailable",
      message: "That YouTube video could not be processed (private, unavailable, or blocked).",
    };
  }
  if (lower.includes("json") || lower.includes("parse") || lower.includes("schema")) {
    return { code: "malformed", message: "Gemini returned a malformed recipe response. Try again." };
  }
  return {
    code: "gemini_error",
    message: "Could not analyze the video with Gemini. Try again or enter the recipe manually.",
  };
}

export async function generateRecipeDraftWithGemini(input: {
  youtubeUrl: string;
  recipeType: SchemaRecipeType;
  allTypes: SchemaRecipeType[];
  categories: SchemaCategory[];
}): Promise<GeminiGenerateResult> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    return {
      ok: false,
      code: "config",
      message: "GEMINI_API_KEY is not configured on the server.",
    };
  }

  const model = defaultGeminiModel();
  const ai = new GoogleGenAI({ apiKey });
  const responseSchema = buildAiRecipeResponseSchema({
    recipeType: input.recipeType,
    categories: input.categories,
    allTypes: input.allTypes,
  });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          fileData: {
            fileUri: input.youtubeUrl,
          },
        },
        {
          text: buildAiRecipeUserPrompt({
            youtubeUrl: input.youtubeUrl,
            recipeType: input.recipeType,
            allTypes: input.allTypes,
            categories: input.categories,
          }),
        },
      ],
      config: {
        systemInstruction: buildAiRecipeSystemInstruction(),
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      return {
        ok: false,
        code: "empty",
        message: "Gemini returned an empty response. Try again.",
      };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return {
        ok: false,
        code: "malformed",
        message: "Gemini returned non-JSON output. Try again.",
      };
    }

    return { ok: true, model, raw, cached: false };
  } catch (error) {
    console.error("Gemini recipe generation failed", {
      model,
      message: error instanceof Error ? error.message : String(error),
    });
    const mapped = mapGeminiError(error);
    return { ok: false, ...mapped };
  }
}
