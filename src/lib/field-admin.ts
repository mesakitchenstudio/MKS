import { FIELD_KINDS, CORE_FIELDS } from "@/lib/fields";
import { fieldValueHasContent } from "@/lib/field-content";
import { parseValues } from "@/lib/recipe-map";
import { getDb } from "@/lib/db";

export { fieldValueHasContent } from "@/lib/field-content";

export const CORE_FIELD_KEYS = new Set(CORE_FIELDS.map((field) => field.key));

export function isCoreFieldKey(key: string) {
  return CORE_FIELD_KEYS.has(key);
}

export function coreFieldDefinition(key: string) {
  return CORE_FIELDS.find((field) => field.key === key);
}

let sharedSchemaSync: Promise<void> | null = null;

/** Repair shared-field kind/options (and label when kind drifted) across all types. */
export function ensureSharedFieldSchemaIntegrity() {
  if (!sharedSchemaSync) {
    sharedSchemaSync = repairSharedFieldSchemaIntegrity().catch((error) => {
      sharedSchemaSync = null;
      console.error("Could not repair shared recipe field schema", error);
    });
  }
  return sharedSchemaSync;
}

async function repairSharedFieldSchemaIntegrity() {
  const db = getDb();
  const coreByKey = new Map(CORE_FIELDS.map((field) => [field.key, field]));
  const fields = await db.recipeTypeField.findMany();

  for (const field of fields) {
    const core = coreByKey.get(field.key);
    if (!core) continue;

    const expectedOptions = JSON.stringify(core.options || []);
    const kindMismatch = field.kind !== core.kind;
    const optionsMismatch = core.kind === "select" && field.options !== expectedOptions;

    if (!kindMismatch && !optionsMismatch) continue;

    await db.recipeTypeField.update({
      where: { id: field.id },
      data: {
        kind: core.kind,
        options: expectedOptions,
        ...(kindMismatch ? { label: core.label } : {}),
      },
    });
  }
}

/** Only `select` fields read options at render time (see RecipeEditor KindInput). */
export function fieldKindUsesOptions(kind: string) {
  return kind === "select";
}

export function fieldKindLabel(kind: string) {
  return FIELD_KINDS.find((item) => item.id === kind)?.label ?? kind;
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
