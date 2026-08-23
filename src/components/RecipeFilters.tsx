"use client";

import { useMemo, useState } from "react";
import { categories } from "@/data/categories";
import type { Recipe } from "@/data/types";
import { RecipeGridCard } from "./RecipeGridCard";

const filters = [
  { id: "all", label: "All" },
  { id: "desserts", label: "Desserts" },
  { id: "breakfast", label: "Breakfast" },
  { id: "main-dishes", label: "Mains" },
  { id: "breads", label: "Breads" },
  { id: "drinks", label: "Drinks" },
  { id: "oven", label: "Oven" },
  { id: "stovetop", label: "Stovetop" },
];

export function RecipeFilters({ recipes }: { recipes: Recipe[] }) {
  const [active, setActive] = useState("all");
  const visible = useMemo(() => {
    if (active === "all") return recipes;
    return recipes.filter((recipe) => recipe.categories.includes(active));
  }, [active, recipes]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActive(filter.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              active === filter.id
                ? "bg-ink text-cream"
                : "border border-line bg-paper text-ink/80 hover:border-terracotta"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        {visible.length} {visible.length === 1 ? "recipe" : "recipes"}
        {active !== "all"
          ? ` in ${categories.find((category) => category.slug === active)?.name ?? active}`
          : ""}
      </p>
      {visible.length ? (
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((recipe) => (
            <RecipeGridCard key={recipe.slug} recipe={recipe} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-muted">No recipes in this collection yet.</p>
      )}
    </div>
  );
}
