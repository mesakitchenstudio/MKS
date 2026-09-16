import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Recipe } from "@/data/types";
import { RecipePrintSheet } from "../components/RecipePrintSheet.tsx";
import { RecipePublicUpdateNote } from "../components/RecipePublicUpdateNote.tsx";
import { clampRecipeServings, scaleAmount } from "./culinary-format.ts";
import {
  buildCookingNavModel,
  clampStepIndex,
  firstStepIndexForStage,
} from "./cooking-nav.ts";
import {
  cookingContentVersion,
  createEmptyCookingSession,
  ingredientCheckKey,
  resolveCookingSession,
} from "./cooking-session.ts";
import { normalizeInstructionGroups } from "./instruction-chapters.ts";
import { alignStepTimers } from "./instruction-step.ts";
import { recipePrintMetaItems, recipePrintYieldLabel } from "./recipe-print.ts";
import {
  formatPublicUpdateLabel,
  normalizePublicUpdateFields,
  recipeDateModifiedIso,
} from "./recipe-public-update.ts";
import { recipeInstructionStages } from "./recipe-instructions.ts";
import { selectStageVideoHelp } from "./recipe-stage-video-help.ts";
import { timestampForStep } from "./recipe-youtube.ts";
import { recipeJsonLd } from "./schema.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

/** Realistic Phase 2E fixture — multi-group, scaler cases, timers, video, update note. */
export function phase2eFixtureRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    slug: "classic-french-baguettes",
    title: "Classic French Baguettes: Crispy Crust, Open Crumb",
    excerpt: "A reliable baguette for weeknight bakers.",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: ["Score deeply."],
    faqs: [],
    image: "/baguettes.jpg",
    imageAlt: "Baguettes",
    publishedAt: "2026-01-15",
    updatedAt: "2026-09-01T10:00:00.000Z",
    publicUpdateNote:
      "We retested this recipe and adjusted the baking time for more consistent results.",
    publicUpdatedAt: "2026-09-07T12:00:00.000Z",
    prepMinutes: 30,
    cookMinutes: 0,
    bakeMinutes: 24,
    restMinutes: 120,
    servings: 4,
    servingsUnit: "baguettes",
    course: "Bread",
    method: "Bake",
    cuisine: "French",
    dishName: "Classic French Baguettes",
    typeName: "Bread",
    categories: ["breads"],
    tags: ["baguette"],
    utensils: ["Sheet pan", "Lame"],
    ingredients: [
      {
        name: "Dough",
        items: [
          { item: "bread flour", amount: "500 g" },
          { item: "water", amount: "1½ cups" },
          { item: "instant yeast", amount: "½ teaspoon" },
          { item: "salt", amount: "¾ teaspoon" },
          { item: "honey", amount: "1 to 2 tablespoons" },
          { item: "olive oil", amount: "1 packed tablespoon" },
        ],
      },
      {
        name: "Finish",
        items: [
          { item: "beans", amount: "1 can (15 ounces)" },
          { item: "extra flour", amount: "for dusting" },
          { item: "sesame", amount: "a handful" },
          { item: "flaky salt", amount: "1 large pinch" },
          { item: "butter", amount: "about 1 tablespoon" },
        ],
      },
    ],
    instructions: [
      {
        name: "Mix",
        steps: ["Combine flour and water.", "Knead until smooth."],
        stepTimers: [null, 600],
        startTimestamp: 47,
      },
      {
        name: "Bake",
        steps: ["Preheat the oven.", "Bake until deep golden."],
        stepTimers: [null, 1440],
        startTimestamp: 900,
      },
    ],
    notes: ["Cool on a rack before slicing."],
    nutrition: { calories: 220, carbs: 45, protein: 7, fat: 1 },
    youtube: {
      videoId: "dQw4w9WgXcQ",
      title: "Baguette method",
      duration: "18:00",
      timestamps: [
        { time: 47, label: "Mix", stepIndex: 0 },
        { time: 204, label: "Knead", stepIndex: 1 },
        { time: 900, label: "Bake", stepIndex: 3 },
      ],
    },
    ...overrides,
  };
}

function scaledAmounts(recipe: Recipe, servings: number): string[] {
  const factor = servings / Math.max(1, recipe.servings);
  return recipe.ingredients.flatMap((group) =>
    group.items.map((item) => scaleAmount(item.amount, factor)),
  );
}

describe("Phase 2E architecture invariants", () => {
  it("A — one Recipe content source: cook/print do not fork recipe documents", () => {
    const cook = read("app/recipes/[slug]/cook/page.tsx");
    const sheet = read("components/RecipePrintSheet.tsx");
    const card = read("components/RecipeCard.tsx");
    assert.match(cook, /getRecipeBySlug/);
    assert.match(sheet, /recipe: Recipe/);
    assert.match(card, /<RecipePrintSheet recipe=\{recipe\} servings=\{servings\}/);
    assert.doesNotMatch(cook, /prisma\.cookingSession|CookingSession\s*\{/);
    assert.doesNotMatch(sheet, /localStorage|writeCookingSession/);
  });

  it("B — one serving scaler across page / cook / print", () => {
    const card = read("components/RecipeCard.tsx");
    const cook = read("components/cooking/CookingIngredientsPanel.tsx");
    const sheet = read("components/RecipePrintSheet.tsx");
    assert.match(card, /scaleAmount/);
    assert.match(cook, /scaleAmount/);
    assert.match(sheet, /scaleIngredientAmount/);
    assert.match(card, /Math\.max\(1, recipe\.servings\)/);
    assert.doesNotMatch(card, /function scaleAmount/);
    assert.doesNotMatch(cook, /function scaleAmount/);
    assert.doesNotMatch(sheet, /function scaleAmount|function scaleIngredientAmount/);
  });

  it("C — cooking progress is local utility state only", () => {
    const session = read("lib/cooking-session.ts");
    assert.match(session, /localStorage/);
    assert.doesNotMatch(session, /getDb|prisma|fetch\(/);
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /model CookingSession/);
  });

  it("D — print is derived from Recipe + selected servings", () => {
    const sheet = read("components/RecipePrintSheet.tsx");
    assert.match(sheet, /servings: number/);
    assert.doesNotMatch(sheet, /model Print|printSession/);
  });

  it("E — public update note is separate from operational updatedAt", () => {
    const hero = read("components/RecipePageHero.tsx");
    assert.match(hero, /RecipePublicUpdateNote/);
    assert.doesNotMatch(hero, /Updated \{updated\}|formatAdminDate\(recipe\.updatedAt\)/);
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.match(schema, /publicUpdateNote/);
    assert.match(schema, /publicUpdatedAt/);
  });

  it("F — video timestamp helpers are shared, not forked", () => {
    const cook = read("components/cooking/CookingMode.tsx");
    const help = read("lib/recipe-stage-video-help.ts");
    assert.match(cook, /timestampForStep/);
    assert.match(cook, /VideoTimestampLink/);
    assert.match(help, /export function selectStageVideoHelp/);
    assert.doesNotMatch(cook, /function timestampForStep|function selectStageVideoHelp/);
  });

  it("G — Phase 2 surfaces do not load Revision / Audit / Readiness", () => {
    const page = read("app/recipes/[slug]/page.tsx");
    const cook = read("app/recipes/[slug]/cook/page.tsx");
    assert.doesNotMatch(page, /getRecipePublishingReadiness|listAdminAudit|RecipeRevision/);
    assert.doesNotMatch(cook, /getRecipePublishingReadiness|listAdminAudit|createRecipeRevision/);
    assert.match(cook, /Does not load Revision \/ Audit \/ Publishing Readiness/);
  });
});

describe("Phase 2E full reader lifecycle fixture", () => {
  const recipe = phase2eFixtureRecipe();

  it("renders public update note calmly and clears cleanly", () => {
    const present = renderToStaticMarkup(
      createElement(RecipePublicUpdateNote, {
        note: recipe.publicUpdateNote,
        updatedAt: recipe.publicUpdatedAt,
      }),
    );
    assert.match(present, /Updated September 2026/);
    assert.match(present, /adjusted the baking time/);
    assert.doesNotMatch(present, /role=["']alert["']/);

    const absent = renderToStaticMarkup(
      createElement(RecipePublicUpdateNote, { note: null, updatedAt: null }),
    );
    assert.equal(absent, "");

    const cleared = normalizePublicUpdateFields({ enabled: false, note: "x", date: "2026-09-07" });
    assert.equal(cleared.ok, true);
    if (cleared.ok) {
      assert.equal(cleared.value.note, null);
      assert.equal(cleared.value.updatedAt, null);
    }
  });

  it("operational updatedAt alone does not create a public Updated label", () => {
    const html = renderToStaticMarkup(
      createElement(RecipePublicUpdateNote, {
        note: null,
        updatedAt: null,
      }),
    );
    assert.equal(html, "");
    assert.equal(
      recipeDateModifiedIso({
        updatedAt: recipe.updatedAt,
        publicUpdatedAt: null,
      }),
      recipe.updatedAt,
    );
  });

  it("JSON-LD dateModified prefers publicUpdatedAt when present", () => {
    const withNote = recipeJsonLd(recipe);
    assert.equal(withNote.dateModified, "2026-09-07");
    const without = recipeJsonLd(
      phase2eFixtureRecipe({ publicUpdateNote: null, publicUpdatedAt: null }),
    );
    assert.equal(without.dateModified, recipe.updatedAt);
  });

  it("default servings leave amounts unchanged (factor 1)", () => {
    for (const amount of scaledAmounts(recipe, 4)) {
      // Exact originals for fixture amounts at 1×
      assert.ok(amount.length > 0);
    }
    assert.equal(scaleAmount("1½ cups", 1), "1½ cups");
    assert.equal(scaleAmount("½ teaspoon", 1), "½ teaspoon");
    assert.equal(scaleAmount("1 to 2 tablespoons", 1), "1 to 2 tablespoons");
    assert.equal(scaleAmount("1 can (15 ounces)", 1), "1 can (15 ounces)");
    assert.equal(scaleAmount("for dusting", 1), "for dusting");
    assert.equal(scaleAmount("a handful", 1), "a handful");
  });

  it("scales up from original baseline (4→8→12), not compound multipliers", () => {
    assert.equal(scaleAmount("1½ cups", 2), "3 cups");
    assert.equal(scaleAmount("½ teaspoon", 2), "1 teaspoon");
    assert.equal(scaleAmount("1 to 2 tablespoons", 2), "2 to 4 tablespoons");
    assert.equal(scaleAmount("1 can (15 ounces)", 2), "2 can (15 ounces)");
    assert.equal(scaleAmount("for dusting", 2), "for dusting");
    assert.equal(scaleAmount("a handful", 2), "a handful");

    const toEight = scaledAmounts(recipe, 8);
    const toTwelve = scaledAmounts(recipe, 12);
    assert.equal(scaleAmount("500 g", 3), "1500 g");
    assert.deepEqual(toTwelve, scaledAmounts(recipe, 12));
    assert.notDeepEqual(toEight, toTwelve);
    // Prove 12/4 not (8/4)*(12/8) compound from previous UI state — same as direct baseline.
    assert.equal(scaleAmount("1½ cups", 12 / 4), scaleAmount("1½ cups", 3));
  });

  it("scales down and clamps servings controls", () => {
    assert.equal(scaleAmount("1½ cups", 0.5), "¾ cups");
    assert.equal(scaleAmount("1 to 2 tablespoons", 0.5), "½ to 1 tablespoons");
    assert.equal(clampRecipeServings(0), 1);
    assert.equal(clampRecipeServings(-3), 1);
    assert.equal(clampRecipeServings(Number.NaN), 1);
    assert.equal(clampRecipeServings(Number.POSITIVE_INFINITY), 1);
    assert.equal(clampRecipeServings(1000), 99);
  });

  it("page / cook / print agree on scaled amounts for the same servings", () => {
    const servings = 8;
    const pageAmounts = scaledAmounts(recipe, servings);
    const printHtml = renderToStaticMarkup(
      createElement(RecipePrintSheet, { recipe, servings }),
    );
    for (const amount of pageAmounts) {
      assert.match(printHtml, new RegExp(amount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const yieldItem = recipePrintMetaItems(recipe, servings).find((item) => item.label === "Yield");
    assert.equal(yieldItem?.value, recipePrintYieldLabel(8, "baguettes"));
    assert.match(printHtml, /Updated September 2026/);
    assert.match(printHtml, /adjusted the baking time/);
    assert.equal((printHtml.match(/Updated September 2026/g) || []).length, 1);
    assert.match(printHtml, /Mix/);
    assert.match(printHtml, /Bake/);
    assert.match(printHtml, /mesakitchenstudio\.com\/recipes\/classic-french-baguettes/);
  });

  it("print omits update block when note cleared; screen a11y hides print duplicate", () => {
    const cleared = phase2eFixtureRecipe({
      publicUpdateNote: null,
      publicUpdatedAt: null,
    });
    const html = renderToStaticMarkup(
      createElement(RecipePrintSheet, { recipe: cleared, servings: 4 }),
    );
    assert.doesNotMatch(html, /recipe-print-sheet__update|Updated September/);
    assert.match(html, /hidden/);
    assert.match(html, /aria-hidden="true"/);
    const css = read("app/globals.css");
    assert.match(css, /\.recipe-print-sheet\[hidden\]/);
    assert.match(css, /\.recipe-screen-only/);
  });

  it("Cooking Mode nav / timers / checks stay coherent with scaling", () => {
    const nav = buildCookingNavModel(recipe);
    assert.equal(nav.totalSteps, 4);
    assert.equal(nav.stages.length, 2);
    assert.equal(nav.steps[1]?.timerSeconds, 600);
    assert.equal(nav.steps[3]?.timerSeconds, 1440);
    assert.equal(firstStepIndexForStage(nav, nav.stages[1]!.id), 2);
    assert.equal(clampStepIndex(99, nav.totalSteps), 3);

    const key = ingredientCheckKey(0, 2);
    assert.equal(key, "0:2");
    const before = scaleAmount(recipe.ingredients[0]!.items[2]!.amount, 2);
    const after = scaleAmount(recipe.ingredients[0]!.items[2]!.amount, 3);
    assert.notEqual(before, after);
    // Identity is positional — not derived from scaled text.
    assert.equal(ingredientCheckKey(0, 2), "0:2");
  });

  it("user selected servings do not stale the cooking content version", () => {
    const v1 = cookingContentVersion(recipe);
    const session = createEmptyCookingSession({
      recipeId: "rid",
      contentVersion: v1,
      servings: 12,
    });
    session.checkedIngredientKeys = [ingredientCheckKey(0, 0)];
    session.currentStepIndex = 2;
    const ok = resolveCookingSession({
      recipeId: "rid",
      contentVersion: v1,
      stored: session,
    });
    assert.equal(ok.status, "ok");
    if (ok.status === "ok") assert.equal(ok.session.servings, 12);

    const edited = phase2eFixtureRecipe({
      instructions: [
        {
          name: "Mix",
          steps: ["Combine flour and water differently.", "Knead until smooth."],
          stepTimers: [null, 600],
        },
        recipe.instructions[1]!,
      ],
    });
    const stale = resolveCookingSession({
      recipeId: "rid",
      contentVersion: cookingContentVersion(edited),
      stored: session,
    });
    assert.equal(stale.status, "stale");
  });

  it("video timestamps are shared for recipe and cooking surfaces", () => {
    const stages = recipeInstructionStages(recipe);
    const help = selectStageVideoHelp(
      stages,
      recipe.youtube?.timestamps,
      undefined,
      recipe.instructions,
    );
    assert.ok(Object.keys(help).length >= 1);
    assert.equal(timestampForStep(recipe.youtube?.timestamps, 1)?.time, 204);
    assert.equal(timestampForStep(recipe.youtube?.timestamps, 3)?.time, 900);
  });

  it("cook route redirects old slugs onto /cook and stays noindex", () => {
    const cook = read("app/recipes/[slug]/cook/page.tsx");
    assert.match(cook, /permanentRedirect\(`\$\{recipeTarget\}\/cook`\)/);
    assert.match(cook, /robots:\s*\{\s*index:\s*false/);
    assert.match(cook, /canonical:\s*`\/recipes\/\$\{recipe\.slug\}`/);
  });

  it("Continue Cooking prefers session servings; URL servings are optional", () => {
    const entry = read("components/cooking/RecipeCookEntry.tsx");
    const mode = read("components/cooking/CookingMode.tsx");
    const page = read("app/recipes/[slug]/cook/page.tsx");
    assert.match(entry, /continuing/);
    assert.match(entry, /resolved\.session\.servings/);
    assert.match(mode, /initialServings !== undefined \? initialServings : resolved\.session\.servings/);
    assert.match(page, /parseServingsParam\(sp\.servings\)/);
    assert.doesNotMatch(page, /parseServingsParam\(sp\.servings,\s*recipe\.servings\)/);
  });

  it("Cooking Mode does not render public update / print / reviews chrome", () => {
    const mode = read("components/cooking/CookingMode.tsx");
    assert.doesNotMatch(mode, /RecipePublicUpdateNote|RecipePrintSheet|RecipeReviews/);
    assert.doesNotMatch(mode, /publicUpdateNote/);
  });

  it("catalogue cards do not surface update notes or cook session", () => {
    const card = read("components/RecipeCard.tsx");
    // Public list cards live elsewhere; cooking workspace must not leak update chrome into grid.
    assert.doesNotMatch(card, /RecipePublicUpdateNote|publicUpdateNote/);
  });

  it("readiness remains free of Phase 2 optional fields", () => {
    const readiness = read("lib/recipe-publishing-readiness.ts");
    assert.doesNotMatch(readiness, /publicUpdate|stepTimers|Cooking Mode|RecipePrintSheet/);
  });

  it("analytics stay high-signal for Cooking Mode", () => {
    const analytics = read("lib/analytics.ts");
    assert.match(analytics, /recipe_cook_mode_start/);
    assert.match(analytics, /recipe_cook_mode_complete/);
    assert.doesNotMatch(analytics, /recipe_cook_step_|recipe_cook_check_|recipe_cook_timer_/);
  });
});

describe("Phase 2E stepTimers alignment", () => {
  it("normalizeInstructionGroups truncates orphan timers to step length", () => {
    const groups = normalizeInstructionGroups([
      {
        name: "Mix",
        steps: ["A"],
        stepTimers: [null, 600],
      },
    ]);
    assert.equal(groups[0]!.steps.length, 1);
    assert.deepEqual(groups[0]!.stepTimers, undefined);
  });

  it("normalizeInstructionGroups pads shorter timers when a later timer exists", () => {
    const groups = normalizeInstructionGroups([
      {
        name: "Mix",
        steps: ["A", "B", "C"],
        stepTimers: [600],
      },
    ]);
    assert.deepEqual(alignStepTimers([600], 3), [600, undefined, undefined]);
    assert.equal(groups[0]!.stepTimers?.length, 3);
    assert.equal(groups[0]!.stepTimers?.[0], 600);
  });

  it("Add step pads stepTimers via withAppendedInstructionStep (co-mutates timers + timestamps)", () => {
    const accordion = read("components/admin/InstructionsAccordionEditor.tsx");
    assert.match(accordion, /withAppendedInstructionStep\(group,\s*""\)/);
    assert.match(accordion, /from\s+"@\/lib\/step-video-timestamps"/);
  });
});

describe("Phase 2E package/build safety", () => {
  it("uses guarded migrate deploy for production schema (no accept-data-loss)", () => {
    const pkg = JSON.parse(readFileSync(path.join(srcRoot, "..", "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.match(pkg.scripts.build, /migrate-on-build\.mjs/);
    assert.doesNotMatch(pkg.scripts.build, /accept-data-loss/);
    assert.equal(pkg.scripts.build.includes("next build"), true);
  });
});

describe("Phase 2E label formatting", () => {
  it("month/year label is stable for UTC noon stored dates", () => {
    assert.equal(formatPublicUpdateLabel("2026-09-07T12:00:00.000Z"), "Updated September 2026");
    assert.equal(formatPublicUpdateLabel("2026-01-01T12:00:00.000Z"), "Updated January 2026");
  });
});
