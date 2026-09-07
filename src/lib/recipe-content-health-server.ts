import "server-only";

import { getDb } from "@/lib/db";
import { parseValues } from "@/lib/recipe-map";
import {
  filterRecipeContentHealth,
  getRecipeContentHealth,
  sortRecipeContentHealth,
  summarizeRecipeContentHealth,
  type RecipeContentHealth,
  type RecipeContentHealthFilter,
  type RecipeContentHealthSummary,
} from "@/lib/recipe-content-health";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";

type TypeFieldRow = {
  key: string;
  label: string;
  kind: string;
  required: boolean;
  helpText: string;
  options: string;
  sortOrder: number;
};

function toEditorFields(fields: TypeFieldRow[]) {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
  }));
}

function toSchemaFields(fields: TypeFieldRow[]): SchemaField[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
    helpText: field.helpText,
    options: (() => {
      try {
        const parsed = JSON.parse(field.options || "[]") as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
  }));
}

/**
 * Load Content Health for all Recipes.
 * Bounded queries: recipes (+ categories) and type fields — no per-row YouTube/API calls.
 */
export async function loadRecipeContentHealthCatalogue(filters?: RecipeContentHealthFilter): Promise<{
  rows: RecipeContentHealth[];
  filtered: RecipeContentHealth[];
  summary: RecipeContentHealthSummary;
  types: Array<{ id: string; name: string }>;
}> {
  const db = getDb();
  const [recipes, typeFields, types] = await Promise.all([
    db.recipe.findMany({
      include: {
        type: { select: { id: true, name: true } },
        categories: { select: { categoryId: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.recipeTypeField.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        typeId: true,
        key: true,
        label: true,
        kind: true,
        required: true,
        helpText: true,
        options: true,
        sortOrder: true,
      },
    }),
    db.recipeType.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const fieldsByType = new Map<string, TypeFieldRow[]>();
  for (const field of typeFields) {
    const list = fieldsByType.get(field.typeId) ?? [];
    list.push({
      key: field.key,
      label: field.label,
      kind: field.kind,
      required: field.required,
      helpText: field.helpText,
      options: field.options,
      sortOrder: field.sortOrder,
    });
    fieldsByType.set(field.typeId, list);
  }

  const rows = recipes.map((recipe) => {
    const fields = fieldsByType.get(recipe.typeId) ?? [];
    const values = parseValues(recipe.values);
    return getRecipeContentHealth({
      recipeId: recipe.id,
      title: recipe.title,
      slug: recipe.slug,
      publicationStatus: recipe.status,
      typeId: recipe.typeId,
      typeName: recipe.type.name,
      updatedAt: recipe.updatedAt,
      readinessInput: {
        title: recipe.title,
        slug: recipe.slug,
        excerpt: recipe.excerpt,
        typeId: recipe.typeId,
        fields: toEditorFields(fields),
        values,
        categoryIds: recipe.categories.map((row) => row.categoryId),
        typeFields: toSchemaFields(fields),
      },
    });
  });

  const sorted = sortRecipeContentHealth(rows);
  const filtered = filterRecipeContentHealth(sorted, filters ?? {});
  return {
    rows: sorted,
    filtered,
    summary: summarizeRecipeContentHealth(sorted),
    types,
  };
}
