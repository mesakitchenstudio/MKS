import assert from "node:assert/strict";
import { test } from "node:test";
import { selectStageVideoHelp } from "./recipe-stage-video-help";
import type { RecipeInstructionStage } from "./recipe-instructions";

const stages: RecipeInstructionStage[] = [
  {
    id: "stage-0",
    name: "Incorporation & Stretch-and-Fold Rounds",
    steps: [{ globalIndex: 0, text: "Fold" }],
  },
  {
    id: "stage-1",
    name: "Mixing dry ingredients",
    steps: [{ globalIndex: 1, text: "Stir" }],
  },
  {
    id: "stage-2",
    name: "Final Shaping & Proofing",
    steps: [{ globalIndex: 2, text: "Shape" }],
  },
  {
    id: "stage-3",
    name: "Scoring, Steam & Baking",
    steps: [{ globalIndex: 3, text: "Bake" }],
  },
];

test("selectStageVideoHelp only attaches strong technique matches", () => {
  const help = selectStageVideoHelp(stages, [
    { label: "Stretch and fold technique", time: 82 },
    { label: "Shaping the baguettes", time: 189 },
    { label: "Scoring and steam", time: 310 },
    { label: "Intro", time: 0 },
  ]);

  assert.ok(help["stage-0"]);
  assert.equal(help["stage-0"].linkLabel, "Watch the stretch-and-fold technique · 1:22");
  assert.ok(help["stage-2"]);
  assert.equal(help["stage-2"].linkLabel, "Watch the shaping technique · 3:09");
  assert.ok(help["stage-3"]);
  assert.match(help["stage-3"].linkLabel, /Watch scoring & baking · 5:10/);
  assert.equal(help["stage-1"], undefined);
});
