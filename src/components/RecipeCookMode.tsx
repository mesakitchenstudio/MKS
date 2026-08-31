"use client";

import { useEffect, useMemo, useState } from "react";
import type { Recipe } from "@/data/types";
import { scaleAmount } from "@/lib/culinary-format";
import type { RecipeInstructionStage } from "@/lib/recipe-instructions";

type CookPosition = { stageIndex: number; stepIndex: number };

export function RecipeCookMode({
  recipe,
  stages,
  servings,
  factor,
  onClose,
}: {
  recipe: Recipe;
  stages: RecipeInstructionStage[];
  servings: number;
  factor: number;
  onClose: () => void;
}) {
  const [position, setPosition] = useState<CookPosition>({ stageIndex: 0, stepIndex: 0 });
  const [ingredientsOpen, setIngredientsOpen] = useState(false);

  const flatSteps = useMemo(
    () =>
      stages.flatMap((stage, stageIndex) =>
        stage.steps.map((step, stepIndex) => ({ stage, stageIndex, step, stepIndex })),
      ),
    [stages],
  );

  const flatIndex = useMemo(() => {
    let index = 0;
    for (let s = 0; s < position.stageIndex; s += 1) index += stages[s]?.steps.length ?? 0;
    return index + position.stepIndex;
  }, [position, stages]);

  const current = flatSteps[flatIndex];
  const totalSteps = flatSteps.length;
  const stageCount = stages.length;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function goNext() {
    if (flatIndex >= totalSteps - 1) return;
    const next = flatSteps[flatIndex + 1];
    setPosition({ stageIndex: next.stageIndex, stepIndex: next.stepIndex });
  }

  function goPrev() {
    if (flatIndex <= 0) return;
    const prev = flatSteps[flatIndex - 1];
    setPosition({ stageIndex: prev.stageIndex, stepIndex: prev.stepIndex });
  }

  if (!current) return null;

  return (
    <div
      className="no-print fixed inset-0 z-[70] flex flex-col bg-[var(--cream)]"
      role="dialog"
      aria-modal="true"
      aria-label="Cook mode"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3 md:px-6">
        <div className="min-w-0">
          <p className="truncate font-serif text-lg text-ink">{recipe.title}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Stage {position.stageIndex + 1} of {stageCount} · Step {position.stepIndex + 1} of{" "}
            {current.stage.steps.length} · Step {flatIndex + 1} of {totalSteps}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setIngredientsOpen((open) => !open)}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:border-olive"
          >
            Ingredients
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-muted hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-olive">{current.stage.name}</p>
          <p className="mt-6 font-serif text-2xl leading-relaxed text-ink md:text-3xl">{current.step.text}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={flatIndex === 0}
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={flatIndex >= totalSteps - 1}
              className="rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        {ingredientsOpen ? (
          <aside className="w-full border-t border-line bg-paper p-4 md:w-80 md:border-l md:border-t-0 md:overflow-y-auto">
            <p className="text-sm font-semibold text-ink">
              Ingredients · {servings} {recipe.servingsUnit}
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6">
              {recipe.ingredients.flatMap((group) =>
                group.items.map((item) => (
                  <li key={item.item}>
                    <strong>{scaleAmount(item.amount, factor)}</strong> {item.item}
                  </li>
                )),
              )}
            </ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
