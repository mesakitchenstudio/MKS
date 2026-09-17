import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Recipe } from "../data/types.ts";
import { buildCookingNavModel } from "./cooking-nav.ts";
import { cookingContentVersion, createEmptyCookingSession } from "./cooking-session.ts";
import { isPublicStepVideoTimestampsEligible } from "./step-video-timestamps.ts";
import { timestampForStep } from "./recipe-youtube.ts";
import { youtubeWatchUrlAt } from "./youtube.ts";
import { formatTimestampInput } from "./youtube-metadata-editor.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

const VIDEO_A = "abcdefghijk";
const VIDEO_B = "zyxwvutsrqp";

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "cook-ts-fixture",
    title: "Cooking Timestamp Fixture",
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/x.jpg",
    imageAlt: "x",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 4,
    servingsUnit: "servings",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    categories: ["bread"],
    tags: [],
    ingredients: [{ items: [{ item: "Flour", amount: "1 cup" }] }],
    instructions: [
      {
        name: "Mix",
        steps: ["Combine dry", "Add water", "Knead until smooth"],
        stepVideoTimestamps: [0, null, 102],
        stepTimers: [null, 600, null],
        startTimestamp: 5,
      },
    ],
    notes: [],
    nutrition: { calories: 1, carbs: 1, protein: 1, fat: 1 },
    youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_A}`,
    youtube: {
      videoId: VIDEO_A,
      stepTimestampsVideoId: VIDEO_A,
      timestamps: [{ time: 45, label: "Legacy knead", stepIndex: 2 }],
    },
    ...overrides,
  };
}

describe("Roadmap #10E — gate wiring", () => {
  it("cook page passes server-derived isRecipeStepTimestampsEnabled", () => {
    const page = read("app/recipes/[slug]/cook/page.tsx");
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(page, /stepTimestampsEnabled=\{isRecipeStepTimestampsEnabled\(\)\}/);
    assert.match(page, /isRecipeStepTimestampsEnabled/);
    assert.match(mode, /stepTimestampsEnabled/);
    assert.match(mode, /isPublicStepVideoTimestampsEligible/);
    assert.doesNotMatch(page, /NEXT_PUBLIC_RECIPE_STEP_TIMESTAMPS/);
    assert.doesNotMatch(mode, /process\.env\.RECIPE_STEP_TIMESTAMPS/);
  });

  it("gate OFF keeps eligibility false with active mapping", () => {
    const recipe = baseRecipe();
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: false,
        instructions: recipe.instructions,
        youtube: recipe.youtube,
        youtubeUrl: recipe.youtubeUrl,
      }),
      false,
    );
  });
});

describe("Roadmap #10E — nav mapping carries co-located timestamps", () => {
  it("buildCookingNavModel preserves 0, partial coverage, and timer independence", () => {
    const nav = buildCookingNavModel(baseRecipe());
    assert.equal(nav.steps.length, 3);
    assert.equal(nav.steps[0]!.videoTimestampSeconds, 0);
    assert.equal(nav.steps[0]!.timerSeconds, undefined);
    assert.equal(nav.steps[1]!.videoTimestampSeconds, undefined);
    assert.equal(nav.steps[1]!.timerSeconds, 600);
    assert.equal(nav.steps[2]!.videoTimestampSeconds, 102);
    assert.equal(nav.steps[2]!.timerSeconds, undefined);
  });

  it("reordered storage C/A/B with 30/10/20 maps to cooking steps correctly", () => {
    const recipe = baseRecipe({
      instructions: [
        {
          name: "Mix",
          steps: ["C", "A", "B"],
          stepVideoTimestamps: [30, 10, 20],
        },
      ],
    });
    const nav = buildCookingNavModel(recipe);
    assert.equal(nav.steps[0]!.text, "C");
    assert.equal(nav.steps[0]!.videoTimestampSeconds, 30);
    assert.equal(nav.steps[1]!.text, "A");
    assert.equal(nav.steps[1]!.videoTimestampSeconds, 10);
    assert.equal(nav.steps[2]!.text, "B");
    assert.equal(nav.steps[2]!.videoTimestampSeconds, 20);
  });

  it("malformed timestamps omit mapping without dropping instruction text", () => {
    const recipe = baseRecipe({
      instructions: [
        {
          name: "Mix",
          steps: ["Keep me", "Also keep"],
          stepVideoTimestamps: [-3, 1.25],
        },
      ],
    });
    const nav = buildCookingNavModel(recipe);
    assert.equal(nav.steps[0]!.text, "Keep me");
    assert.equal(nav.steps[0]!.videoTimestampSeconds, undefined);
    assert.equal(nav.steps[1]!.text, "Also keep");
    assert.equal(nav.steps[1]!.videoTimestampSeconds, undefined);
  });
});

describe("Roadmap #10E — eligibility + lifecycle", () => {
  it("active / mismatch / unbound / missing video / none", () => {
    const active = baseRecipe();
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: active.instructions,
        youtube: active.youtube,
        youtubeUrl: active.youtubeUrl,
      }),
      true,
    );

    const mismatch = baseRecipe({
      youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_A },
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_B}`,
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: mismatch.instructions,
        youtube: mismatch.youtube,
        youtubeUrl: mismatch.youtubeUrl,
      }),
      false,
    );

    const unbound = baseRecipe({ youtube: { videoId: VIDEO_A } });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: unbound.instructions,
        youtube: unbound.youtube,
        youtubeUrl: unbound.youtubeUrl,
      }),
      false,
    );

    const missing = baseRecipe({
      youtubeUrl: undefined,
      youtube: { stepTimestampsVideoId: VIDEO_A },
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: missing.instructions,
        youtube: missing.youtube,
        youtubeUrl: missing.youtubeUrl,
      }),
      false,
    );

    const none = baseRecipe({
      instructions: [{ name: "Mix", steps: ["A", "B", "C"] }],
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: none.instructions,
        youtube: none.youtube,
        youtubeUrl: none.youtubeUrl,
      }),
      false,
    );
  });

  it("video removal/restoration lifecycle (ABC present → remove absent → ABC present → XYZ absent)", () => {
    const withAbc = baseRecipe();
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: withAbc.instructions,
        youtube: withAbc.youtube,
        youtubeUrl: withAbc.youtubeUrl,
      }),
      true,
    );

    const removed = baseRecipe({
      youtubeUrl: undefined,
      youtube: { stepTimestampsVideoId: VIDEO_A },
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: removed.instructions,
        youtube: removed.youtube,
        youtubeUrl: removed.youtubeUrl,
      }),
      false,
    );

    const restoredAbc = baseRecipe();
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: restoredAbc.instructions,
        youtube: restoredAbc.youtube,
        youtubeUrl: restoredAbc.youtubeUrl,
      }),
      true,
    );

    const restoredXyz = baseRecipe({
      youtube: { videoId: VIDEO_B, stepTimestampsVideoId: VIDEO_A },
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_B}`,
    });
    assert.equal(
      isPublicStepVideoTimestampsEligible({
        gateEnabled: true,
        instructions: restoredXyz.instructions,
        youtube: restoredXyz.youtube,
        youtubeUrl: restoredXyz.youtubeUrl,
      }),
      false,
    );
  });
});

describe("Roadmap #10E — CookingMode source contracts", () => {
  it("reuses RecipeStepVideoTimestampLink with scroll false and #10 precedence", () => {
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(mode, /RecipeStepVideoTimestampLink/);
    assert.match(mode, /scroll=\{false\}/);
    assert.match(mode, /stepTs10/);
    assert.match(mode, /legacyStepTs/);
    assert.match(mode, /videoTimestampSeconds\s*!=\s*null/);
    assert.match(mode, /VideoTimestampLink/);
    assert.match(mode, /timestampForStep/);
    // #10 before legacy; one per-step control path.
    assert.ok(mode.indexOf("stepTs10") < mode.indexOf("legacyStepTs"));
    assert.match(mode, /stepTs10\s*==\s*null\s*&&\s*current\s*&&\s*youtube/);
    // Real anchor component — not wrapped in button for #10.
    assert.doesNotMatch(
      mode.slice(mode.indexOf("RecipeStepVideoTimestampLink"), mode.indexOf("legacyStepTs")),
      /<button/,
    );
  });

  it("stage help may coexist with #10; legacy still XOR with stage", () => {
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(
      mode,
      /showStageHelpLink\s*=\s*Boolean\(stageHelp\s*&&\s*youtube\s*&&\s*\(stepTs10\s*!=\s*null\s*\|\|\s*!legacyStepTs\)\)/,
    );
  });

  it("does not encode timestamps into cooking session", () => {
    const session = read("lib/cooking-session.ts");
    assert.doesNotMatch(session, /stepVideoTimestamps|videoTimestampSeconds/);
    const recipe = baseRecipe();
    const v1 = cookingContentVersion(recipe);
    const withDifferentTs = baseRecipe({
      instructions: [
        {
          name: "Mix",
          steps: ["Combine dry", "Add water", "Knead until smooth"],
          stepVideoTimestamps: [0, null, 999],
          stepTimers: [null, 600, null],
          startTimestamp: 5,
        },
      ],
    });
    // Timestamps alone do not churn cooking content version (session independence).
    assert.equal(cookingContentVersion(withDifferentTs), v1);
    const empty = createEmptyCookingSession({
      recipeId: "r1",
      contentVersion: v1,
      servings: 4,
    });
    assert.equal("videoTimestampSeconds" in empty, false);
    assert.equal("stepVideoTimestamps" in empty, false);
  });

  it("zero-second href and display helpers remain valid for cooking steps", () => {
    const nav = buildCookingNavModel(baseRecipe());
    const zero = nav.steps[0]!.videoTimestampSeconds!;
    assert.equal(zero, 0);
    assert.equal(formatTimestampInput(zero), "00:00");
    assert.equal(
      youtubeWatchUrlAt(VIDEO_A, zero),
      `https://www.youtube.com/watch?v=${VIDEO_A}&t=0`,
    );
    assert.equal(formatTimestampInput(102), "01:42");
  });

  it("legacy stepIndex still resolvable when #10 absent or gated off", () => {
    const recipe = baseRecipe();
    const legacy = timestampForStep(recipe.youtube?.timestamps, 2);
    assert.equal(legacy?.time, 45);
  });
});

describe("Roadmap #10E — revalidation + public/admin unchanged contracts", () => {
  it("keeps 10D cook revalidation without duplicating save logic", () => {
    const actions = read("app/admin/actions.ts");
    const cookHits = actions.match(/revalidatePath\(`\/recipes\/\$\{slug\}\/cook`\)/g) ?? [];
    assert.equal(cookHits.length, 1);
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{previousSlug\}\/cook`\)/);
  });

  it("public RecipeCard still uses RecipeStepVideoTimestampLink", () => {
    assert.match(read("components/RecipeCard.tsx"), /RecipeStepVideoTimestampLink/);
    assert.match(read("components/RecipeCard.tsx"), /isPublicStepVideoTimestampsEligible/);
  });

  it("Admin authoring files unchanged in 10E scope (still use applyStepVideoTimestampsOnSave)", () => {
    assert.match(read("app/admin/actions.ts"), /applyStepVideoTimestampsOnSave/);
    assert.doesNotMatch(read("components/cooking/CookingMode.tsx"), /applyStepVideoTimestampsOnSave/);
  });

  it("no Prisma schema columns for #10", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /stepVideoTimestamps|stepTimestampsVideoId/);
  });

  it("no new analytics event names", () => {
    assert.doesNotMatch(read("lib/analytics.ts"), /recipe_step_video_timestamp|cook_step_timestamp/);
    assert.doesNotMatch(read("lib/video-analytics.ts"), /recipe_step_video_timestamp|cook_step_timestamp/);
  });
});
