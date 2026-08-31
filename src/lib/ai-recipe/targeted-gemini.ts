import { getGeminiClient } from "@/lib/ai-recipe/gemini-client";
import {
  buildAiGeminiError,
  extractJsonFromModelText,
  mapGeminiException,
  type AiGeminiError,
} from "@/lib/ai-recipe/errors";
import {
  buildTargetedFieldContext,
  dedupeSuggestedTags,
  fieldAiResponseSchemaHint,
  normalizeFieldAiResponse,
  type FieldAiIntent,
  type RecipeAiFieldDef,
} from "@/lib/ai-recipe/field-ai-registry";
import { defaultGeminiModel, geminiModelCandidates, type SchemaCategory } from "@/lib/ai-recipe/schema-version";
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
  fields: { key: string; label: string; kind: string; path: string; def?: RecipeAiFieldDef | null }[];
  current: {
    title: string;
    excerpt: string;
    categoryIds?: string[];
    values: Record<string, unknown>;
  };
  videoContext?: RecipeAiVideoContext | null;
  cacheHints?: Record<string, unknown> | null;
  categories?: SchemaCategory[];
  fieldIntent?: FieldAiIntent;
  currentValuesByPath?: Record<string, unknown>;
}): Promise<TargetedGeminiSuccess | TargetedGeminiFailure> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      ok: false,
      error: buildAiGeminiError("GEMINI_CONFIGURATION_ERROR", "config"),
    };
  }

  const intent = input.fieldIntent ?? "generate";
  const allowedCategoryIds = new Set((input.categories ?? []).map((category) => category.id));

  const fieldInstructions = input.fields
    .map((field) => {
      const currentValue = input.currentValuesByPath?.[field.path];
      const context = buildTargetedFieldContext({
        path: field.path,
        def: field.def,
        current: input.current,
        videoContext: input.videoContext,
        categories: input.categories,
        currentValue,
        intent,
      });
      return [
        `Field: ${field.path} (${field.label}, kind=${field.kind})`,
        `Output schema: ${fieldAiResponseSchemaHint(field.def ?? null, field.path)}`,
        `Context: ${JSON.stringify(context)}`,
      ].join("\n");
    })
    .join("\n\n");

  const prompt = [
    "You fill Mesa Kitchen Studio recipe metadata fields using existing recipe context only.",
    "Return ONLY JSON: { \"fields\": { \"<path>\": <value>, ... } }.",
    "Use exact path keys like title, excerpt, values.cuisine, values.holiday, values.nutrition.",
    "Only include requested paths. Do not invent ingredients, instructions, or categories outside taxonomy.",
    "Never claim VERIFIED FROM VIDEO — use editorial inference quality.",
    intent === "improve"
      ? "Improve the current value: clearer, more useful, still accurate."
      : intent === "alternative"
        ? "Offer a meaningfully different alternative to the current value."
        : "Generate content for empty fields only.",
    "",
    "Requested fields:",
    fieldInstructions,
    input.cacheHints && Object.keys(input.cacheHints).length
      ? `\nCached draft hints:\n${JSON.stringify(input.cacheHints).slice(0, 3000)}`
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
      const rawFields =
        parsed.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
          ? parsed.fields
          : (parsed as Record<string, unknown>);

      const fields: Record<string, unknown> = {};
      for (const field of input.fields) {
        const raw = rawFields[field.path] ?? rawFields[field.key];
        const normalized = normalizeFieldAiResponse({
          path: field.path,
          raw,
          def: field.def,
          allowedCategoryIds,
        });
        if (normalized == null) continue;
        if (field.path === "values.tags" && Array.isArray(normalized)) {
          fields[field.path] = dedupeSuggestedTags(normalized.map((tag) => String(tag)));
        } else {
          fields[field.path] = normalized;
        }
      }

      if (!Object.keys(fields).length) {
        lastError = buildAiGeminiError("RECIPE_SCHEMA_EMPTY", "recipe_schema");
        continue;
      }

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

export function targetedGeminiDefaultModel() {
  return defaultGeminiModel();
}
