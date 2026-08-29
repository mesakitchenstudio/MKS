import { createHash } from "node:crypto";
import type { FieldKind } from "@/lib/fields";

export type SchemaField = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  options?: string[];
  helpText?: string;
};

export type SchemaRecipeType = {
  id: string;
  name: string;
  slug: string;
  fields: SchemaField[];
};

export type SchemaCategory = {
  id: string;
  name: string;
  slug: string;
  group: string;
};

/** Stable fingerprint of Mesa types/fields/categories used for AI cache invalidation. */
export function computeRecipeSchemaVersion(input: {
  types: SchemaRecipeType[];
  categories: SchemaCategory[];
  coreFieldKeys: readonly string[];
}) {
  const payload = {
    core: [...input.coreFieldKeys],
    types: [...input.types]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((type) => ({
        id: type.id,
        slug: type.slug,
        fields: [...type.fields]
          .sort((a, b) => a.key.localeCompare(b.key))
          .map((field) => ({
            key: field.key,
            kind: field.kind,
            required: field.required,
            options: field.options || [],
          })),
      })),
    categories: [...input.categories]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((category) => ({ id: category.id, slug: category.slug, group: category.group })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export function defaultGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

export function geminiApiKey() {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
}

/** Fields AI may populate (hero image stays manual). */
export function isAiFillableFieldKey(key: string) {
  return key !== "image" && key !== "floatingYoutubeUrl";
}

export function fieldKindForSchema(kind: string): FieldKind | string {
  return kind;
}
