import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Recipe } from "@/data/types";
import {
  buildCookingNavModel,
  clampStepIndex,
  firstStepIndexForStage,
} from "./cooking-nav.ts";
import {
  cookingContentVersion,
  createEmptyCookingSession,
  hasMeaningfulCookingProgress,
  parseCookingSession,
  resolveCookingSession,
  timerRemainingMs,
} from "./cooking-session.ts";
import {
  alignStepTimers,
  formatTimerClock,
  minutesToTimerSeconds,
  normalizeTimerSeconds,
} from "./instruction-step.ts";
import { recipeInstructionStages } from "./recipe-instructions.ts";
import { scaleAmount, formatCulinaryNumber } from "./culinary-format.ts";
import { timestampForStep } from "./recipe-youtube.ts";

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "classic-baguettes",
    title: "Classic French Baguettes",
    excerpt: "A calm bake.",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/baguette.jpg",
    imageAlt: "Baguettes",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    prepMinutes: 30,
    cookMinutes: 25,
    servings: 4,
    servingsUnit: "servings",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["bread"],
    tags: [],
    ingredients: [
      {
        name: "Dough",
        items: [
          { item: "bread flour", amount: "500 g" },
          { item: "water", amount: "375 ml" },
          { item: "yeast", amount: "1¼ tsp" },
          { item: "salt", amount: "to taste" },
        ],
      },
    ],
    instructions: [
      {
        name: "Activating the Yeast",
        steps: ["Combine warm water and yeast.", "Let stand until foamy."],
        stepTimers: [null, 600],
      },
      {
        name: "Mixing",
        steps: ["Add flour and salt.", "Knead until smooth."],
      },
      {
        name: "Baking",
        steps: ["Bake until deep golden."],
      },
    ],
    notes: [],
    nutrition: { calories: 200, carbs: 0, protein: 0, fat: 0 },
    ...overrides,
  };
}

describe("cooking nav model", () => {
  it("builds global + stage progress across stage boundaries", () => {
    const model = buildCookingNavModel(baseRecipe());
    assert.equal(model.totalSteps, 5);
    assert.equal(model.totalStages, 3);
    assert.equal(model.steps[0]?.stageName, "Activating the Yeast");
    assert.equal(model.steps[0]?.timerSeconds, undefined);
    assert.equal(model.steps[1]?.timerSeconds, 600);
    assert.equal(model.steps[2]?.stageName, "Mixing");
    assert.equal(model.steps[4]?.text, "Bake until deep golden.");
  });

  it("supports first/next/previous/jump and one-step recipes", () => {
    const model = buildCookingNavModel(baseRecipe());
    assert.equal(clampStepIndex(-1, model.totalSteps), 0);
    assert.equal(clampStepIndex(99, model.totalSteps), 4);
    assert.equal(firstStepIndexForStage(model, "stage-1"), 2);

    const one = buildCookingNavModel(
      baseRecipe({ instructions: [{ name: "Only", steps: ["Do the thing."] }] }),
    );
    assert.equal(one.totalSteps, 1);
    assert.equal(one.totalStages, 1);
  });

  it("progress calculation uses global step index", () => {
    const model = buildCookingNavModel(baseRecipe());
    const current = 2;
    const pct = Math.round(((current + 1) / model.totalSteps) * 100);
    assert.equal(pct, 60);
  });
});

describe("cooking session persistence", () => {
  it("parses valid sessions and ignores malformed state", () => {
    const ok = parseCookingSession({
      version: 1,
      recipeId: "abc",
      contentVersion: "h1",
      currentStepIndex: 2,
      completedStepIndexes: [0, 1],
      checkedIngredientKeys: ["0:0"],
      servings: 6,
      keepScreenAwake: true,
      timers: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.ok(ok);
    assert.equal(ok!.currentStepIndex, 2);
    assert.equal(ok!.servings, 6);
    assert.equal(hasMeaningfulCookingProgress(ok!), true);

    assert.equal(parseCookingSession({ version: 2 }), null);
    assert.equal(parseCookingSession({ version: 1, recipeId: "" }), null);
    assert.equal(parseCookingSession("nope"), null);
  });

  it("detects stale content versions without mapping old steps", () => {
    const recipe = baseRecipe();
    const version = cookingContentVersion(recipe);
    const session = createEmptyCookingSession({
      recipeId: "r1",
      contentVersion: "old-hash",
      servings: 4,
      currentStepIndex: 3,
    });
    const stale = resolveCookingSession({
      recipeId: "r1",
      contentVersion: version,
      stored: session,
    });
    assert.equal(stale.status, "stale");

    const fresh = resolveCookingSession({
      recipeId: "r1",
      contentVersion: version,
      stored: { ...session, contentVersion: version },
    });
    assert.equal(fresh.status, "ok");
  });

  it("content version changes when instructions change", () => {
    const a = cookingContentVersion(baseRecipe());
    const b = cookingContentVersion(
      baseRecipe({
        instructions: [{ name: "Activating the Yeast", steps: ["Changed step."] }],
      }),
    );
    assert.notEqual(a, b);
  });

  it("timer remaining uses wall-clock endsAt", () => {
    const now = 1_000_000;
    const running = {
      id: "t1",
      label: "Rise",
      durationSeconds: 600,
      endsAt: now + 90_000,
      remainingMs: null,
      status: "running" as const,
    };
    assert.equal(timerRemainingMs(running, now), 90_000);
    const paused = {
      ...running,
      status: "paused" as const,
      endsAt: null,
      remainingMs: 45_000,
    };
    assert.equal(timerRemainingMs(paused, now), 45_000);
  });
});

describe("cooking ingredients / scaling reuse", () => {
  it("reuses scaleAmount and culinary fractions", () => {
    assert.equal(scaleAmount("500 g", 0.5), "250 g");
    assert.equal(formatCulinaryNumber(1.25), "1¼");
    assert.equal(scaleAmount("to taste", 2), "to taste");
  });

  it("stages expose optional timers without inventing ingredient links", () => {
    const stages = recipeInstructionStages(baseRecipe());
    assert.equal(stages[0]?.steps[1]?.timerSeconds, 600);
    // No ingredient↔step association in model — Cooking Mode shows full panel.
    assert.equal("ingredientsForStep" in (stages[0]?.steps[0] ?? {}), false);
  });
});

describe("cooking video timestamp selection", () => {
  it("selects step timestamps by global index", () => {
    const ts = timestampForStep(
      [
        { time: 47, label: "Yeast", stepIndex: 0 },
        { time: 204, label: "Knead", stepIndex: 3 },
      ],
      3,
    );
    assert.equal(ts?.time, 204);
    assert.equal(timestampForStep([], 0), undefined);
  });
});

describe("instruction step timers", () => {
  it("normalizes optional timer minutes and rejects absurd values", () => {
    assert.equal(minutesToTimerSeconds(10), 600);
    assert.equal(normalizeTimerSeconds(-5), undefined);
    assert.equal(normalizeTimerSeconds(999999), undefined);
    assert.equal(formatTimerClock(65), "1:05");
    assert.deepEqual(alignStepTimers([600, null], 3), [600, null, undefined]);
  });
});
