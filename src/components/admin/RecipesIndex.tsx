"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
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

function normalizeStatus(status: string) {
  return status.toLowerCase();
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

  return (
    <div>
      <div className="mb-9 flex flex-col gap-5 md:mb-10 md:flex-row md:items-center md:justify-between md:gap-8 lg:gap-10">
        <div className="min-w-0 shrink-0">
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">Recipes</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Drafts stay off the public site until you publish.
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 md:w-auto">
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-end lg:flex-nowrap lg:gap-2">
            <label className="sr-only" htmlFor="recipe-search">
              Search recipes
            </label>
            <input
              id="recipe-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search recipes…"
              className={`${adminInputClass} w-full md:w-[15.625rem]`}
            />

            <div className="grid grid-cols-2 gap-2 md:contents">
              <label className="sr-only" htmlFor="recipe-type-filter">
                Filter by type
              </label>
              <select
                id="recipe-type-filter"
                value={typeId}
                onChange={(event) => setTypeId(event.target.value)}
                className={`${adminSelectClass} w-full md:w-[7.75rem]`}
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
                className={`${adminSelectClass} w-full md:w-[8.125rem]`}
              >
                <option value="all">All statuses</option>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>

            <NewRecipeButton types={types} className="w-full md:w-auto" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[42rem] table-fixed text-left text-sm">
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
                Actions
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
                    {formatAdminDateTime(recipe.updatedAt)}
                  </td>
                  <td className="px-4 py-3.5 pr-5 align-middle whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-4">
                      <Link
                        href={`/admin/recipes/${recipe.id}`}
                        className={`text-sm no-underline ${adminLinkClass} ${adminFocusRing}`}
                      >
                        Edit
                      </Link>
                      {published ? (
                        <Link
                          href={`/recipes/${recipe.slug}`}
                          className={`text-sm no-underline ${adminLinkClass} ${adminFocusRing}`}
                        >
                          View
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {recipes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center">
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
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-14 text-center">
                  <p className="text-sm text-muted">No recipes match these filters.</p>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={`mt-3 text-sm font-semibold text-terracotta transition-colors duration-150 hover:text-terracotta-dark ${adminFocusRing}`}
                    >
                      Clear filters
                    </button>
                  ) : null}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
