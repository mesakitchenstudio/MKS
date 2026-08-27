"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "@/components/RecipeGridCard";
import {
  DISCOVERY_CATEGORIES,
  DISCOVERY_SORTS,
  buildRecipesUrl,
  type RecipeDiscoveryParams,
} from "@/lib/recipe-discovery";

const controlFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const activeChipClass =
  "inline-flex items-center gap-1.5 rounded-sm border border-line bg-paper px-2.5 py-1 text-sm text-ink";

export function RecipeDiscovery({
  recipes,
  params,
  collectionTitles,
  categoryLabels = {},
}: {
  recipes: Recipe[];
  params: RecipeDiscoveryParams;
  collectionTitles: Record<string, string>;
  categoryLabels?: Record<string, string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(params.q ?? "");
  const activeCategory = params.category ?? "all";
  const activeSort = params.sort ?? "latest";
  const collectionTitle = params.collection ? collectionTitles[params.collection] : undefined;
  const categoryLabel = params.category
    ? categoryLabels[params.category] ||
      DISCOVERY_CATEGORIES.find((item) => item.id === params.category)?.label ||
      params.category
    : undefined;

  useEffect(() => {
    setQuery(params.q ?? "");
  }, [params.q]);

  const contentConstraints = useMemo(() => {
    let count = 0;
    if (params.category || params.collection) count += 1;
    if (params.q) count += 1;
    return count;
  }, [params.category, params.collection, params.q]);

  const showContext = Boolean(categoryLabel || collectionTitle || params.q);

  function navigate(next: RecipeDiscoveryParams) {
    router.push(buildRecipesUrl(next), { scroll: false });
  }

  function onSearchSubmit(event: FormEvent) {
    event.preventDefault();
    navigate({
      ...params,
      q: query.trim() || undefined,
    });
  }

  function onCategorySelect(categoryId: string) {
    // Same category dimension as Browse by category — replace, do not intersect.
    navigate({
      ...params,
      category: categoryId === "all" ? undefined : categoryId,
      collection: undefined,
    });
  }

  function onSortChange(value: string) {
    navigate({
      ...params,
      sort: value === "latest" ? undefined : (value as RecipeDiscoveryParams["sort"]),
    });
  }

  function clearCategory() {
    navigate({
      ...params,
      category: undefined,
      collection: undefined,
    });
  }

  function clearSearch() {
    setQuery("");
    navigate({
      ...params,
      q: undefined,
    });
  }

  function clearAllContentFilters() {
    setQuery("");
    navigate({
      sort: params.sort,
    });
  }

  return (
    <div>
      <form onSubmit={onSearchSubmit} className="mt-5 max-w-xl">
        <label htmlFor="recipes-search" className="sr-only">
          Search recipes
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id="recipes-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, ingredient, category, or tag"
            className={`h-10 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-sm text-ink outline-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 ${controlFocus}`}
          />
          <button
            type="submit"
            className={`inline-flex h-10 shrink-0 items-center rounded-full bg-ink px-4 text-sm font-semibold text-cream transition-colors hover:bg-ink/90 ${controlFocus}`}
          >
            Search
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label="Refine by course"
        >
          {DISCOVERY_CATEGORIES.map((category) => {
            const isChipSelected =
              category.id === "all" ? !params.category && !params.collection : activeCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={isChipSelected}
                onClick={() => onCategorySelect(category.id)}
                className={`shrink-0 rounded-full px-3 py-1 text-sm transition-colors ${controlFocus} ${
                  isChipSelected
                    ? "border border-olive/50 bg-sand text-ink"
                    : "border border-transparent text-muted hover:border-line hover:bg-paper hover:text-ink"
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
          <label htmlFor="recipes-sort" className="text-sm text-muted">
            Sort
          </label>
          <select
            id="recipes-sort"
            value={activeSort}
            onChange={(event) => onSortChange(event.target.value)}
            className={`h-8 rounded-full border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-olive focus:ring-2 focus:ring-olive/15 ${controlFocus}`}
          >
            {DISCOVERY_SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showContext ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-sm text-muted">
          {categoryLabel || collectionTitle ? (
            <>
              <span>{collectionTitle ? "Showing" : "Browsing"}</span>
              <span className={activeChipClass}>
                <span className="font-medium text-ink">
                  {collectionTitle || categoryLabel}
                </span>
                <button
                  type="button"
                  onClick={clearCategory}
                  aria-label={
                    collectionTitle
                      ? `Remove ${collectionTitle} collection filter`
                      : `Remove ${categoryLabel} category filter`
                  }
                  className={`-mr-0.5 inline-flex h-5 w-5 items-center justify-center rounded-sm text-base leading-none text-terracotta transition-colors hover:text-terracotta-dark ${controlFocus}`}
                >
                  ×
                </button>
              </span>
            </>
          ) : null}

          {params.q ? (
            <>
              {categoryLabel || collectionTitle ? <span aria-hidden>·</span> : null}
              <span>
                Search: <span className="text-ink">“{params.q}”</span>
              </span>
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-base leading-none text-terracotta transition-colors hover:text-terracotta-dark ${controlFocus}`}
              >
                ×
              </button>
            </>
          ) : null}

          {contentConstraints > 1 ? (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={clearAllContentFilters}
                className={`font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
              >
                Clear all
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
        {params.q && !showContext ? ` matching “${params.q}”` : ""}
      </p>

      {recipes.length ? (
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recipes.map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      ) : (
        <div className="mt-10 max-w-md">
          <p className="font-serif text-2xl text-ink">No recipes found.</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            Try another search or clear the current filters.
          </p>
          {contentConstraints > 0 ? (
            <button
              type="button"
              onClick={clearAllContentFilters}
              className={`mt-4 text-sm font-semibold text-terracotta hover:text-terracotta-dark ${controlFocus}`}
            >
              {contentConstraints > 1 ? "Clear all" : "Clear filters"}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
