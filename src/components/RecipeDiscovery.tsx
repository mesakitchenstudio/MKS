"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { trackEvent } from "@/lib/analytics";
import {
  DISCOVERY_CATEGORIES,
  DISCOVERY_SORTS,
  buildRecipesUrl,
  primaryCategoryLabel,
  type RecipeDiscoveryParams,
} from "@/lib/recipe-discovery";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const DISCOVERY_PLACEMENT = "recipes_catalog";

function categoryControlLabel(id: string, label: string) {
  return id === "all" ? "All recipes" : label;
}

export function RecipeDiscovery({
  recipes,
  params,
  collectionTitles,
}: {
  recipes: Recipe[];
  params: RecipeDiscoveryParams;
  collectionTitles: Record<string, string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(params.q ?? "");
  const activeCategory = params.category ?? "all";
  const activeSort = params.sort ?? "latest";
  const collectionTitle = params.collection ? collectionTitles[params.collection] : undefined;
  const categoryLabel = params.category ? primaryCategoryLabel(params.category) : undefined;
  const hasFilters = Boolean(params.q || params.category || params.collection || params.sort);

  const contextParts = useMemo(() => {
    const parts: string[] = [];
    if (collectionTitle) parts.push(collectionTitle);
    else if (categoryLabel) parts.push(categoryLabel);
    if (params.q) parts.push(`Search: “${params.q}”`);
    return parts;
  }, [categoryLabel, collectionTitle, params.q]);

  function navigate(next: RecipeDiscoveryParams) {
    router.push(buildRecipesUrl(next), { scroll: false });
  }

  function onSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim() || undefined;
    const nextParams = {
      ...params,
      q: nextQuery,
    };
    try {
      trackEvent("recipe_discovery_search", {
        ...(nextQuery ? { search_query: nextQuery } : {}),
        placement: DISCOVERY_PLACEMENT,
        source: DISCOVERY_PLACEMENT,
        category: params.category,
        sort: params.sort ?? "latest",
      });
    } catch {
      /* never block navigation */
    }
    navigate(nextParams);
  }

  function onCategorySelect(categoryId: string) {
    try {
      trackEvent("recipe_discovery_category_select", {
        category: categoryId,
        placement: DISCOVERY_PLACEMENT,
        source: DISCOVERY_PLACEMENT,
      });
    } catch {
      /* never block navigation */
    }
    navigate({
      ...params,
      category: categoryId === "all" ? undefined : categoryId,
      collection: undefined,
    });
  }

  function onSortChange(value: string) {
    try {
      trackEvent("recipe_discovery_sort_change", {
        sort: value,
        placement: DISCOVERY_PLACEMENT,
        source: DISCOVERY_PLACEMENT,
      });
    } catch {
      /* never block navigation */
    }
    navigate({
      ...params,
      sort: value === "latest" ? undefined : (value as RecipeDiscoveryParams["sort"]),
    });
  }

  function clearAllFilters() {
    setQuery("");
    navigate({});
  }

  const countLabel = `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`;

  return (
    <div>
      <form onSubmit={onSearchSubmit} className="max-w-2xl" key={params.q ?? "no-query"}>
        <label htmlFor="recipes-search" className="sr-only">
          Search recipes
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id="recipes-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search recipes, ingredients, or techniques..."
            className={`min-h-11 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-base text-ink outline-none placeholder:text-muted focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 sm:text-sm ${controlFocus}`}
          />
          <button
            type="submit"
            aria-label="Search recipes"
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-colors hover:bg-terracotta-dark ${controlFocus}`}
          >
            Search
          </button>
        </div>
      </form>

      <div className="mt-7">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Browse by category
        </p>
        <nav className="mt-3 max-w-3xl min-w-0" aria-label="Recipe category">
          <ul className="grid grid-cols-2 gap-x-6 text-sm font-semibold text-ink sm:grid-cols-3 md:grid-cols-4 md:gap-x-8">
            {DISCOVERY_CATEGORIES.map((category) => {
              const isSelected =
                category.id === "all"
                  ? !params.category && !params.collection
                  : activeCategory === category.id;
              const label = categoryControlLabel(category.id, category.label);
              return (
                <li key={category.id} className="min-w-0 border-t border-line">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onCategorySelect(category.id)}
                    className={`flex min-h-11 w-full max-w-full items-center py-2 transition-colors ${controlFocus} ${
                      isSelected
                        ? "border-b-2 border-terracotta font-semibold text-terracotta"
                        : "font-medium text-ink/75 hover:text-terracotta"
                    }`}
                  >
                    <span className="min-w-0 text-left">{label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="mt-7 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm text-muted" aria-live="polite" role="status">
            {contextParts.length > 0 ? (
              <>
                <span className="text-ink">{contextParts.join(" · ")}</span>
                <span aria-hidden> · </span>
                <span>{countLabel}</span>
              </>
            ) : (
              <span>{countLabel}</span>
            )}
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className={`mt-2 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor="recipes-sort" className="text-sm text-muted">
            Sort
          </label>
          <select
            id="recipes-sort"
            value={activeSort}
            onChange={(event) => onSortChange(event.target.value)}
            className={`min-h-11 rounded-full border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 ${controlFocus}`}
          >
            {DISCOVERY_SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {recipes.length ? (
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe, index) => (
            <RecipeGridCard
              key={recipe.slug}
              recipe={recipe}
              excerptLines={2}
              imageAspect="4/3"
              onNavigate={() => {
                try {
                  trackEvent("recipe_discovery_recipe_click", {
                    recipe_slug: recipe.slug,
                    recipe_position: index + 1,
                    placement: DISCOVERY_PLACEMENT,
                    source: DISCOVERY_PLACEMENT,
                    category: params.category || params.collection || "all",
                    search_query: params.q,
                    sort: params.sort ?? "latest",
                  });
                } catch {
                  /* never block navigation */
                }
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 max-w-md" role="status" aria-live="polite">
          <p className="font-serif text-2xl text-ink">No recipes found.</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Try another search or clear the current filters.
          </p>
          <button
            type="button"
            onClick={clearAllFilters}
            className={`mt-4 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
