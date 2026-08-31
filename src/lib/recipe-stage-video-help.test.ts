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
    name: "Dividing & Pre-shaping",
    steps: [{ globalIndex: 2, text: "Divide" }],
  },
  {
    id: "stage-3",
    name: "Final Shaping & Proofing",
    steps: [{ globalIndex: 3, text: "Shape" }],
  },
  {
    id: "stage-4",
    name: "Scoring, Steam & Baking",
    steps: [{ globalIndex: 4, text: "Bake" }],
  },
];

test("selectStageVideoHelp only attaches strong technique matches", () => {
  const help = selectStageVideoHelp(stages, [
    { label: "Intro", time: 0 },
    { label: "Stretch and fold technique", time: 82 },
    { label: "Dividing the dough", time: 140 },
    { label: "Shaping the baguettes", time: 189 },
    { label: "Scoring and steam", time: 310 },
  ]);

  assert.ok(help["stage-0"]);
  assert.equal(help["stage-0"].linkLabel, "Watch the stretch-and-fold technique · 1:22");
  assert.equal(help["stage-1"], undefined);
  assert.ok(help["stage-2"]);
  assert.equal(help["stage-2"].linkLabel, "See how to divide & pre-shape · 2:20");
  assert.ok(help["stage-3"]);
  assert.equal(help["stage-3"].linkLabel, "See how to shape the baguettes · 3:09");
  assert.ok(help["stage-4"]);
  assert.match(help["stage-4"].linkLabel, /Watch scoring & baking · 5:10/);
});

test("selectStageVideoHelp assigns leftover chapters to unmatched technique stages", () => {
  const help = selectStageVideoHelp(stages, [
    { label: "Stretch & fold", time: 60 },
    { label: "Bench work", time: 120 },
    { label: "Into the oven", time: 240 },
  ]);

  assert.equal(help["stage-0"]?.time, 60);
  assert.equal(help["stage-1"], undefined);
  // Dividing unmatched by label → next leftover after stretch claimed
  assert.ok(help["stage-2"] || help["stage-3"]);
  assert.ok(help["stage-4"]);
  assert.equal(help["stage-4"]?.time, 240);
});

test("selectStageVideoHelp returns empty without chapters", () => {
  assert.deepEqual(selectStageVideoHelp(stages, []), {});
  assert.deepEqual(selectStageVideoHelp(stages, undefined), {});
});
