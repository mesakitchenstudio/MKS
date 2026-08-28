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
import { formatAdminDateTime } from "@/lib/datetime";
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

const editActionClass = `text-sm font-semibold text-ink no-underline transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`;
const viewActionClass = `text-sm font-semibold text-muted no-underline transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`;

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
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${published ? "bg-olive" : "bg-terracotta/75"}`}
        aria-hidden
      />
      <span>{label}</span>
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
      <Link href={`/admin/recipes/${recipe.id}`} className={editActionClass}>
        Edit
      </Link>
      {published ? (
        <Link href={`/recipes/${recipe.slug}`} className={viewActionClass}>
          View
        </Link>
      ) : null}
    </div>
  );
}

function NoRecipesEmptyState({ types }: { types: RecipeTypeOption[] }) {
  return (
    <div className="border border-line bg-paper px-5 py-14 text-center">
      <p className="font-serif text-xl text-ink">No recipes yet.</p>
      <p className="mt-2 text-sm text-muted">
        Create your first recipe to start building the Mesa library.
      </p>
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
    <div className="border border-line bg-paper px-5 py-14 text-center">
      <p className="font-serif text-xl text-ink">No matching recipes</p>
      <p className="mt-2 text-sm text-muted">No recipes match the current search or filters.</p>
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
        <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">Recipes</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
          Drafts stay off the public site until you publish.
        </p>
        {counts.total > 0 ? (
          <p className="mt-2 text-sm text-muted">
            {counts.total} {counts.total === 1 ? "recipe" : "recipes"} · {counts.published}{" "}
            published · {counts.drafts} {counts.drafts === 1 ? "draft" : "drafts"}
          </p>
        ) : null}
      </header>

      {recipes.length > 0 ? (
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1">
            <div
              className="flex flex-col gap-2 rounded-sm border border-line bg-paper p-3 sm:flex-row sm:flex-wrap sm:items-center"
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
                className={`${adminInputClass} w-full sm:min-w-[14rem] sm:flex-1 sm:basis-[15.625rem]`}
              />

              <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
                <label className="sr-only" htmlFor="recipe-type-filter">
                  Filter by type
                </label>
                <select
                  id="recipe-type-filter"
                  value={typeId}
                  onChange={(event) => setTypeId(event.target.value)}
                  className={`${adminSelectClass} w-full sm:w-[7.75rem]`}
                >
                  <option value="">All types</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>

                <label className="sr-only" htmlFor="recipe-status-filter">
                  Filter by status
                </label>
                <select
                  id="recipe-status-filter"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as StatusFilter)}
                  className={`${adminSelectClass} w-full sm:w-[8.125rem]`}
                >
                  <option value="all">All statuses</option>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            {hasActiveFilters ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
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

          <NewRecipeButton types={types} className="w-full shrink-0 lg:w-auto" />
        </div>
      ) : null}

      {recipes.length === 0 ? (
        <NoRecipesEmptyState types={types} />
      ) : filtered.length === 0 ? (
        <NoResultsEmptyState onClearFilters={clearFilters} />
      ) : showResults ? (
        <>
          <div className="hidden border border-line bg-paper md:block">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[8%]" />
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
                      className="border-t border-line transition-colors duration-150 motion-reduce:transition-none hover:bg-cream/70"
                    >
                      <td className="px-4 py-3.5 align-middle">
                        <Link
                          href={`/admin/recipes/${recipe.id}`}
                          className={`block truncate font-semibold text-ink no-underline transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
                        >
                          {recipe.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-ink">{recipe.type.name}</td>
                      <td className="px-4 py-3.5 align-middle">
                        <RecipeStatus status={recipe.status} />
                      </td>
                      <td className="px-4 py-3.5 align-middle whitespace-nowrap text-sm text-muted">
                        <time dateTime={recipe.updatedAt}>{formatAdminDateTime(recipe.updatedAt)}</time>
                      </td>
                      <td className="px-4 py-3.5 pr-5 align-middle whitespace-nowrap text-right">
                        <RecipeActions recipe={recipe} published={published} className="justify-end" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {filtered.map((recipe) => {
              const published = normalizeStatus(recipe.status) === "published";
              return (
                <li key={recipe.id} className="border border-line bg-paper px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/recipes/${recipe.id}`}
                        className={`block break-words font-semibold text-ink no-underline transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
                      >
                        {recipe.title}
                      </Link>
                      <p className="mt-1 text-sm text-ink">{recipe.type.name}</p>
                    </div>
                    <RecipeActions recipe={recipe} published={published} className="shrink-0" />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
                    <RecipeStatus status={recipe.status} />
                    <span className="text-line" aria-hidden>
                      ·
                    </span>
                    <time className="text-sm text-muted" dateTime={recipe.updatedAt}>
                      Updated {formatAdminDateTime(recipe.updatedAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
