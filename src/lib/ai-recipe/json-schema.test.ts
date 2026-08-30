import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJsonFromModelText } from "./errors.ts";
import { buildAiRecipeResponseSchema, toGeminiOpenApiSchema } from "./json-schema.ts";

describe("ai-recipe json-schema", () => {
  it("converts uppercase Gemini schema nodes to OpenAPI lowercase", () => {
    const converted = toGeminiOpenApiSchema({
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        count: { type: "NUMBER" },
        tags: { type: "ARRAY", items: { type: "STRING" } },
      },
    });
    assert.equal(converted.type, "object");
    assert.deepEqual(converted.properties, {
      title: { type: "string" },
      count: { type: "number" },
      tags: { type: "array", items: { type: "string" } },
    });
  });

  it("requires priority recipe fields but not every optional field", () => {
    const schema = buildAiRecipeResponseSchema({
      recipeType: {
        id: "type-1",
        name: "Bread",
        slug: "bread",
        fields: [
          { key: "intro", label: "Intro", kind: "textarea", required: true },
          { key: "tips", label: "Tips", kind: "list", required: false },
          { key: "riseHours", label: "Rise hours", kind: "number", required: false },
        ],
      },
      categories: [],
      allTypes: [{ id: "type-1", name: "Bread", slug: "bread", fields: [] }],
    }) as { properties: { fields: { required?: string[] } } };

    assert.deepEqual(schema.properties.fields.required, ["intro"]);
  });
});

describe("ai-recipe errors", () => {
  it("extracts JSON from fenced model output", () => {
    const parsed = extractJsonFromModelText('```json\n{"title":{"value":"Test"}}\n```');
    assert.equal(parsed, '{"title":{"value":"Test"}}');
  });
});
