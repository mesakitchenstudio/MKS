/**
 * Phase 5C — Meal Planner week helpers + route/gate wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  MEAL_PLAN_DEFAULT_NAME,
  addCivilDays,
  endOfWeekSunday,
  formatMealPlanWeekRangeLabel,
  isDateInMealPlanWeek,
  mealPlanErrorMessage,
  mealPlanWeekDates,
  nextMealPlanWeekStart,
  parseMealPlanWeekParam,
  previousMealPlanWeekStart,
  startOfWeekMonday,
} from "./meal-planner.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

describe("Phase 5C week model (Monday–Sunday)", () => {
  it("computes Monday start and Sunday end", () => {
    // 2026-09-14 is a Monday
    assert.equal(startOfWeekMonday("2026-09-14"), "2026-09-14");
    assert.equal(endOfWeekSunday("2026-09-14"), "2026-09-20");
    // Wednesday snaps to Monday
    assert.equal(startOfWeekMonday("2026-09-16"), "2026-09-14");
    // Sunday snaps to prior Monday
    assert.equal(startOfWeekMonday("2026-09-20"), "2026-09-14");
  });

  it("lists seven days and previous/next weeks", () => {
    assert.deepEqual(mealPlanWeekDates("2026-09-14"), [
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    assert.equal(previousMealPlanWeekStart("2026-09-14"), "2026-09-07");
    assert.equal(nextMealPlanWeekStart("2026-09-14"), "2026-09-21");
    assert.equal(isDateInMealPlanWeek("2026-09-17", "2026-09-14"), true);
    assert.equal(isDateInMealPlanWeek("2026-09-21", "2026-09-14"), false);
  });

  it("parses week URL param and rejects malformed / out of horizon", () => {
    const ok = parseMealPlanWeekParam("2026-09-16", "2026-09-14");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.weekStart, "2026-09-14");

    assert.equal(parseMealPlanWeekParam("09/14/2026").ok, false);
    assert.equal(parseMealPlanWeekParam("2026-02-30").ok, false);

    const far = parseMealPlanWeekParam("2028-09-14", "2026-09-14");
    assert.equal(far.ok, false);
    if (!far.ok) assert.equal(far.error, "DATE_OUT_OF_RANGE");
  });

  it("formats week range label and civil day math", () => {
    assert.equal(formatMealPlanWeekRangeLabel("2026-09-14"), "Sep 14–20, 2026");
    assert.equal(addCivilDays("2026-09-14", 6), "2026-09-20");
    assert.equal(addCivilDays("2026-01-01", -1), "2025-12-31");
  });

  it("maps limit errors for UI", () => {
    assert.match(mealPlanErrorMessage("DUPLICATE_PLAN_NAME"), /already have/);
    assert.match(mealPlanErrorMessage("PLAN_LIMIT_REACHED"), /20/);
    assert.match(mealPlanErrorMessage("DATE_ITEM_LIMIT_REACHED"), /20 meals/);
    assert.match(mealPlanErrorMessage("RECIPE_NOT_AVAILABLE"), /no longer available/);
    assert.equal(MEAL_PLAN_DEFAULT_NAME, "My Meal Plan");
  });
});

describe("Phase 5C routes / gate / indexing", () => {
  it("gates planner routes and uses noindex", () => {
    const hub = readRepo("src/app/profile/meal-planner/page.tsx");
    const plan = readRepo("src/app/profile/meal-planner/[planId]/page.tsx");
    assert.match(hub, /isMealPlannerEnabled/);
    assert.match(hub, /notFound\(\)/);
    assert.match(hub, /ensureDefaultMealPlanForUser/);
    assert.match(hub, /robots:\s*\{\s*index:\s*false/);
    assert.match(plan, /isMealPlannerEnabled/);
    assert.match(plan, /notFound\(\)/);
    assert.match(plan, /robots:\s*\{\s*index:\s*false/);
    assert.match(plan, /redirect\("\/profile"\)/);
    assert.match(plan, /listMealPlanItemsForUser/);
    assert.match(plan, /fromDate:\s*weekStart/);
  });

  it("shows gated Profile / AccountMenu entry via server prop only", () => {
    const profile = readRepo("src/app/profile/page.tsx");
    const menu = readRepo("src/components/AccountMenu.tsx");
    const layout = readRepo("src/app/layout.tsx");
    const chrome = readRepo("src/components/PublicChrome.tsx");
    const header = readRepo("src/components/SiteHeader.tsx");
    const view = readRepo("src/components/MealPlannerView.tsx");
    const gate = readRepo("src/lib/meal-planner.ts");

    assert.match(profile, /isMealPlannerEnabled\(\)/);
    assert.match(profile, /\/profile\/meal-planner/);
    assert.match(layout, /mealPlannerEnabled=\{isMealPlannerEnabled\(\)\}/);
    assert.match(chrome, /mealPlannerEnabled/);
    assert.match(header, /mealPlannerEnabled=\{mealPlannerEnabled\}/);
    assert.match(menu, /mealPlannerEnabled/);
    assert.match(menu, /Meal Planner/);
    assert.doesNotMatch(menu, /NEXT_PUBLIC_MEAL_PLANNER_ENABLED|process\.env\.MEAL_PLANNER/);
    assert.doesNotMatch(view, /NEXT_PUBLIC_MEAL_PLANNER_ENABLED|process\.env\.MEAL_PLANNER/);
    assert.match(gate, /MEAL_PLANNER_ENABLED === "true"/);
    assert.doesNotMatch(gate, /NEXT_PUBLIC_MEAL_PLANNER_ENABLED/);
    assert.doesNotMatch(view, /shopping-list|Add day to Shopping|meal_plan_/);
    assert.doesNotMatch(readRepo("src/components/RecipeFloatTools.tsx"), /meal-planner|Meal Planner/);
  });

  it("documents gate OFF vs ON navigation/route contract", () => {
    const hub = readRepo("src/app/profile/meal-planner/page.tsx");
    const plan = readRepo("src/app/profile/meal-planner/[planId]/page.tsx");
    const profile = readRepo("src/app/profile/page.tsx");
    const menu = readRepo("src/components/AccountMenu.tsx");
    const actions = readRepo("src/app/profile/meal-plan-actions.ts");

    // Gate OFF: routes notFound, nav conditional, actions FEATURE_DISABLED
    assert.match(hub, /if \(!isMealPlannerEnabled\(\)\) notFound\(\)/);
    assert.match(plan, /if \(!isMealPlannerEnabled\(\)\) notFound\(\)/);
    assert.match(profile, /\{isMealPlannerEnabled\(\) \?/);
    assert.match(menu, /\{mealPlannerEnabled \?/);
    assert.match(actions, /FEATURE_DISABLED/);

    // Gate ON path for members: ensure + redirect; unauth redirect unchanged
    assert.match(hub, /ensureDefaultMealPlanForUser/);
    assert.match(hub, /redirect\(`\/profile\/meal-planner\/\$\{ensured\.data\.id\}`\)/);
    assert.match(hub, /redirect\("\/profile"\)/);
    assert.match(plan, /redirect\("\/profile"\)/);
  });

  it("revalidates planner paths and hardens copy for Published only", () => {
    const actions = readRepo("src/app/profile/meal-plan-actions.ts");
    const server = readRepo("src/lib/meal-planner-server.ts");
    assert.match(actions, /revalidatePath\("\/profile\/meal-planner"\)/);
    assert.match(actions, /deleteMealPlanAndSelectNextAction/);
    assert.match(server, /Copy creates a new meal entry/);
    assert.match(server, /status !== "published"/);
  });

  it("does not add planner to sitemap helpers", () => {
    // No dedicated sitemap entry for /profile/meal-planner
    const files = [
      "src/app/sitemap.ts",
      "src/app/robots.ts",
    ];
    for (const file of files) {
      try {
        const content = readRepo(file);
        assert.doesNotMatch(content, /meal-planner/);
      } catch {
        // optional file
      }
    }
  });
});
