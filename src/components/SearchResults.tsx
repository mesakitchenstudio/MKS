"use client";

import { useMemo, useState } from "react";
import type { Recipe } from "@/data/types";
import { searchRecipes } from "@/lib/recipes";
import { RecipeGridCard } from "./RecipeGridCard";

export function SearchResults({
  initialQuery,
  recipes,
}: {
  initialQuery: string;
  recipes: Recipe[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const results = useMemo(
    () => (query.trim() ? searchRecipes(query) : recipes),
    [query, recipes],
  );

  return (
    <div>
      <label className="grid gap-2">
        <span className="text-sm font-semibold">Search</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try peach, chicken, lemon, focaccia…"
          className="max-w-xl rounded-full border border-line bg-paper px-5 py-3 text-base outline-none focus:border-terracotta"
        />
      </label>
      <p className="mt-6 text-sm text-muted">
        {results.length} {results.length === 1 ? "recipe" : "recipes"}
        {query.trim() ? ` for “${query.trim()}”` : ""}
      </p>
      {results.length ? (
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      ) : (
        <p className="mt-10 max-w-md text-muted">
          Nothing matched that search. Try a dish name, an ingredient, or a category like
          cookies or dinner.
        </p>
      )}
    </div>
  );
}
