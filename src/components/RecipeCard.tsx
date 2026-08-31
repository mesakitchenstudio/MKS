"use client";

import { useEffect, useMemo, useState } from "react";
import type { Recipe } from "@/data/types";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import { RecipeCookMode } from "@/components/RecipeCookMode";
import { VideoTimestampLink } from "@/components/youtube/VideoTimestampLink";
import { trackEvent } from "@/lib/analytics";
import { scaleAmount } from "@/lib/culinary-format";
import { nutritionHasPublicContent } from "@/lib/field-content";
import {
  recipeInstructionStages,
  totalInstructionSteps,
  type RecipeInstructionStage,
} from "@/lib/recipe-instructions";
import { timestampForStep } from "@/lib/recipe-youtube";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";

function StageAccordion({
  stage,
  stageIndex,
  open,
  onToggle,
  youtube,
  recipe,
}: {
  stage: RecipeInstructionStage;
  stageIndex: number;
  open: boolean;
  onToggle: () => void;
  youtube: ResolvedRecipeYoutube | null;
  recipe: Recipe;
}) {
  const panelId = `${stage.id}-panel`;
  const buttonId = `${stage.id}-button`;

  return (
    <div className="recipe-stage border-b border-line/80 py-1 last:border-b-0">
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="no-print flex w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="font-serif text-lg text-ink">{stage.name}</span>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          {open ? `${stage.steps.length} steps` : `Open · ${stage.steps.length} steps`}
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        className={`recipe-stage-panel ${open ? "block pb-4" : "hidden print:block"}`}
      >
        <ol className="space-y-3">
          {stage.steps.map((step) => {
            const ts = youtube ? timestampForStep(youtube.timestamps, step.globalIndex) : undefined;
            return (
              <li key={step.globalIndex} className="flex gap-3 text-sm leading-7">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-terracotta text-xs font-semibold text-paper">
                  {step.globalIndex + 1}
                </span>
                <span>
                  {step.text}
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
      {stageIndex === 0 ? null : null}
    </div>
  );
}

export function RecipeCookingWorkspace({
  recipe,
  youtube = null,
}: {
  recipe: Recipe;
  youtube?: ResolvedRecipeYoutube | null;
}) {
  const [servings, setServings] = useState(recipe.servings);
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const factor = servings / recipe.servings;
  const stages = useMemo(() => recipeInstructionStages(recipe), [recipe]);
  const stepCount = totalInstructionSteps(stages);
  const [openStages, setOpenStages] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(stages.map((stage, index) => [stage.id, index === 0])),
  );

  useEffect(() => {
    setOpenStages(Object.fromEntries(stages.map((stage, index) => [stage.id, index === 0])));
  }, [recipe.slug, stages]);

  const total = totalMinutes(recipe);
  const showNutrition = nutritionHasPublicContent(recipe.nutrition);
  const utensils = recipe.utensils?.filter(Boolean) ?? [];
  const multiStage = stages.length > 1;

  function expandAllStages() {
    setOpenStages(Object.fromEntries(stages.map((stage) => [stage.id, true])));
  }

  function toggleStage(id: string) {
    setOpenStages((current) => ({ ...current, [id]: !current[id] }));
  }

  function openCookMode() {
    trackEvent("recipe_cook_mode_start", {
      recipe_slug: recipe.slug,
      recipe_title: recipe.title,
    });
    setCookModeOpen(true);
  }

  return (
    <>
      <section
        id="recipe-cooking"
        className="recipe-cooking-workspace scroll-mt-24 bg-paper px-4 py-6 md:px-6 md:py-8"
      >
        <div className="mx-auto max-w-[75rem]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line/80 pb-4">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
                Cook this recipe
              </p>
              <h2 className="mt-1 font-serif text-2xl text-ink md:text-3xl">Ingredients & steps</h2>
              <p className="mt-1 text-sm text-muted">
                {stepCount} steps{multiStage ? ` · ${stages.length} stages` : ""} · {formatTime(total)} total
              </p>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              {multiStage ? (
                <button
                  type="button"
                  onClick={expandAllStages}
                  className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-muted hover:text-terracotta"
                >
                  Expand all
                </button>
              ) : null}
              <button
                type="button"
                onClick={openCookMode}
                className="rounded-full border border-olive px-4 py-2 text-sm font-semibold text-olive hover:bg-olive/5"
              >
                Cook mode
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
            <div className="recipe-ingredients-panel lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-2">
              <h3 className="font-serif text-xl text-ink">Ingredients</h3>
              <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
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
              </div>

              {recipe.ingredients.map((group) => (
                <div key={group.name ?? "main"} className="mt-4">
                  {group.name ? <p className="mb-2 text-sm font-semibold text-olive">{group.name}</p> : null}
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
                          {item.notes ? <span className="text-muted">, {item.notes}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {utensils.length ? (
                <div className="mt-5">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">Utensils</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {utensils.map((item) => (
                      <li key={item} className="rounded-full border border-line/80 px-2.5 py-1 text-xs text-ink">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div>
              <h3 className="font-serif text-xl text-ink">Instructions</h3>
              <div className="mt-3">
                {stages.map((stage, index) => (
                  <StageAccordion
                    key={stage.id}
                    stage={stage}
                    stageIndex={index}
                    open={Boolean(openStages[stage.id])}
                    onToggle={() => toggleStage(stage.id)}
                    youtube={youtube}
                    recipe={recipe}
                  />
                ))}
              </div>
            </div>
          </div>

          {recipe.notes.length ? (
            <div className="mt-8 border-t border-line/80 pt-5">
              <h3 className="font-serif text-lg text-ink">Notes</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted">
                {recipe.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {showNutrition ? (
            <div className="mt-6 border-t border-line/80 pt-4 text-sm text-muted">
              <p className="font-semibold text-ink">Nutrition (estimate)</p>
              <p className="mt-1">
                {recipe.nutrition.calories} kcal · {recipe.nutrition.carbs}g carbs · {recipe.nutrition.protein}g
                protein · {recipe.nutrition.fat}g fat
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {cookModeOpen ? (
        <RecipeCookMode
          recipe={recipe}
          stages={stages}
          servings={servings}
          factor={factor}
          onClose={() => setCookModeOpen(false)}
        />
      ) : null}
    </>
  );
}

/** @deprecated Use RecipeCookingWorkspace */
export function RecipeCard(props: Parameters<typeof RecipeCookingWorkspace>[0]) {
  return <RecipeCookingWorkspace {...props} />;
}
