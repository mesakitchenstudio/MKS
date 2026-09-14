"use client";

import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import { trackEvent } from "@/lib/analytics";
import { homepageCollectionSlugMap } from "@/data/homepage";
import {
  DISCOVERY_CATEGORIES,
  DISCOVERY_SORTS,
  DISCOVERY_TIME_OPTIONS,
  applyDiscoveryFilters,
  buildDiscoveryAppliedChips,
  buildDiscoverySuggestions,
  buildRecipesUrl,
  getIngredientFilterSelection,
  hasActiveDiscoveryFilters,
  listDiscoveryCuisines,
  listDiscoveryMethods,
  type DiscoverySuggestion,
  type RecipeDiscoveryParams,
} from "@/lib/recipe-discovery";
import {
  hasActiveIngredientFilter,
  recipeMatchesIngredientMembership,
  type PublicIngredientOption,
} from "@/lib/ingredient-discovery";
import { emitRecipeSearchAnalytics } from "@/lib/search-analytics-client";
import { DiscoveryIngredientFilters } from "@/components/DiscoveryIngredientFilters";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const DISCOVERY_PLACEMENT = "recipes_catalog";

function categoryControlLabel(id: string, label: string) {
  return id === "all" ? "All recipes" : label;
}

function mergeParams(
  current: RecipeDiscoveryParams,
  patch: Partial<RecipeDiscoveryParams>,
): RecipeDiscoveryParams {
  const next: RecipeDiscoveryParams = { ...current, ...patch };
  for (const key of Object.keys(patch) as (keyof RecipeDiscoveryParams)[]) {
    const value = patch[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete next[key];
    }
  }
  return next;
}

export function RecipeDiscovery({
  recipes,
  allRecipes,
  params,
  collectionTitles,
  ingredientDiscoveryEnabled = false,
  cookWithWhatYouHaveEnabled = false,
  ingredientOptions = [],
  ingredientNames = {},
  ingredientMembership = {},
}: {
  recipes: Recipe[];
  /** Full published catalogue for autocomplete + facet option lists. */
  allRecipes: Recipe[];
  params: RecipeDiscoveryParams;
  collectionTitles: Record<string, string>;
  ingredientDiscoveryEnabled?: boolean;
  /** Dual gate: ingredient discovery + CWYW. */
  cookWithWhatYouHaveEnabled?: boolean;
  ingredientOptions?: PublicIngredientOption[];
  ingredientNames?: Record<string, string>;
  /** recipe id → ingredient slugs for client-side dead-end recomputation */
  ingredientMembership?: Record<string, string[]>;
}) {
  const router = useRouter();
  const committedQuery = params.q ?? "";
  const [query, setQuery] = useState(committedQuery);
  const [querySource, setQuerySource] = useState(committedQuery);
  if (querySource !== committedQuery) {
    setQuerySource(committedQuery);
    setQuery(committedQuery);
  }
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const activeCategory = params.category ?? "all";
  const activeSort = params.sort ?? "latest";
  const hasFilters = hasActiveDiscoveryFilters(params);

  const cuisineOptions = useMemo(() => listDiscoveryCuisines(allRecipes), [allRecipes]);
  const methodOptions = useMemo(() => listDiscoveryMethods(allRecipes), [allRecipes]);
  const appliedChips = useMemo(
    () => buildDiscoveryAppliedChips(params, collectionTitles, ingredientNames),
    [collectionTitles, ingredientNames, params],
  );

  const suggestions = useMemo(
    () =>
      buildDiscoverySuggestions({
        query,
        recipes: allRecipes,
        limit: 8,
      }),
    [allRecipes, query],
  );

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
        setActiveSuggestion(-1);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  function navigate(next: RecipeDiscoveryParams) {
    router.push(buildRecipesUrl(next), { scroll: false });
  }

  function discoveryFiltersPayload(next: RecipeDiscoveryParams) {
    const ingredient = getIngredientFilterSelection(next);
    return {
      category: next.category,
      collection: next.collection,
      time: next.time,
      cuisine: next.cuisine,
      method: next.method,
      video: next.video ? true : undefined,
      sort: next.sort,
      ingredients: ingredient.includeSlugs.length
        ? ingredient.includeSlugs.join(",")
        : undefined,
      ingredientMode:
        ingredient.includeSlugs.length > 1 ? ingredient.mode : undefined,
      excludeIngredients: ingredient.excludeSlugs.length
        ? ingredient.excludeSlugs.join(",")
        : undefined,
    };
  }

  function applyClientDiscovery(next: RecipeDiscoveryParams) {
    let filtered = applyDiscoveryFilters(allRecipes, next, homepageCollectionSlugMap());
    const selection = getIngredientFilterSelection(next);
    if (ingredientDiscoveryEnabled && hasActiveIngredientFilter(selection)) {
      filtered = filtered.filter((recipe) => {
        const key = recipe.id?.trim() || recipe.slug;
        return recipeMatchesIngredientMembership(ingredientMembership[key], selection);
      });
    }
    return filtered;
  }

  function emitFilterDeadEndIfNeeded(next: RecipeDiscoveryParams) {
    try {
      const filtered = applyClientDiscovery(next);
      if (filtered.length > 0) return;
      const hasSignal = hasActiveDiscoveryFilters(next);
      if (!hasSignal) return;
      emitRecipeSearchAnalytics({
        searchQuery: next.q ?? "",
        resultCount: 0,
        placement: "recipes_catalog",
        filters: discoveryFiltersPayload(next),
      });
    } catch {
      /* never block navigation */
    }
  }

  function navigateDiscovery(next: RecipeDiscoveryParams) {
    emitFilterDeadEndIfNeeded(next);
    navigate(next);
  }

  function onSearchSubmit(event: FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim() || undefined;
    const nextParams = mergeParams(params, { q: nextQuery });
    try {
      trackEvent("recipe_discovery_search", {
        ...(nextQuery ? { search_query: nextQuery } : {}),
        placement: DISCOVERY_PLACEMENT,
        source: DISCOVERY_PLACEMENT,
        category: params.category,
        sort: params.sort ?? "latest",
      });
      const filtered = applyClientDiscovery(nextParams);
      emitRecipeSearchAnalytics({
        searchQuery: nextQuery ?? "",
        resultCount: filtered.length,
        placement: "recipes_catalog",
        filters: discoveryFiltersPayload(nextParams),
      });
    } catch {
      /* never block navigation */
    }
    setSuggestionsOpen(false);
    navigate(nextParams);
  }

  function applySuggestion(suggestion: DiscoverySuggestion) {
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    if (suggestion.kind === "recipe") {
      router.push(`/recipes/${suggestion.slug}`);
      return;
    }
    if (suggestion.kind === "category") {
      navigateDiscovery(
        mergeParams(params, {
          category: suggestion.id,
          collection: undefined,
          q: undefined,
        }),
      );
      setQuery("");
      return;
    }
    navigateDiscovery(mergeParams(params, { cuisine: suggestion.label, q: undefined }));
    setQuery("");
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
    navigateDiscovery(
      mergeParams(params, {
        category: categoryId === "all" ? undefined : categoryId,
        collection: undefined,
      }),
    );
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
    navigate(
      mergeParams(params, {
        sort: value === "latest" ? undefined : (value as RecipeDiscoveryParams["sort"]),
      }),
    );
  }

  function clearAllFilters() {
    setQuery("");
    navigate({});
  }

  const countLabel = `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`;
  const showSuggestions = suggestionsOpen && suggestions.length > 0;

  return (
    <div>
      <form onSubmit={onSearchSubmit} className="max-w-2xl">
        <label htmlFor="recipes-search" className="sr-only">
          Search recipes
        </label>
        <div ref={searchWrapRef} className="relative">
          <div className="flex items-stretch gap-2">
            <input
              id="recipes-search"
              type="search"
              value={query}
              autoComplete="off"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded={showSuggestions}
              role="combobox"
              onChange={(event) => {
                setQuery(event.target.value);
                setSuggestionsOpen(true);
                setActiveSuggestion(-1);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onKeyDown={(event) => {
                if (!showSuggestions) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSuggestion((current) =>
                    Math.min(suggestions.length - 1, current + 1),
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSuggestion((current) => Math.max(-1, current - 1));
                } else if (event.key === "Enter" && activeSuggestion >= 0) {
                  event.preventDefault();
                  const selected = suggestions[activeSuggestion];
                  if (selected) applySuggestion(selected);
                } else if (event.key === "Escape") {
                  setSuggestionsOpen(false);
                  setActiveSuggestion(-1);
                }
              }}
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
          {showSuggestions ? (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-sm border border-line bg-paper py-2 shadow-sm"
            >
              {suggestions.map((suggestion, index) => {
                const selected = index === activeSuggestion;
                const key =
                  suggestion.kind === "recipe"
                    ? `recipe:${suggestion.slug}`
                    : `${suggestion.kind}:${suggestion.id}`;
                const label =
                  suggestion.kind === "recipe"
                    ? suggestion.title
                    : suggestion.kind === "category"
                      ? `Category · ${suggestion.label}`
                      : `Cuisine · ${suggestion.label}`;
                return (
                  <li key={key} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={`flex w-full px-4 py-2.5 text-left text-sm ${
                        selected ? "bg-cream/80 text-ink" : "text-ink/90 hover:bg-cream/50"
                      } ${controlFocus}`}
                      onMouseEnter={() => setActiveSuggestion(index)}
                      onClick={() => applySuggestion(suggestion)}
                    >
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
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

      <div className="mt-7 border-t border-line pt-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Refine
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Time</span>
            <select
              value={params.time ?? ""}
              onChange={(event) =>
                navigateDiscovery(
                  mergeParams(params, {
                    time: (event.target.value || undefined) as RecipeDiscoveryParams["time"],
                  }),
                )
              }
              className={`min-h-11 min-w-[10rem] rounded-full border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 ${controlFocus}`}
            >
              <option value="">Any time</option>
              {DISCOVERY_TIME_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {cuisineOptions.length > 1 ? (
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Cuisine</span>
              <select
                value={params.cuisine ?? ""}
                onChange={(event) =>
                  navigateDiscovery(
                    mergeParams(params, {
                      cuisine: event.target.value || undefined,
                    }),
                  )
                }
                className={`min-h-11 min-w-[10rem] rounded-full border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 ${controlFocus}`}
              >
                <option value="">Any cuisine</option>
                {cuisineOptions.map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {methodOptions.length > 1 ? (
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Method</span>
              <select
                value={params.method ?? ""}
                onChange={(event) =>
                  navigateDiscovery(
                    mergeParams(params, {
                      method: event.target.value || undefined,
                    }),
                  )
                }
                className={`min-h-11 min-w-[10rem] rounded-full border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 ${controlFocus}`}
              >
                <option value="">Any method</option>
                {methodOptions.map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="grid gap-1 text-sm">
            <span className="text-muted">Video</span>
            <select
              value={params.video ? "1" : ""}
              onChange={(event) =>
                navigateDiscovery(
                  mergeParams(params, {
                    video: event.target.value === "1" ? true : undefined,
                  }),
                )
              }
              className={`min-h-11 min-w-[10rem] rounded-full border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/15 ${controlFocus}`}
            >
              <option value="">Any</option>
              <option value="1">Has video</option>
            </select>
          </label>
        </div>

        {ingredientDiscoveryEnabled ? (
          <DiscoveryIngredientFilters
            params={params}
            options={ingredientOptions}
            onChange={(next) => navigateDiscovery(next)}
          />
        ) : null}

        {cookWithWhatYouHaveEnabled ? (
          <p className="mt-4 text-sm">
            <a
              href="/cook-with-what-you-have"
              className={`font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
            >
              Cook with what you have →
            </a>
          </p>
        ) : null}
      </div>

      {appliedChips.length ? (
        <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Applied filters">
          {appliedChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => navigate(mergeParams(params, chip.clear))}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-cream/50 px-3 text-sm text-ink hover:border-terracotta hover:text-terracotta ${controlFocus}`}
            >
              <span>{chip.label}</span>
              <span aria-hidden className="text-muted">
                ×
              </span>
              <span className="sr-only">Remove {chip.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-7 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm text-muted" aria-live="polite" role="status">
            <span>{countLabel}</span>
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
            {getIngredientFilterSelection(params).includeSlugs.length ||
            getIngredientFilterSelection(params).excludeSlugs.length
              ? "No recipes match these ingredient filters. Try removing an ingredient or switching from All to Any."
              : "Try another search or clear the current filters."}
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className={`mt-4 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
