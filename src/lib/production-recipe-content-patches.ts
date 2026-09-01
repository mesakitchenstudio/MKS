/**
 * Editorial content corrections for published recipe values (DB `values` JSON).
 * Does not change public UI — only canonical recipe field data.
 */
export const PRODUCTION_RECIPE_VALUE_PATCHES: Record<string, Record<string, unknown>> = {
  "iced-horchata-coffee": {
    restMinutes: 240,
  },
  "herb-focaccia": {
    riseHours: 8,
    restMinutes: 75,
  },
  "lemon-sesame-bars": {
    restMinutes: 120,
  },
  "breakfast-tortillas": {
    image: "",
  },
  "roasted-market-vegetables": {
    image: "",
  },
};

export function mergeProductionRecipeContentPatches(
  slug: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const patch = PRODUCTION_RECIPE_VALUE_PATCHES[slug];
  if (!patch) return values;
  return { ...values, ...patch };
}

export function patchedProductionRecipeSlugs(): string[] {
  return Object.keys(PRODUCTION_RECIPE_VALUE_PATCHES).sort();
}
