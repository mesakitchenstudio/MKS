import { getDb } from "@/lib/db";
import { CORE_FIELDS, RECIPE_OVERVIEW_KEYS } from "@/lib/fields";

let sync: Promise<void> | null = null;

export function ensureRecipeOverviewFields() {
  if (!sync) {
    sync = syncRecipeOverviewFields().catch((error) => {
      sync = null;
      console.error("Could not sync recipe overview fields", error);
    });
  }
  return sync;
}

async function syncRecipeOverviewFields() {
  const db = getDb();
  const types = await db.recipeType.findMany({
    include: { fields: true },
  });
  const wanted = CORE_FIELDS.filter((field) =>
    RECIPE_OVERVIEW_KEYS.includes(field.key as (typeof RECIPE_OVERVIEW_KEYS)[number]),
  );

  for (const type of types) {
    const last = type.fields.reduce((max, field) => Math.max(max, field.sortOrder), -1);
    let nextOrder = last + 1;
    for (const field of wanted) {
      const existing = type.fields.find((item) => item.key === field.key);
      if (existing) {
        if (existing.label !== field.label || existing.kind !== field.kind) {
          await db.recipeTypeField.update({
            where: { id: existing.id },
            data: {
              label: field.label,
              kind: field.kind,
              helpText: field.helpText || existing.helpText,
              required: Boolean(field.required),
              options: JSON.stringify(field.options || JSON.parse(existing.options || "[]")),
            },
          });
        }
        continue;
      }
      await db.recipeTypeField.create({
        data: {
          typeId: type.id,
          key: field.key,
          label: field.label,
          helpText: field.helpText || "",
          kind: field.kind,
          required: Boolean(field.required),
          options: JSON.stringify(field.options || []),
          sortOrder: nextOrder,
        },
      });
      nextOrder += 1;
    }
  }
}
