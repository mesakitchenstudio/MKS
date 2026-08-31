"use client";

import { useMemo, useState } from "react";
import type { Recipe } from "@/data/types";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import { RecipeOverview } from "@/components/RecipeOverview";
import { VideoTimestampLink } from "@/components/youtube/VideoTimestampLink";
import { trackEvent } from "@/lib/analytics";
import { scaleAmount } from "@/lib/culinary-format";
import { nutritionHasPublicContent } from "@/lib/field-content";
import { timestampForStep } from "@/lib/recipe-youtube";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";

export function RecipeCard({
  recipe,
  youtube = null,
  showOverview = true,
}: {
  recipe: Recipe;
  youtube?: ResolvedRecipeYoutube | null;
  showOverview?: boolean;
}) {
  const [servings, setServings] = useState(recipe.servings);
  const factor = servings / recipe.servings;

  const total = totalMinutes(recipe);
  const showNutrition = nutritionHasPublicContent(recipe.nutrition);
  const nutritionNote = useMemo(
    () =>
      `About ${recipe.nutrition.calories} calories per ${recipe.servingsUnit.replace(/s$/, "")}. Values are estimates.`,
    [recipe.nutrition.calories, recipe.servingsUnit],
  );

  const instructionGroups = recipe.instructions.filter(
    (group) => group.steps.some((step) => step.trim()),
  );

  return (
    <section
      id="recipe-card"
      className="scroll-mt-24 border border-line bg-paper p-5 shadow-[0_12px_40px_rgba(42,34,24,0.06)] md:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
            Recipe
          </p>
          <h2 className="mt-1 font-serif text-2xl text-ink md:text-3xl">{recipe.title}</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            trackEvent("recipe_print", {
              recipe_slug: recipe.slug,
              recipe_title: recipe.title,
            });
            window.print();
          }}
          className="no-print rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-terracotta hover:text-terracotta"
        >
          Print
        </button>
      </div>

      {showOverview ? <RecipeOverview recipe={recipe} /> : null}

      <dl className="mt-4 grid grid-cols-2 gap-4 border-b border-line pb-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.12em] text-muted">Total</dt>
          <dd className="mt-1 font-semibold">{formatTime(total)}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] uppercase tracking-[0.12em] text-muted">Yield</dt>
          <dd className="mt-1 flex items-center gap-2 font-semibold">
            <button
              type="button"
              aria-label="Decrease servings"
              onClick={() =>
                setServings((value) => {
                  const next = Math.max(1, value - 1);
                  trackEvent("recipe_servings_change", {
                    recipe_slug: recipe.slug,
                    recipe_title: recipe.title,
                    direction: "decrease",
                    servings: next,
                  });
                  return next;
                })
              }
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
              onClick={() =>
                setServings((value) => {
                  const next = value + 1;
                  trackEvent("recipe_servings_change", {
                    recipe_slug: recipe.slug,
                    recipe_title: recipe.title,
                    direction: "increase",
                    servings: next,
                  });
                  return next;
                })
              }
              className="no-print inline-flex h-7 w-7 items-center justify-center rounded-full border border-line"
            >
              +
            </button>
          </dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-start md:gap-10">
        <div className="md:sticky md:top-24 md:self-start">
          <h3 className="font-serif text-xl text-ink md:text-2xl">Ingredients</h3>
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
          <h3 className="font-serif text-xl text-ink md:text-2xl">Instructions</h3>
          {instructionGroups.map((group, groupIndex) => {
            const stepOffset = instructionGroups
              .slice(0, groupIndex)
              .reduce((sum, item) => sum + item.steps.length, 0);
            const namedGroup = Boolean(group.name?.trim());

            return (
              <div
                key={group.name ?? `steps-${groupIndex}`}
                className={
                  namedGroup
                    ? "mt-5 border border-line/80 bg-cream/20 p-4 md:p-5"
                    : "mt-4"
                }
              >
                {namedGroup ? (
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-line/70 pb-3">
                    <p className="font-serif text-lg text-ink">{group.name}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                      {group.steps.length} {group.steps.length === 1 ? "step" : "steps"}
                    </p>
                  </div>
                ) : null}
                <ol className={namedGroup ? "space-y-4" : "mt-4 space-y-4"}>
                  {group.steps.map((step, index) => {
                    const globalIndex = stepOffset + index;
                    const ts = youtube
                      ? timestampForStep(youtube.timestamps, globalIndex)
                      : undefined;
                    return (
                      <li key={`${globalIndex}-${step}`} className="flex gap-3 text-sm leading-7">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracotta text-xs font-semibold text-paper">
                          {globalIndex + 1}
                        </span>
                        <span>
                          {step}
                          {ts && youtube ? (
                            <VideoTimestampLink
                              label={ts.label}
                              time={ts.time}
                              videoId={youtube.videoId}
                              recipeSlug={recipe.slug}
                              recipeName={recipe.title}
                              videoTitle={youtube.title}
                            />
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
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

      {showNutrition ? (
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
      ) : null}
    </section>
  );
}
