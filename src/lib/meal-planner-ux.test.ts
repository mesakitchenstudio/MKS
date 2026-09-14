/**
 * Phase 5F — Meal Planner UX / a11y / responsive polish wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { mealPlanErrorMessage } from "./meal-planner.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

describe("Phase 5F — UX polish wiring", () => {
  it("uses day-strip through tablet and seven columns from lg", () => {
    const view = readRepo("src/components/MealPlannerView.tsx");
    assert.match(view, /lg:hidden/);
    assert.match(view, /lg:grid lg:grid-cols-7/);
    assert.doesNotMatch(view, /md:grid md:grid-cols-7/);
    assert.match(view, /Your week is ready/);
    assert.match(view, /Add a meal to start planning/);
    assert.match(view, /Nothing was changed|commitMealPlanShoppingBatch/);
    assert.match(view, /Planning note/);
    assert.match(view, /Planned servings/);
    assert.match(view, /aria-label=\{`Edit \$\{item\.recipeTitle\}`\}/);
    assert.match(view, /aria-label=\{`Remove \$\{item\.recipeTitle\} from plan`\}/);
    assert.match(view, /scrollIntoView/);
    assert.match(view, /data-day-tab/);
    assert.match(view, /Open Profile to sign in/);
    assert.match(view, /Your recipes and Shopping List are not affected/);
    assert.match(view, /will be updated to the planned servings/);
    assert.match(view, /No published recipes match that search/);
  });

  it("maps planner errors with friendly copy", () => {
    assert.match(mealPlanErrorMessage("NOT_AUTHENTICATED"), /Profile/);
    assert.match(mealPlanErrorMessage("INVALID_DATE"), /valid date/i);
    assert.match(mealPlanErrorMessage("INVALID_NOTE"), /Planning notes/);
    assert.match(mealPlanErrorMessage("INVALID_SLOT"), /breakfast/i);
    assert.match(mealPlanErrorMessage("RECIPE_NOT_AVAILABLE"), /no longer available/);
  });

  it("keeps Recipe Add sheet private planning note labeling", () => {
    const sheet = readRepo("src/components/AddRecipeToMealPlanButton.tsx");
    assert.match(sheet, /Planning note/);
    assert.match(sheet, /optional, private/);
    assert.match(sheet, /mesa-open-auth/);
  });

  it("atomic shopping failures prefix unchanged storage wording", () => {
    const client = readRepo("src/lib/meal-planner-shopping-client.ts");
    assert.match(client, /Nothing was changed/);
    assert.match(client, /saveShoppingListState\(applied\.state\)/);
    assert.doesNotMatch(client, /could not be added/);
  });

  it("bootstrap loading remains concise and gated routes stay noindex", () => {
    const boot = readRepo("src/components/MealPlannerWeekBootstrap.tsx");
    assert.match(boot, /Opening your week/);
    assert.doesNotMatch(boot, /Loading your week…/);
    const plan = readRepo("src/app/profile/meal-planner/[planId]/page.tsx");
    assert.match(plan, /robots:\s*\{\s*index:\s*false/);
    assert.doesNotMatch(plan, /NEXT_PUBLIC_MEAL_PLANNER/);
  });
});
