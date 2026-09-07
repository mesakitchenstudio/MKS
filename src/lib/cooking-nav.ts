import type { Recipe } from "@/data/types";
import { recipeInstructionStages, type RecipeInstructionStage } from "@/lib/recipe-instructions";

export type CookingFlatStep = {
  globalIndex: number;
  stageId: string;
  stageIndex: number;
  stageName: string;
  stageStepIndex: number;
  text: string;
  timerSeconds?: number;
};

export type CookingNavModel = {
  stages: RecipeInstructionStage[];
  steps: CookingFlatStep[];
  totalSteps: number;
  totalStages: number;
};

export function buildCookingNavModel(recipe: Recipe): CookingNavModel {
  const stages = recipeInstructionStages(recipe);
  const steps: CookingFlatStep[] = [];
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const stage = stages[stageIndex]!;
    for (let stageStepIndex = 0; stageStepIndex < stage.steps.length; stageStepIndex += 1) {
      const step = stage.steps[stageStepIndex]!;
      steps.push({
        globalIndex: step.globalIndex,
        stageId: stage.id,
        stageIndex,
        stageName: stage.name,
        stageStepIndex,
        text: step.text,
        timerSeconds: step.timerSeconds,
      });
    }
  }
  return {
    stages,
    steps,
    totalSteps: steps.length,
    totalStages: stages.length,
  };
}

export function clampStepIndex(index: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.max(0, Math.min(totalSteps - 1, Math.floor(index)));
}

export function firstStepIndexForStage(model: CookingNavModel, stageId: string): number {
  const found = model.steps.find((step) => step.stageId === stageId);
  return found?.globalIndex ?? 0;
}

export function stageProgressLabel(step: CookingFlatStep, totalStages: number): string {
  if (totalStages <= 1) return step.stageName;
  return `Stage ${step.stageIndex + 1} of ${totalStages}`;
}
