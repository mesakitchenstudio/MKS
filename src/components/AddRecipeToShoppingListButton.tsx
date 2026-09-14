"use client";

import Link from "next/link";
import { useState } from "react";
import type { Recipe } from "@/data/types";
import { commitShoppingListAdd } from "@/components/ShoppingListClient";
import { trackEvent } from "@/lib/analytics";
import {
  buildRecipeShoppingContributions,
  SHOPPING_LIST_PATH,
  type RecipeIngredientIdentityHint,
} from "@/lib/shopping-list";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

export function AddRecipeToShoppingListButton({
  recipe,
  selectedServings,
  identityHints = [],
}: {
  recipe: Recipe;
  selectedServings: number;
  identityHints?: RecipeIngredientIdentityHint[];
}) {
  const [status, setStatus] = useState("");

  function onAdd() {
    const contributions = buildRecipeShoppingContributions({
      recipe,
      selectedServings,
      sourceMode: "RECIPE",
      identityHints,
    });
    const result = commitShoppingListAdd(contributions);
    trackEvent("shopping_list_add_recipe", {
      recipe_slug: recipe.slug,
      recipe_id: recipe.id,
      contribution_count: contributions.length,
      servings: selectedServings,
      source: "recipe",
    });
    setStatus(result.message);
    window.setTimeout(() => setStatus(""), 4000);
  }

  return (
    <div className="no-print mt-3">
      <button
        type="button"
        onClick={onAdd}
        className={`text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
      >
        Add ingredients to shopping list
      </button>
      {status ? (
        <p className="mt-1 text-sm text-muted" role="status" aria-live="polite">
          {status}{" "}
          <Link href={SHOPPING_LIST_PATH} className={`font-semibold text-terracotta ${controlFocus}`}>
            View shopping list
          </Link>
        </p>
      ) : null}
    </div>
  );
}
