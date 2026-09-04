"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
  adminSelectClass,
  adminTableHeadClass,
} from "@/lib/admin-ui";
import { formatAdminDateTimeUtc } from "@/lib/datetime";
import { NewRecipeButton } from "./NewRecipeButton";

export type AdminRecipeRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
  type: { id: string; name: string };
};

type RecipeTypeOption = {
  id: string;
  name: string;
};

type StatusFilter = "all" | "published" | "draft";

const editActionClass = `inline-flex min-h-[44px] items-center text-sm font-semibold text-ink no-underline transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`;
const viewActionClass = `inline-flex min-h-[44px] items-center text-sm font-normal text-muted no-underline transition-colors duration-150 hover:text-olive ${adminFocusRing}`;
const titleLinkClass = `block font-semibold text-ink no-underline transition-colors duration-150 hover:text-terracotta hover:underline decoration-terracotta/40 underline-offset-2 ${adminFocusRing}`;

function normalizeStatus(status: string) {
  return status.toLowerCase();
}

function recipeCounts(recipes: AdminRecipeRow[]) {
  const total = recipes.length;
  const published = recipes.filter((recipe) => normalizeStatus(recipe.status) === "published").length;
  return { total, published, drafts: total - published };
}

function RecipeStatus({ status }: { status: string }) {
  const published = normalizeStatus(status) === "published";
  const label = published ? "Published" : "Draft";

  return (
    <span className={`text-sm ${published ? "text-olive" : "font-medium text-terracotta"}`}>
      {label}
    </span>
  );
}

function RecipeActions({
  recipe,
  published,
  className = "",
}: {
  recipe: AdminRecipeRow;
  published: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Link
        href={`/admin/recipes/${recipe.id}`}
        className={editActionClass}
        aria-label={`Edit ${recipe.title}`}
      >
        Edit
      </Link>
      {published ? (
        <Link
          href={`/recipes/${recipe.slug}`}
          className={viewActionClass}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${recipe.title} on public site (opens in new tab)`}
        >
          View ↗
        </Link>
      ) : null}
    </div>
  );
}

function NoRecipesEmptyState({ types }: { types: RecipeTypeOption[] }) {
  return (
    <div className="border-y border-line py-14 text-center">
      <p className="font-serif text-xl text-ink">No recipes yet.</p>
      <div className="mt-6 flex justify-center">
        {types.length > 0 ? (
          <NewRecipeButton types={types} />
        ) : (
          <Link href="/admin/types" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Create a type
          </Link>
        )}
      </div>
    </div>
  );
}

function NoResultsEmptyState({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="border-y border-line py-14 text-center">
      <p className="font-serif text-xl text-ink">No recipes match these filters.</p>
      <button
        type="button"
        onClick={onClearFilters}
        className={`mt-4 text-sm font-semibold text-terracotta transition-colors duration-150 hover:text-terracotta-dark ${adminFocusRing}`}
      >
        Clear filters
      </button>
    </div>
  );
}

export function RecipesIndex({
  recipes,
  types,
}: {
  recipes: AdminRecipeRow[];
  types: RecipeTypeOption[];
}) {
  const [query, setQuery] = useState("");
  const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const hasActiveFilters = query.trim().length > 0 || typeId !== "" || status !== "all";
  const counts = useMemo(() => recipeCounts(recipes), [recipes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((recipe) => {
      if (typeId && recipe.type.id !== typeId) return false;
      if (status !== "all" && normalizeStatus(recipe.status) !== status) return false;
      if (q && !recipe.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, recipes, status, typeId]);

  function clearFilters() {
    setQuery("");
    setTypeId("");
    setStatus("all");
  }

  const showResults = recipes.length > 0 && filtered.length > 0;

  return (
    <div>
      <header className="mb-8 md:mb-9">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
              Recipes
            </h1>
            {counts.total > 0 ? (
              <p className="mt-2 text-sm text-muted">
                {counts.total} {counts.total === 1 ? "recipe" : "recipes"} · {counts.published}{" "}
                published · {counts.drafts} {counts.drafts === 1 ? "draft" : "drafts"}
              </p>
            ) : null}
          </div>
          <NewRecipeButton types={types} className="shrink-0" />
        </div>
      </header>

      {recipes.length > 0 ? (
        <div className="mb-5 space-y-2">
          <div
            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2"
            role="search"
          >
            <label className="sr-only" htmlFor="recipe-search">
              Search recipes
            </label>
            <input
              id="recipe-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipes…"
              className={`${adminInputClass} w-full sm:w-[20rem] sm:max-w-[22.5rem]`}
            />

            <label className="sr-only" htmlFor="recipe-type-filter">
              Filter by type
            </label>
            <select
              id="recipe-type-filter"
              value={typeId}
              onChange={(event) => setTypeId(event.target.value)}
              className={`${adminSelectClass} w-full sm:w-[8rem]`}
            >
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <div
              className="flex flex-wrap items-center gap-x-0.5 gap-y-1 text-xs"
              role="group"
              aria-label="Filter by status"
            >
              {(
                [
                  ["all", "All"],
                  ["published", "Published"],
                  ["draft", "Draft"],
                ] as const
              ).map(([value, label]) => {
                const selected = status === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    className={`min-h-[44px] rounded-sm px-2.5 py-1.5 font-semibold transition-colors ${
                      selected ? "bg-sand text-ink" : "text-muted hover:text-ink"
                    } ${adminFocusRing}`}
                    onClick={() => setStatus(value)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {hasActiveFilters ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span>
                Showing {filtered.length} of {recipes.length}{" "}
                {recipes.length === 1 ? "recipe" : "recipes"}
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className={`font-semibold text-terracotta transition-colors duration-150 hover:text-terracotta-dark ${adminFocusRing}`}
              >
                Clear filters
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {recipes.length === 0 ? (
        <NoRecipesEmptyState types={types} />
      ) : filtered.length === 0 ? (
        <NoResultsEmptyState onClearFilters={clearFilters} />
      ) : showResults ? (
        <>
          {/*
            Table only at xl+: sidebar appears at lg (15rem), leaving too little
            content width for Updated + Actions until ~1280px viewport.
          */}
          <div className="hidden xl:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className={adminTableHeadClass}>
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Title
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Updated
                  </th>
                  <th scope="col" className="px-4 py-3 pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((recipe) => {
                  const published = normalizeStatus(recipe.status) === "published";
                  return (
                    <tr
                      key={recipe.id}
                      className="border-t border-line/70 transition-colors duration-150 motion-reduce:transition-none hover:bg-cream/50"
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <Link
                          href={`/admin/recipes/${recipe.id}`}
                          className={`${titleLinkClass} line-clamp-2`}
                        >
                          {recipe.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-ink">{recipe.type.name}</td>
                      <td className="px-4 py-3.5 align-middle">
                        <RecipeStatus status={recipe.status} />
                      </td>
                      <td className="px-4 py-3.5 align-middle whitespace-nowrap text-sm text-muted">
                        <time dateTime={recipe.updatedAt}>
                          {formatAdminDateTimeUtc(recipe.updatedAt)}
                        </time>
                      </td>
                      <td className="px-4 py-3.5 pr-5 align-middle whitespace-nowrap text-right">
                        <RecipeActions recipe={recipe} published={published} className="justify-end" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">Times in GMT</p>
          </div>

          <ul className="divide-y divide-line/70 border-y border-line/70 xl:hidden">
            {filtered.map((recipe) => {
              const published = normalizeStatus(recipe.status) === "published";
              return (
                <li key={recipe.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/recipes/${recipe.id}`}
                      className={`${titleLinkClass} min-w-0 flex-1 line-clamp-2`}
                    >
                      {recipe.title}
                    </Link>
                    <RecipeStatus status={recipe.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {recipe.type.name} ·{" "}
                    <time dateTime={recipe.updatedAt}>
                      {formatAdminDateTimeUtc(recipe.updatedAt)}
                    </time>
                  </p>
                  <RecipeActions recipe={recipe} published={published} className="mt-0.5" />
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted xl:hidden">Times in GMT</p>
        </>
      ) : null}
    </div>
  );
}
