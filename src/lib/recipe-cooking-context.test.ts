import assert from "node:assert/strict";
import { test } from "node:test";
import { planCookingContext } from "./recipe-cooking-context";
import type { RecipeInstructionStage } from "./recipe-instructions";

const stages: RecipeInstructionStage[] = [
  {
    id: "stage-0",
    name: "Incorporation & Stretch-and-Fold Rounds",
    steps: [{ globalIndex: 0, text: "Mix" }],
  },
  {
    id: "stage-1",
    name: "Scoring, Steam & Baking",
    steps: [{ globalIndex: 1, text: "Bake" }],
  },
];

test("planCookingContext routes before: prefix and steam tips", () => {
  const plan = planCookingContext(
    {
      notes: [
        "before:Use water around 30°C",
        "Remove the steam tray after the first 10 minutes so the crust can dry and crisp.",
      ],
      tips: [],
    },
    stages,
  );

  assert.deepEqual(plan.beforeYouStart, ["Use water around 30°C"]);
  assert.equal(plan.stageTips["stage-1"]?.length, 1);
  assert.match(plan.stageTips["stage-1"][0], /steam tray/i);
});

test("planCookingContext honors stage: prefix", () => {
  const plan = planCookingContext(
    {
      notes: ["stage:Incorporation & Stretch-and-Fold Rounds|Keep folds gentle"],
      tips: [],
    },
    stages,
  );
  assert.deepEqual(plan.stageTips["stage-0"], ["Keep folds gentle"]);
});
