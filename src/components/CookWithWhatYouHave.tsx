"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/data/types";
import {
  PublicIngredientChips,
  PublicIngredientPicker,
} from "@/components/PublicIngredientPicker";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { commitShoppingListAdd } from "@/components/ShoppingListClient";
import { trackEvent } from "@/lib/analytics";
import type { PublicIngredientOption } from "@/lib/ingredient-discovery";
import {
  buildCwyhUrl,
  CWYH_MAX_PANTRY,
  CWYH_PATH,
  formatCwyhMissingLine,
  type CookWithWhatYouHaveMatch,
  type CwyhResultGroup,
} from "@/lib/cook-with-what-you-have";
import {
  buildCwywMissingContributions,
  SHOPPING_LIST_PATH,
} from "@/lib/shopping-list";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

function missingBucketLabel(match: CookWithWhatYouHaveMatch): string {
  if (match.canMakeClaim) return "exact";
  if (match.effectiveMissingCount <= 1) return "missing_1";
  if (match.effectiveMissingCount === 2) return "missing_2";
  return "missing_3";
}

/**
 * URL pantry state is authoritative for ING-6 v1.
 * localStorage convenience deferred (correctness over hydration complexity).
 */
export function CookWithWhatYouHaveClient({
  options,
  urlHaveSlugs,
  groups,
  exactCount,
  nearCount,
  resultCount,
  recipesById,
  shoppingListEnabled = false,
}: {
  options: PublicIngredientOption[];
  /** Canonical slugs from URL (already validated against eligible options). */
  urlHaveSlugs: string[];
  groups: CwyhResultGroup[];
  exactCount: number;
  nearCount: number;
  resultCount: number;
  recipesById: Record<string, Recipe>;
  shoppingListEnabled?: boolean;
}) {
  const router = useRouter();
  const urlKey = urlHaveSlugs.join(",");
  const [staged, setStaged] = useState<string[]>(urlHaveSlugs);
  const [stagedSource, setStagedSource] = useState(urlKey);
  if (stagedSource !== urlKey) {
    setStagedSource(urlKey);
    setStaged(urlHaveSlugs);
  }

  const findPayloadKey = useMemo(
    () =>
      urlHaveSlugs.length
        ? `${urlKey}|${resultCount}|${exactCount}|${nearCount}`
        : "",
    [exactCount, nearCount, resultCount, urlHaveSlugs.length, urlKey],
  );

  useEffect(() => {
    if (!findPayloadKey || !urlHaveSlugs.length) return;
    trackEvent("cwyw_find", {
      pantry_count: urlHaveSlugs.length,
      result_count: resultCount,
      exact_count: exactCount,
      near_count: nearCount,
      pantry_slugs: urlHaveSlugs.slice(0, 8).join(","),
    });
  }, [exactCount, findPayloadKey, nearCount, resultCount, urlHaveSlugs]);

  function addSlug(slug: string) {
    setStaged((current) => {
      if (current.includes(slug) || current.length >= CWYH_MAX_PANTRY) return current;
      return [...current, slug].sort((a, b) => a.localeCompare(b));
    });
  }

  function removeSlug(slug: string) {
    setStaged((current) => current.filter((value) => value !== slug));
  }

  function clearPantry() {
    setStaged([]);
    router.push(CWYH_PATH);
  }

  function findRecipes() {
    const next = staged.slice(0, CWYH_MAX_PANTRY).sort((a, b) => a.localeCompare(b));
    router.push(buildCwyhUrl(next));
  }

  const hasUrlResults = urlHaveSlugs.length > 0;
  const blocked = new Set(staged);
  const [addStatus, setAddStatus] = useState<{ recipeId: string; message: string } | null>(null);

  function addMissing(match: CookWithWhatYouHaveMatch, recipe: Recipe) {
    const contributions = buildCwywMissingContributions({
      recipe,
      missing: match.missing,
    });
    const result = commitShoppingListAdd(contributions);
    trackEvent("shopping_list_add_missing", {
      recipe_slug: recipe.slug,
      recipe_id: match.recipeId,
      missing_count: contributions.length,
      source: "cwyw",
    });
    setAddStatus({ recipeId: match.recipeId, message: result.message });
    window.setTimeout(() => setAddStatus(null), 4000);
  }

  return (
    <div>
      <div className="mt-8 border-t border-line pt-7">
        <PublicIngredientPicker
          id="cwyw-ingredient"
          label="Ingredients you have"
          options={options}
          selected={staged}
          excludedFromAdd={blocked}
          maxSelections={CWYH_MAX_PANTRY}
          onAdd={addSlug}
          placeholder="Add an ingredient"
        />

        {staged.length ? (
          <div className="mt-3">
            <PublicIngredientChips slugs={staged} options={options} onRemove={removeSlug} />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={findRecipes}
            disabled={staged.length === 0}
            className={`inline-flex min-h-11 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50 ${controlFocus}`}
          >
            Find recipes
          </button>
          {staged.length || hasUrlResults ? (
            <button
              type="button"
              onClick={clearPantry}
              className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
            >
              Clear ingredients
            </button>
          ) : null}
        </div>
      </div>

      {!hasUrlResults ? (
        <p className="mt-8 max-w-2xl text-base leading-7 text-muted" role="status">
          Add a few ingredients you have at home and Mesa will show you the recipes you&apos;re
          closest to making.
        </p>
      ) : (
        <div className="mt-10">
          <p className="text-sm text-muted" role="status">
            {resultCount === 0
              ? "No close matches yet — try adding another ingredient, or remove one and search again."
              : `${resultCount} recipe${resultCount === 1 ? "" : "s"} close to what you have`}
          </p>

          {exactCount === 0 && nearCount > 0 ? (
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
              Nothing matches completely yet, but these recipes only need a few more ingredients.
            </p>
          ) : null}

          {groups.map((group) => (
            <section key={group.key} className="mt-9" aria-labelledby={`cwyw-${group.key}`}>
              <h2 id={`cwyw-${group.key}`} className="font-serif text-2xl text-ink md:text-3xl">
                {group.title}
              </h2>
              <ul className="mt-5 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {group.matches.map((match) => {
                  const recipe = recipesById[match.recipeId];
                  if (!recipe) return null;
                  const missingLine = formatCwyhMissingLine(match.missing);
                  return (
                    <li key={match.recipeId} className="min-w-0">
                      {match.canMakeClaim ? (
                        <p className="mb-2 text-sm font-medium text-olive">You have everything</p>
                      ) : missingLine ? (
                        <div className="mb-2">
                          <p className="text-sm text-muted">
                            <span className="sr-only">Still need: </span>
                            {missingLine}
                          </p>
                          {shoppingListEnabled ? (
                            <div className="mt-1">
                              <button
                                type="button"
                                className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
                                onClick={() => addMissing(match, recipe)}
                              >
                                Add missing
                              </button>
                              {addStatus?.recipeId === match.recipeId ? (
                                <p className="mt-1 text-sm text-muted" role="status" aria-live="polite">
                                  {addStatus.message}{" "}
                                  <Link
                                    href={SHOPPING_LIST_PATH}
                                    className={`font-semibold text-terracotta ${controlFocus}`}
                                  >
                                    View shopping list
                                  </Link>
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <RecipeGridCard
                        recipe={recipe}
                        onNavigate={() =>
                          trackEvent("cwyw_recipe_click", {
                            recipe_slug: recipe.slug,
                            recipe_id: match.recipeId,
                            placement: "cook_with_what_you_have",
                            missing_bucket: missingBucketLabel(match),
                          })
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
