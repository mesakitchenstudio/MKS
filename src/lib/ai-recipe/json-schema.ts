import { AI_CONFIDENCE_LEVELS } from "@/lib/ai-recipe/types";
import type { SchemaCategory, SchemaField, SchemaRecipeType } from "@/lib/ai-recipe/schema-version";
import { isAiFillableFieldKey } from "@/lib/ai-recipe/schema-version";

const confidenceEnum = {
  type: "STRING",
  enum: [...AI_CONFIDENCE_LEVELS],
  description:
    "VERIFIED = explicit in video; HIGH_CONFIDENCE_INFERENCE = strongly supported; ESTIMATED = culinary estimate; UNKNOWN = cannot determine.",
};

function confident(valueSchema: Record<string, unknown>, description?: string) {
  return {
    type: "OBJECT",
    description,
    properties: {
      value: valueSchema,
      confidence: confidenceEnum,
      sourceNote: {
        type: "STRING",
        description: "Brief note on where this came from in the video/workflow.",
      },
    },
    required: ["value", "confidence", "sourceNote"],
  };
}

function schemaForKind(kind: string, options: string[] = []): Record<string, unknown> {
  switch (kind) {
    case "number":
    case "minutes":
      return { type: "NUMBER" };
    case "boolean":
      return { type: "BOOLEAN" };
    case "select":
      return options.length
        ? { type: "STRING", enum: options }
        : { type: "STRING" };
    case "list":
    case "tags":
    case "gallery":
      return { type: "ARRAY", items: { type: "STRING" } };
    case "namedNotes":
      return {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            note: { type: "STRING" },
            confidence: confidenceEnum,
            sourceNote: { type: "STRING" },
          },
          required: ["name", "note", "confidence", "sourceNote"],
        },
      };
    case "ingredients":
      return {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Group name, or empty string for ungrouped." },
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  amount: { type: "STRING" },
                  item: { type: "STRING", description: "Ingredient name (Mesa field key: item)." },
                  notes: { type: "STRING" },
                  confidence: confidenceEnum,
                  sourceNote: { type: "STRING" },
                },
                required: ["amount", "item", "notes", "confidence", "sourceNote"],
              },
            },
          },
          required: ["name", "items"],
        },
      };
    case "instructions":
      return {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: {
              type: "STRING",
              description: "Section name, or empty string when there is no section heading.",
            },
            steps: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  text: { type: "STRING" },
                  confidence: confidenceEnum,
                  sourceNote: { type: "STRING" },
                },
                required: ["text", "confidence", "sourceNote"],
              },
            },
          },
          required: ["name", "steps"],
        },
      };
    case "nutrition":
      return {
        type: "OBJECT",
        properties: {
          calories: { type: "NUMBER" },
          carbs: { type: "NUMBER" },
          protein: { type: "NUMBER" },
          fat: { type: "NUMBER" },
          fiber: { type: "NUMBER" },
          sugar: { type: "NUMBER" },
        },
        required: ["calories", "carbs", "protein", "fat"],
      };
    case "textarea":
    case "text":
    case "image":
    default:
      return { type: "STRING" };
  }
}

function fieldProperty(field: SchemaField) {
  return confident(
    schemaForKind(field.kind, field.options || []),
    `${field.label} (${field.kind})${field.helpText ? ` — ${field.helpText}` : ""}`,
  );
}

/**
 * Gemini response schema derived from the live Mesa type/category definitions.
 * Uses Gemini Schema types (STRING/NUMBER/OBJECT/ARRAY), not OpenAPI lowercase.
 */
export function buildAiRecipeResponseSchema(input: {
  recipeType: SchemaRecipeType;
  categories: SchemaCategory[];
  allTypes: SchemaRecipeType[];
}) {
  const fillable = input.recipeType.fields.filter((field) => isAiFillableFieldKey(field.key));
  const fieldProperties: Record<string, unknown> = {};
  for (const field of fillable) {
    fieldProperties[field.key] = fieldProperty(field);
  }

  return {
    type: "OBJECT",
    properties: {
      recipeTypeId: {
        type: "STRING",
        enum: input.allTypes.map((type) => type.id),
        description: "Must be one of the provided Mesa Recipe Type IDs.",
      },
      title: confident({ type: "STRING" }, "Recipe title"),
      slug: confident({ type: "STRING" }, "URL slug suggestion (lowercase hyphenated)"),
      excerpt: confident({ type: "STRING" }, "Short card excerpt"),
      featured: confident({ type: "BOOLEAN" }, "Always false unless extremely strong product reason"),
      seasonal: confident({ type: "BOOLEAN" }, "Always false unless extremely strong product reason"),
      categoryIds: confident(
        {
          type: "ARRAY",
          items: input.categories.length
            ? {
                type: "STRING",
                enum: input.categories.map((category) => category.id),
              }
            : { type: "STRING" },
        },
        "Only existing Mesa category IDs",
      ),
      fields: {
        type: "OBJECT",
        description: "Mesa dynamic field values for this recipe type",
        properties: fieldProperties,
      },
      insufficientRecipeInformation: {
        type: "BOOLEAN",
        description: "True when the video does not contain enough recipe information.",
      },
      insufficientReason: {
        type: "STRING",
        description: "When insufficientRecipeInformation is true, explain briefly.",
      },
    },
    required: [
      "recipeTypeId",
      "title",
      "slug",
      "excerpt",
      "featured",
      "seasonal",
      "categoryIds",
      "fields",
      "insufficientRecipeInformation",
      "insufficientReason",
    ],
  };
}

const GEMINI_TYPE_MAP: Record<string, string> = {
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
  OBJECT: "object",
  ARRAY: "array",
};

/** Convert internal uppercase Gemini schema nodes to OpenAPI lowercase for Interactions API. */
export function toGeminiOpenApiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      output.type = GEMINI_TYPE_MAP[value] ?? value.toLowerCase();
      continue;
    }
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      output.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([propertyKey, propertySchema]) => [
          propertyKey,
          toGeminiOpenApiSchema(propertySchema as Record<string, unknown>),
        ]),
      );
      continue;
    }
    if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      output.items = toGeminiOpenApiSchema(value as Record<string, unknown>);
      continue;
    }
    output[key] = value;
  }

  return output;
}

export function buildAiRecipeResponseSchemaForGemini(input: {
  recipeType: SchemaRecipeType;
  categories: SchemaCategory[];
  allTypes: SchemaRecipeType[];
}) {
  return toGeminiOpenApiSchema(buildAiRecipeResponseSchema(input));
}
