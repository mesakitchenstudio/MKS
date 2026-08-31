import type { Recipe } from "@/data/types";

export type RecipeInstructionStep = {
  globalIndex: number;
  text: string;
};

export type RecipeInstructionStage = {
  id: string;
  name: string;
  steps: RecipeInstructionStep[];
};

export function recipeInstructionStages(recipe: Recipe): RecipeInstructionStage[] {
  const groups = recipe.instructions.filter((group) =>
    group.steps.some((step) => step.trim()),
  );
  let offset = 0;
  return groups.map((group, index) => {
    const steps = group.steps
      .filter((step) => step.trim())
      .map((text, stepIndex) => ({
        globalIndex: offset + stepIndex,
        text,
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
