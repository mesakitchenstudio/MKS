import type { Recipe } from "@/data/types";
import { instructionStepText, normalizeTimerSeconds } from "@/lib/instruction-step";
import { normalizeStepVideoTimestampSeconds } from "@/lib/step-video-timestamps";

export type RecipeInstructionStep = {
  globalIndex: number;
  text: string;
  timerSeconds?: number;
  /**
   * Per-step video seek offset (seconds) carried from InstructionGroup.stepVideoTimestamps.
   * Present only when a valid integer seconds value exists for this step slot.
   * Public eligibility (gate + binding) is decided by the caller before rendering.
   */
  videoTimestampSeconds?: number;
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
      .map((step, stepIndex) => {
        const videoTimestampSeconds = normalizeStepVideoTimestampSeconds(
          group.stepVideoTimestamps?.[stepIndex],
        );
        return {
          text: instructionStepText(step).trim(),
          timerSeconds: normalizeTimerSeconds(group.stepTimers?.[stepIndex]),
          stepIndex,
          ...(videoTimestampSeconds != null ? { videoTimestampSeconds } : {}),
        };
      })
      .filter((step) => step.text)
      .map((step, filteredIndex) => ({
        globalIndex: offset + filteredIndex,
        text: step.text,
        timerSeconds: step.timerSeconds,
        ...(step.videoTimestampSeconds != null
          ? { videoTimestampSeconds: step.videoTimestampSeconds }
          : {}),
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
