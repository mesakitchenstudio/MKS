import { FIELD_KINDS } from "@/lib/fields";
import { parseValues } from "@/lib/recipe-map";

/** Only `select` fields read options at render time (see RecipeEditor KindInput). */
export function fieldKindUsesOptions(kind: string) {
  return kind === "select";
}

export function fieldKindLabel(kind: string) {
  return FIELD_KINDS.find((item) => item.id === kind)?.label ?? kind;
}

export function fieldValueHasContent(value: unknown, kind: string): boolean {
  switch (kind) {
    case "textarea":
    case "text":
    case "image":
      return String(value ?? "").trim().length > 0;
    case "number":
    case "minutes":
      return typeof value === "number" && !Number.isNaN(value) && value !== 0;
    case "boolean":
      return value === true;
    case "select":
      return String(value ?? "").trim().length > 0;
    case "gallery":
    case "list":
    case "tags": {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return items.some((item) => item.trim().length > 0);
    }
    case "namedNotes": {
      const items = Array.isArray(value) ? (value as { name?: string; note?: string }[]) : [];
      return items.some(
        (item) => String(item.name ?? "").trim().length > 0 || String(item.note ?? "").trim().length > 0,
      );
    }
    case "ingredients": {
      const groups = Array.isArray(value) ? (value as { items: { item: string }[] }[]) : [];
      return groups.some((group) =>
        group.items.some((item) => String(item.item ?? "").trim().length > 0),
      );
    }
    case "instructions": {
      const groups = Array.isArray(value) ? (value as { steps: string[] }[]) : [];
      return groups.some((group) => group.steps.some((step) => step.trim().length > 0));
    }
    case "nutrition": {
      const row = (value || {}) as Record<string, unknown>;
      return ["calories", "carbs", "protein", "fat"].some((key) => {
        const num = row[key];
        return typeof num === "number" && !Number.isNaN(num) && num !== 0;
      });
    }
    default:
      return String(value ?? "").trim().length > 0;
  }
}

export function countRecipesWithFieldContent(
  recipes: { values: string | Record<string, unknown> }[],
  key: string,
  kind: string,
): number {
  return recipes.filter((recipe) => {
    const values = parseValues(recipe.values);
    return fieldValueHasContent(values[key], kind);
  }).length;
}

export function countRecipesMissingFieldContent(
  recipes: { values: string | Record<string, unknown> }[],
  key: string,
  kind: string,
): number {
  return recipes.filter((recipe) => {
    const values = parseValues(recipe.values);
    return !fieldValueHasContent(values[key], kind);
  }).length;
}

export function isStructuralFieldDraftChange(
  before: { kind: string; required: boolean; options: string[] },
  after: { kind: string; required: boolean; options: string },
) {
  const afterOptions = after.options
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return (
    before.kind !== after.kind ||
    before.required !== after.required ||
    before.options.join(",") !== afterOptions.join(",")
  );
}

export type AdminTypeField = {
  id: string;
  key: string;
  label: string;
  helpText: string;
  kind: string;
  required: boolean;
  options: string[];
  sortOrder: number;
  isShared: boolean;
  globalIndex: number;
};

export function partitionTypeFields(fields: AdminTypeField[]) {
  const typeSpecific = fields
    .filter((field) => !field.isShared)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const shared = fields
    .filter((field) => field.isShared)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { typeSpecific, shared };
}
