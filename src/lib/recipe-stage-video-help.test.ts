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

const baguetteStages: RecipeInstructionStage[] = [
  {
    id: "yeast",
    name: "Activate Yeast & Incorporate",
    steps: [{ globalIndex: 0, text: "Mix" }],
  },
  {
    id: "fold",
    name: "Stretch-and-Fold Rounds",
    steps: [{ globalIndex: 1, text: "Fold" }],
  },
  {
    id: "shape",
    name: "Shaping",
    steps: [{ globalIndex: 2, text: "Shape" }],
  },
  {
    id: "bake",
    name: "Scoring & Steam Bake",
    steps: [{ globalIndex: 3, text: "Bake" }],
  },
];

const baguetteChapters = [
  { label: "The Foundation of Perfect Dough", time: 0 },
  { label: "The Secret to Gluten Development", time: 87 },
  { label: "Shaping for the Perfect Crumb", time: 197 },
  { label: "The Art of the Steam Bake", time: 381 },
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
  assert.equal(help["stage-0"].linkLabel, "Watch: Stretch and fold technique · 1:22");
  assert.equal(help["stage-1"], undefined);
  assert.ok(help["stage-2"]);
  assert.equal(help["stage-2"].linkLabel, "Watch: Dividing the dough · 2:20");
  assert.ok(help["stage-3"]);
  assert.equal(help["stage-3"].linkLabel, "Watch: Shaping the baguettes · 3:09");
  assert.ok(help["stage-4"]);
  assert.equal(help["stage-4"].linkLabel, "Watch: Scoring and steam · 5:10");
});

test("baguette chapters map to the correct instruction stages", () => {
  const help = selectStageVideoHelp(baguetteStages, baguetteChapters);

  assert.equal(help.yeast?.time, 0);
  assert.equal(help.yeast?.linkLabel, "Watch: The Foundation of Perfect Dough · 0:00");
  assert.equal(help.fold?.time, 87);
  assert.equal(help.fold?.linkLabel, "Watch: The Secret to Gluten Development · 1:27");
  assert.equal(help.shape?.time, 197);
  assert.equal(help.shape?.linkLabel, "Watch: Shaping for the Perfect Crumb · 3:17");
  assert.equal(help.bake?.time, 381);
  assert.equal(help.bake?.linkLabel, "Watch: The Art of the Steam Bake · 6:21");
});

test("does not invent stretch-and-fold CTA for yeast/incorporate at 0:00", () => {
  const help = selectStageVideoHelp(
    [
      {
        id: "yeast",
        name: "Activate Yeast & Incorporate",
        steps: [{ globalIndex: 0, text: "Mix" }],
      },
    ],
    baguetteChapters,
  );

  assert.equal(help.yeast?.time, 0);
  assert.match(help.yeast?.linkLabel ?? "", /Foundation of Perfect Dough/);
  assert.doesNotMatch(help.yeast?.linkLabel ?? "", /stretch-and-fold/i);
});

test("omits uncertain leftover chapter assignments", () => {
  const help = selectStageVideoHelp(stages, [
    { label: "Stretch & fold", time: 60 },
    { label: "Bench work", time: 120 },
    { label: "Into the oven", time: 240 },
  ]);

  assert.equal(help["stage-0"]?.time, 60);
  assert.equal(help["stage-1"], undefined);
  // "Bench work" has no strong pair — do not guess a stage.
  assert.equal(help["stage-2"], undefined);
  assert.equal(help["stage-3"], undefined);
  assert.equal(help["stage-4"]?.time, 240);
  assert.match(help["stage-4"]?.linkLabel ?? "", /Into the oven/);
});

test("selectStageVideoHelp returns empty without chapters", () => {
  assert.deepEqual(selectStageVideoHelp(stages, []), {});
  assert.deepEqual(selectStageVideoHelp(stages, undefined), {});
});

test("selectStageVideoHelp does not fall back to legacy when canonical chapters are active", () => {
  const help = selectStageVideoHelp(
    [
      {
        id: "stage-0",
        name: "Mapped",
        steps: [{ globalIndex: 0, text: "A" }],
      },
      {
        id: "stage-1",
        name: "Unmapped",
        steps: [{ globalIndex: 1, text: "B" }],
      },
    ],
    [{ label: "Legacy chapter", time: 120 }],
    [
      {
        instructionStageId: "stage-1",
        instructionSectionTitle: "Unmapped",
        videoStartSeconds: 120,
        videoTimestampLabel: "2:00",
        chapterTitle: "Legacy chapter",
        confidence: "VERIFIED",
        source: "manual",
      },
    ],
    [
      { name: "Mapped", steps: ["a"], startTimestamp: 12 },
      { name: "Unmapped", steps: ["b"] },
    ],
  );

  assert.equal(help["stage-0"]?.time, 12);
  assert.equal(help["stage-1"], undefined);
});
