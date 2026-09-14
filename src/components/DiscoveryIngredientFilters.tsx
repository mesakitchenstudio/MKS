"use client";

import {
  PublicIngredientChips,
  PublicIngredientPicker,
} from "@/components/PublicIngredientPicker";
import {
  MAX_INGREDIENT_FILTER_SELECTIONS,
  type PublicIngredientOption,
} from "@/lib/ingredient-discovery";
import {
  getIngredientFilterSelection,
  type RecipeDiscoveryParams,
} from "@/lib/recipe-discovery";

export function DiscoveryIngredientFilters({
  params,
  options,
  onChange,
}: {
  params: RecipeDiscoveryParams;
  options: PublicIngredientOption[];
  onChange: (next: RecipeDiscoveryParams) => void;
}) {
  const selection = getIngredientFilterSelection(params);
  const blocked = new Set([...selection.includeSlugs, ...selection.excludeSlugs]);

  function setIncludes(nextIncludes: string[]) {
    onChange({
      ...params,
      ingredients: nextIncludes.length ? nextIncludes : undefined,
      ingredientMode:
        nextIncludes.length > 1
          ? params.ingredientMode === "any"
            ? "any"
            : undefined
          : undefined,
    });
  }

  function setExcludes(nextExcludes: string[]) {
    onChange({
      ...params,
      excludeIngredients: nextExcludes.length ? nextExcludes : undefined,
      ingredients: selection.includeSlugs.filter((slug) => !nextExcludes.includes(slug)),
    });
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
        Ingredients
      </p>
      <p className="mt-1 text-sm text-muted">
        Filter by culinary identity. General search above still matches titles and recipe text.
      </p>

      <div className="mt-3 flex flex-wrap gap-4">
        <PublicIngredientPicker
          id="discovery-ingredient-include"
          label="Contains"
          options={options}
          selected={selection.includeSlugs}
          excludedFromAdd={blocked}
          maxSelections={MAX_INGREDIENT_FILTER_SELECTIONS}
          onAdd={(slug) => {
            if (selection.includeSlugs.includes(slug)) return;
            if (selection.includeSlugs.length >= MAX_INGREDIENT_FILTER_SELECTIONS) return;
            setIncludes([...selection.includeSlugs, slug].sort((a, b) => a.localeCompare(b)));
          }}
        />

        <PublicIngredientPicker
          id="discovery-ingredient-exclude"
          label="Exclude"
          options={options}
          selected={selection.excludeSlugs}
          excludedFromAdd={blocked}
          maxSelections={MAX_INGREDIENT_FILTER_SELECTIONS}
          onAdd={(slug) => {
            if (selection.excludeSlugs.includes(slug)) return;
            if (selection.excludeSlugs.length >= MAX_INGREDIENT_FILTER_SELECTIONS) return;
            setExcludes([...selection.excludeSlugs, slug].sort((a, b) => a.localeCompare(b)));
          }}
        />
      </div>

      {selection.includeSlugs.length > 1 ? (
        <fieldset className="mt-4">
          <legend className="text-sm text-muted">Match</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-ink">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ingredientMode"
                checked={selection.mode === "all"}
                onChange={() =>
                  onChange({
                    ...params,
                    ingredientMode: undefined,
                  })
                }
              />
              All ingredients
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="ingredientMode"
                checked={selection.mode === "any"}
                onChange={() =>
                  onChange({
                    ...params,
                    ingredientMode: "any",
                  })
                }
              />
              Any ingredient
            </label>
          </div>
        </fieldset>
      ) : null}

      {selection.includeSlugs.length > 0 || selection.excludeSlugs.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <PublicIngredientChips
            slugs={selection.includeSlugs}
            options={options}
            onRemove={(slug) =>
              setIncludes(selection.includeSlugs.filter((value) => value !== slug))
            }
          />
          <PublicIngredientChips
            slugs={selection.excludeSlugs}
            options={options}
            prefix="Exclude: "
            onRemove={(slug) =>
              setExcludes(selection.excludeSlugs.filter((value) => value !== slug))
            }
          />
        </div>
      ) : null}
    </div>
  );
}
