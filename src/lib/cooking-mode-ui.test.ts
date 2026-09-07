import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("cooking mode route / entry architecture", () => {
  it("exposes Start Cooking entry on the recipe hero actions", () => {
    const heroActions = read("components/RecipePageHeroActions.tsx");
    assert.match(heroActions, /RecipeCookEntry/);
    const entry = read("components/cooking/RecipeCookEntry.tsx");
    assert.match(entry, /Start Cooking/);
    assert.match(entry, /Continue Cooking/);
    assert.match(entry, /data-testid="recipe-cook-entry"/);
    assert.doesNotMatch(entry, /CookingMode/);
  });

  it("adds dedicated /recipes/[slug]/cook route with noindex and canonical recipe URL", () => {
    const page = read("app/recipes/[slug]/cook/page.tsx");
    assert.match(page, /robots:\s*\{\s*index:\s*false/);
    assert.match(page, /canonical:\s*`\/recipes\/\$\{recipe\.slug\}`/);
    assert.match(page, /CookingMode/);
    assert.match(page, /getRecipeBySlug/);
    assert.doesNotMatch(page, /getRecipePublishingReadiness/);
    assert.doesNotMatch(page, /RecipeRevision|recordAdminAudit|listRecipeRevisions/);
    assert.doesNotMatch(page, /recipeJsonLd/);
  });

  it("redirects old slug cook requests via existing recipe redirects", () => {
    const page = read("app/recipes/[slug]/cook/page.tsx");
    assert.match(page, /resolveActiveRedirect\(recipePublicPath\(slug\)\)/);
    assert.match(page, /permanentRedirect\(`\$\{recipeTarget\}\/cook`\)/);
  });

  it("Exit returns to the normal recipe path", () => {
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(mode, /href=\{recipePath\}/);
    assert.match(mode, />\s*Exit\s*</);
    assert.match(mode, /Back to recipe/);
  });

  it("hides public chrome on cooking mode for a focused shell", () => {
    const chrome = read("components/PublicChrome.tsx");
    assert.match(chrome, /onCookingMode/);
    assert.ok(chrome.includes("!onCookingMode"));
    assert.ok(chrome.includes("/cook"));
  });

  it("does not load cooking stack on the ordinary recipe page", () => {
    const recipePage = read("app/recipes/[slug]/page.tsx");
    assert.doesNotMatch(recipePage, /CookingMode|cooking-session|useKeepScreenAwake/);
    assert.match(read("components/RecipePageHero.tsx"), /RecipePageHeroActions/);
  });
});

describe("cooking mode UX contracts", () => {
  it("navigates stages/steps with Finish cooking and Start over confirmation", () => {
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(mode, /Finish cooking/);
    assert.match(mode, /Previous/);
    assert.match(mode, /Start over/);
    assert.match(mode, /alertdialog/);
    assert.match(mode, /Keep screen awake/);
    assert.match(mode, /Watch the full method/);
    assert.match(mode, /ArrowRight|ArrowLeft/);
    assert.match(mode, /stepHeadingRef/);
    assert.match(mode, /recipe_cook_mode_start/);
    assert.match(mode, /recipe_cook_mode_complete/);
  });

  it("reuses VideoTimestampLink and existing scaler", () => {
    const mode = read("components/cooking/CookingMode.tsx");
    assert.match(mode, /VideoTimestampLink/);
    assert.match(mode, /timestampForStep/);
    assert.match(mode, /selectStageVideoHelp|stageVideoHelp/);
    const ingredients = read("components/cooking/CookingIngredientsPanel.tsx");
    assert.match(ingredients, /scaleAmount/);
    assert.match(ingredients, /type="checkbox"/);
  });

  it("supports optional admin step timers without requiring them for publish", () => {
    const editor = read("components/admin/InstructionsAccordionEditor.tsx");
    assert.match(editor, /minutes \(optional\)/);
    assert.match(editor, /withStepTimerMinutes/);
    assert.match(editor, /stepTimers/);
    const readiness = read("lib/recipe-publishing-readiness.ts");
    assert.doesNotMatch(readiness, /stepTimers|timerSeconds/);
  });
});
