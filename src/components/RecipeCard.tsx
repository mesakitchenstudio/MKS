"use client";

import { useEffect, useMemo, useState } from "react";
import type { Recipe } from "@/data/types";
import type { ResolvedRecipeYoutube } from "@/data/youtube-types";
import { VideoTimestampLink } from "@/components/youtube/VideoTimestampLink";
import { recipeContentShellClass } from "@/components/RecipeContentShell";
import { scaleAmount } from "@/lib/culinary-format";
import { nutritionHasPublicContent } from "@/lib/field-content";
import { planCookingContext } from "@/lib/recipe-cooking-context";
import {
  recipeInstructionStages,
  totalInstructionSteps,
  type RecipeInstructionStage,
} from "@/lib/recipe-instructions";
import { selectStageVideoHelp, type StageVideoHelp } from "@/lib/recipe-stage-video-help";
import { timestampForStep } from "@/lib/recipe-youtube";
import { formatTime, totalMinutes } from "@/lib/recipe-utils";
import { trackVideoEvent } from "@/lib/video-analytics";
import { useRecipeVideoOptional } from "@/components/youtube/RecipeVideoContext";

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StudioTipCallout({ tip }: { tip: string }) {
  return (
    <aside className="mt-3 border-l-2 border-olive/50 bg-sand/25 py-2 pl-3 pr-2">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Studio tip</p>
      <p className="mt-1 text-sm leading-6 text-ink/90">{tip}</p>
    </aside>
  );
}

function StageVideoHelpLink({
  help,
  stageName,
  youtube,
  recipe,
}: {
  help: StageVideoHelp;
  stageName: string;
  youtube: ResolvedRecipeYoutube;
  recipe: Recipe;
}) {
  const ctx = useRecipeVideoOptional();

  return (
    <button
      type="button"
      className="no-print mt-3 text-left text-sm font-semibold text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      aria-label={`${help.linkLabel} for ${stageName}`}
      onClick={() => {
        trackVideoEvent("recipe_video_step_click", {
          recipeSlug: recipe.slug,
          recipeName: recipe.title,
          videoId: youtube.videoId,
          videoTitle: youtube.title,
          source: "stage_video_help",
          timestamp: help.time,
          chapterLabel: help.chapterLabel,
          stageName,
        });
        if (ctx) {
          ctx.expandWatchMethod({
            start: help.time,
            source: "stage_video_help",
            scroll: false,
          });
          return;
        }
        window.open(
          `https://www.youtube.com/watch?v=${youtube.videoId}&t=${Math.floor(help.time)}s`,
          "_blank",
          "noopener,noreferrer",
        );
      }}
    >
      {help.linkLabel}
    </button>
  );
}

function StageAccordion({
  stage,
  open,
  onToggle,
  youtube,
  recipe,
  tips,
  videoHelp,
}: {
  stage: RecipeInstructionStage;
  open: boolean;
  onToggle: () => void;
  youtube: ResolvedRecipeYoutube | null;
  recipe: Recipe;
  tips: string[];
  videoHelp?: StageVideoHelp;
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
        className="no-print flex w-full items-center justify-between gap-3 rounded-sm py-3 text-left transition-colors hover:bg-cream/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        <span className="min-w-0 font-serif text-lg text-ink">{stage.name}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-muted">
          <span className="whitespace-nowrap">{stage.steps.length} steps</span>
          <ChevronDown open={open} />
        </span>
      </button>
      <h3 className="recipe-print-stage-title mb-2 hidden font-serif text-base text-ink print:block">
        {stage.name}
      </h3>
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
              <li key={step.globalIndex} className="recipe-print-step flex gap-3 text-sm leading-7">
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
        {tips.map((tip) => (
          <StudioTipCallout key={tip} tip={tip} />
        ))}
        {videoHelp && youtube ? (
          <StageVideoHelpLink
            help={videoHelp}
            stageName={stage.name}
            youtube={youtube}
            recipe={recipe}
          />
        ) : null}
      </div>
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
  const factor = servings / recipe.servings;
  const stages = useMemo(() => recipeInstructionStages(recipe), [recipe]);
  const stepCount = totalInstructionSteps(stages);
  const cookingContext = useMemo(() => planCookingContext(recipe, stages), [recipe, stages]);
  const stageVideoHelp = useMemo(
    () => selectStageVideoHelp(stages, youtube?.timestamps),
    [stages, youtube?.timestamps],
  );
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

  return (
    <section
      id="recipe-cooking"
      className="recipe-cooking-workspace scroll-mt-28 bg-paper py-6 md:py-7"
    >
      <div className={recipeContentShellClass}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line/80 pb-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-olive">
              Cook this recipe
            </p>
            <h2 className="mt-1 font-serif text-2xl text-ink md:text-3xl">Ingredients & steps</h2>
            <p className="mt-1 text-sm text-muted">
              {stepCount} steps{multiStage ? ` · ${stages.length} stages` : ""} · {formatTime(total)}{" "}
              total
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
          </div>
        </div>

        {cookingContext.beforeYouStart.length ? (
          <aside className="recipe-notes mt-5 border border-line/70 bg-cream/40 px-4 py-3 md:px-5">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
              Before you start
            </p>
            <ul className="mt-2 space-y-2">
              {cookingContext.beforeYouStart.map((note) => (
                <li key={note} className="flex gap-2.5 text-sm leading-6 text-ink/90">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-terracotta" aria-hidden />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <div className="recipe-cook-grid mt-5 grid gap-8 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
          <div className="recipe-ingredients-panel lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:pr-2">
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
              <div key={group.name ?? "main"} className="recipe-ingredient-group mt-4">
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
              <div className="recipe-utensils mt-5">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
                  Utensils
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {utensils.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-line/80 px-2.5 py-1 text-xs text-ink"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="recipe-instructions-panel">
            <h3 className="font-serif text-xl text-ink">Instructions</h3>
            <div className="mt-3">
              {stages.map((stage) => (
                <StageAccordion
                  key={stage.id}
                  stage={stage}
                  open={Boolean(openStages[stage.id])}
                  onToggle={() => toggleStage(stage.id)}
                  youtube={youtube}
                  recipe={recipe}
                  tips={cookingContext.stageTips[stage.id] ?? []}
                  videoHelp={stageVideoHelp[stage.id]}
                />
              ))}
            </div>
          </div>
        </div>

        {showNutrition ? (
          <div className="mt-6 border-t border-line/80 pt-4 text-sm text-muted">
            <p className="font-semibold text-ink">Nutrition (estimate)</p>
            <p className="mt-1">
              {recipe.nutrition.calories} kcal · {recipe.nutrition.carbs}g carbs ·{" "}
              {recipe.nutrition.protein}g protein · {recipe.nutrition.fat}g fat
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** @deprecated Use RecipeCookingWorkspace */
export function RecipeCard(props: Parameters<typeof RecipeCookingWorkspace>[0]) {
  return <RecipeCookingWorkspace {...props} />;
}
