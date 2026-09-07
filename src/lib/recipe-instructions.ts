import type { Recipe } from "@/data/types";
import { instructionStepText, normalizeTimerSeconds } from "@/lib/instruction-step";

export type RecipeInstructionStep = {
  globalIndex: number;
  text: string;
  timerSeconds?: number;
};

export type RecipeInstructionStage = {
  id: string;
  name: string;
  steps: RecipeInstructionStep[];
};

export function recipeInstructionStages(recipe: Recipe): RecipeInstructionStage[] {
  const groups = recipe.instructions.filter((group) =>
    group.steps.some((step) => instructionStepText(step).trim()),
  );
  let offset = 0;
  return groups.map((group, index) => {
    const steps = group.steps
      .map((step, stepIndex) => ({
        text: instructionStepText(step).trim(),
        timerSeconds: normalizeTimerSeconds(group.stepTimers?.[stepIndex]),
        stepIndex,
      }))
      .filter((step) => step.text)
      .map((step, filteredIndex) => ({
        globalIndex: offset + filteredIndex,
        text: step.text,
        timerSeconds: step.timerSeconds,
      }));
    offset += steps.length;
    return {
      id: `stage-${index}`,
      name: group.name?.trim() || (groups.length > 1 ? `Stage ${index + 1}` : "Instructions"),
      steps,
    };
  });
}

export function totalInstructionSteps(stages: RecipeInstructionStage[]): number {
  return stages.reduce((sum, stage) => sum + stage.steps.length, 0);
}
