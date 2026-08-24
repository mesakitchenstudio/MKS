"use client";

import { useMemo, useState } from "react";
import type { Recipe } from "@/data/types";
import { RecipeOverview } from "@/components/RecipeOverview";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";

function scaleAmount(amount: string, factor: number): string {
  if (factor === 1) return amount;
  return amount.replace(/(\d+\s*\/\s*\d+|\d+\.\d+|\d+)/g, (match) => {
    const value = match.includes("/")
      ? match.split("/").map(Number).reduce((n, d, i) => (i === 0 ? n : n / d))
      : Number(match);
    if (Number.isNaN(value)) return match;
    const scaled = value * factor;
    if (Number.isInteger(scaled)) return String(scaled);
    return String(Math.round(scaled * 100) / 100);
  });
}

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const [servings, setServings] = useState(recipe.servings);
  const factor = servings / recipe.servings;

  const total = totalMinutes(recipe);
  const nutritionNote = useMemo(
    () =>
      `About ${recipe.nutrition.calories} calories per ${recipe.servingsUnit.replace(/s$/, "")}. Values are estimates.`,
    [recipe.nutrition.calories, recipe.servingsUnit],
  );

  return (
    <section
      id="recipe-card"
      className="scroll-mt-24 border border-line bg-paper p-6 shadow-[0_12px_40px_rgba(42,34,24,0.06)] md:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">
            Recipe card
          </p>
          <h2 className="mt-1 font-serif text-3xl text-ink">{recipe.title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{recipe.excerpt}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-terracotta hover:text-terracotta"
        >
          Print
        </button>
      </div>

      <div className="-mx-6 mt-5 md:-mx-8">
        <RecipeOverview recipe={recipe} />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-b border-line pb-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-muted">Total</dt>
          <dd className="mt-1 font-semibold">{formatTime(total)}</dd>
        </div>
        <div>
          <dt className="text-[0.7rem] uppercase tracking-[0.14em] text-muted">Yield</dt>
          <dd className="mt-1 flex items-center gap-2 font-semibold">
            <button
              type="button"
              aria-label="Decrease servings"
              onClick={() => setServings((value) => Math.max(1, value - 1))}
              className="no-print inline-flex h-7 w-7 items-center justify-center rounded-full border border-line"
            >
              −
            </button>
            <span>
              {servings} {recipe.servingsUnit}
            </span>
            <button
              type="button"
              aria-label="Increase servings"
              onClick={() => setServings((value) => value + 1)}
              className="no-print inline-flex h-7 w-7 items-center justify-center rounded-full border border-line"
            >
              +
            </button>
          </dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
        <div>
          <h3 className="font-serif text-2xl">Ingredients</h3>
          {recipe.ingredients.map((group) => (
            <div key={group.name ?? "main"} className="mt-4">
              {group.name ? (
                <p className="mb-2 text-sm font-semibold text-olive">{group.name}</p>
              ) : null}
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.item} className="flex gap-3 text-sm leading-6">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" />
                    <span>
                      <strong className="font-semibold">
                        {scaleAmount(item.amount, factor)}
                        {item.grams ? ` (${Math.round(item.grams * factor)}g)` : ""}
                      </strong>{" "}
                      {item.item}
                      {item.notes ? (
                        <span className="text-muted">, {item.notes}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div>
          <h3 className="font-serif text-2xl">Instructions</h3>
          {recipe.instructions.map((group) => (
            <div key={group.name ?? "steps"} className="mt-4">
              {group.name ? (
                <p className="mb-2 text-sm font-semibold text-olive">{group.name}</p>
              ) : null}
              <ol className="space-y-4">
                {group.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-7">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracotta text-xs font-semibold text-paper">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>

      {recipe.notes.length ? (
        <div className="mt-8 border-t border-line pt-5">
          <h3 className="font-serif text-xl">Notes</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
            {recipe.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 border-t border-line pt-5 text-sm text-muted">
        <p className="font-semibold text-ink">Nutrition</p>
        <p className="mt-1">
          {recipe.nutrition.calories} kcal · {recipe.nutrition.carbs}g carbs ·{" "}
          {recipe.nutrition.protein}g protein · {recipe.nutrition.fat}g fat
          {recipe.nutrition.fiber ? ` · ${recipe.nutrition.fiber}g fiber` : ""}
          {recipe.nutrition.sugar ? ` · ${recipe.nutrition.sugar}g sugar` : ""}
        </p>
        <p className="mt-1 text-xs">{nutritionNote}</p>
      </div>
    </section>
  );
}
