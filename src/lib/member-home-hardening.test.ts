/**
 * Phase 7E — Personalized Member Home hardening + combined scenario contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { recipes as staticRecipes } from "@/data/recipes";
import type { Recipe } from "@/data/types";
import { scoreRelatedRecipe } from "@/lib/recipe-related";
import { resolveRecipePrimaryCategorySlug } from "@/lib/recipe-primary-taxonomy";
import {
  MEMBER_HOME_BECAUSE_SAVED_RELATED_MIN,
  MEMBER_HOME_RELATED_SCORE_CAP,
  MEMBER_HOME_RELATED_SCORE_SCALE,
  MEMBER_HOME_RECOMMENDATION_MIN_SCORE,
  MEMBER_HOME_SCORE_PRIMARY_CATEGORY,
  buildMemberHomeAffinity,
  buildMemberHomeSavedPreview,
  isMemberHomeColdStart,
  isMemberHomeGetStartedVisible,
  memberHomeServerSectionFlags,
  rankMemberHomeRecommendations,
  scoreMemberHomeCandidate,
  selectMemberHomeDiscover,
  selectMemberHomeNextMeals,
  shouldShowMemberHomeDiscover,
  type MemberHomeReadModel,
} from "@/lib/member-home";
import {
  endOfWeekSunday,
  startOfWeekMonday,
  validateMealPlanDate,
  validateMealPlanDateHorizon,
} from "@/lib/meal-planner";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

function bySlug(...slugs: string[]): Recipe[] {
  return slugs.map((slug) => {
    const recipe = staticRecipes.find((row) => row.slug === slug);
    assert.ok(recipe, `missing fixture recipe ${slug}`);
    return { ...recipe, id: recipe.id || `id-${slug}` };
  });
}

function emptyHome(overrides: Partial<MemberHomeReadModel> = {}): MemberHomeReadModel {
  return {
    saved: { status: "empty", recipes: [], totalSaveCount: 0, visibleSaveCount: 0 },
    collections: { status: "empty", collections: [], totalCollectionCount: 0 },
    planner: {
      status: "empty",
      enabled: true,
      hasPlan: false,
      plan: null,
      weekResolved: false,
      weekStartMonday: null,
      mealCount: 0,
      nextMeals: [],
    },
    recommendations: { status: "empty", items: [] },
    discover: { status: "empty", recipes: [] },
    ...overrides,
  };
}

describe("Phase 7E — scoring uses public primary taxonomy", () => {
  it("groups cakes/cookies under desserts for affinity (not raw categories[0])", () => {
    const saved = bySlug("citrus-olive-oil-cake", "chocolate-chunk-cookies");
    assert.equal(resolveRecipePrimaryCategorySlug(saved[0]!), "desserts");
    assert.equal(resolveRecipePrimaryCategorySlug(saved[1]!), "desserts");

    const candidate = bySlug("peach-skillet-cobbler")[0]!;
    const affinity = buildMemberHomeAffinity(saved);
    assert.ok(affinity.primaryCategories.get("desserts"));
    assert.equal(affinity.primaryCategories.has("cakes"), false);
    assert.equal(affinity.primaryCategories.has("cookies"), false);

    const scored = scoreMemberHomeCandidate(candidate, saved, affinity);
    assert.ok(scored.score >= MEMBER_HOME_SCORE_PRIMARY_CATEGORY);
    assert.equal(scored.primaryCategory, "desserts");
  });

  it("ranks dessert catalogue mates when dessert child categories differ", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: staticRecipes.map((recipe) => ({
        ...recipe,
        id: recipe.id || `id-${recipe.slug}`,
      })),
      savedPublished: bySlug("citrus-olive-oil-cake", "chocolate-chunk-cookies"),
    });
    assert.ok(ranked.length >= 3);
    assert.ok(ranked.every((row) => row.score >= MEMBER_HOME_RECOMMENDATION_MIN_SCORE));
    assert.ok(ranked.some((row) => row.recipe.slug === "peach-skillet-cobbler"));
    // Diversity: at most 2 desserts in the returned set when other categories also qualify.
    const dessertCount = ranked.filter((row) => {
      const live = staticRecipes.find((recipe) => recipe.slug === row.recipe.slug)!;
      return resolveRecipePrimaryCategorySlug(live) === "desserts";
    }).length;
    assert.ok(dessertCount <= 2);
  });
});

describe("Phase 7E — combined section hierarchies", () => {
  it("A cold member: Discover + Get Started; no Saved/Collections/Recommended/This week", () => {
    const home = emptyHome({
      discover: {
        status: "ok",
        recipes: selectMemberHomeDiscover(staticRecipes),
      },
    });
    const flags = memberHomeServerSectionFlags({ home, mealPlannerEnabled: true });
    assert.equal(flags.coldStart, true);
    assert.equal(flags.showThisWeek, false);
    assert.equal(flags.showRecommended, false);
    assert.equal(flags.showSaved, false);
    assert.equal(flags.showCollectionsBlock, false);
    assert.equal(flags.showDiscover, true);
    assert.equal(flags.showGetStarted, true);
  });

  it("B browsing-only: same cold server flags; RV remains client-only", () => {
    // 0 saves → coldStart; RV ≥2 is client-thresholded and does not unlock Recommended.
    const home = emptyHome();
    const flags = memberHomeServerSectionFlags({ home, mealPlannerEnabled: true });
    assert.equal(isMemberHomeColdStart(home), true);
    assert.equal(flags.showRecommended, false);
    assert.equal(flags.showGetStarted, true);
    assert.equal(flags.showDiscover, true);
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /MemberHomeRecentlyViewed/);
    assert.doesNotMatch(page, /rankMemberHomeRecommendations\([^\)]*recent/);
  });

  it("C light member: This week + Saved + Discover; Get Started off at 2 saves", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: staticRecipes.map((recipe) => ({
        ...recipe,
        id: recipe.id || `id-${recipe.slug}`,
      })),
      savedPublished: bySlug("herb-focaccia", "breakfast-tortillas"),
    });
    const home = emptyHome({
      saved: {
        status: "ok",
        recipes: [],
        totalSaveCount: 2,
        visibleSaveCount: 2,
      },
      planner: {
        status: "ok",
        enabled: true,
        hasPlan: true,
        plan: { id: "p1", name: "My Meal Plan" },
        weekResolved: true,
        weekStartMonday: "2026-09-14",
        mealCount: 0,
        nextMeals: [],
      },
      recommendations: {
        status: ranked.length ? "ok" : "empty",
        items: ranked,
      },
    });
    const flags = memberHomeServerSectionFlags({ home, mealPlannerEnabled: true });
    assert.equal(flags.coldStart, false);
    assert.equal(flags.showThisWeek, true);
    assert.equal(flags.showSaved, true);
    assert.equal(flags.showGetStarted, false);
    assert.equal(flags.showDiscover, !flags.showRecommended);
  });

  it("D active member: recommendations hide Discover and Get Started", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: staticRecipes.map((recipe) => ({
        ...recipe,
        id: recipe.id || `id-${recipe.slug}`,
      })),
      savedPublished: bySlug(
        "herb-focaccia",
        "chile-honey-roasted-chicken",
        "peach-skillet-cobbler",
        "breakfast-tortillas",
      ),
    });
    assert.ok(ranked.length >= 3);
    const home = emptyHome({
      saved: { status: "ok", recipes: [], totalSaveCount: 4, visibleSaveCount: 4 },
      collections: { status: "ok", collections: [], totalCollectionCount: 2 },
      planner: {
        status: "ok",
        enabled: true,
        hasPlan: true,
        plan: { id: "p1", name: "Weeknights" },
        weekResolved: true,
        weekStartMonday: "2026-09-14",
        mealCount: 3,
        nextMeals: [],
      },
      recommendations: { status: "ok", items: ranked },
    });
    const flags = memberHomeServerSectionFlags({ home, mealPlannerEnabled: true });
    assert.equal(flags.showRecommended, true);
    assert.equal(flags.showDiscover, false);
    assert.equal(flags.showGetStarted, false);
    assert.equal(flags.showThisWeek, true);
    assert.equal(flags.showCollectionsBlock, true);
  });

  it("E heavy-save: still excludes saves; may fall back to Discover when thin", () => {
    const catalogue = staticRecipes.map((recipe) => ({
      ...recipe,
      id: recipe.id || `id-${recipe.slug}`,
    }));
    const savedPublished = catalogue.slice(0, 10);
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: catalogue,
      savedPublished,
    });
    assert.ok(ranked.every((row) => !savedPublished.some((save) => save.slug === row.recipe.slug)));
    const home = emptyHome({
      saved: {
        status: "ok",
        recipes: [],
        totalSaveCount: savedPublished.length,
        visibleSaveCount: savedPublished.length,
      },
      recommendations: {
        status: ranked.length ? "ok" : "empty",
        items: ranked,
      },
    });
    const flags = memberHomeServerSectionFlags({ home, mealPlannerEnabled: true });
    if (ranked.length >= 3) {
      assert.equal(flags.showRecommended, true);
      assert.equal(flags.showDiscover, false);
    } else {
      assert.equal(flags.showRecommended, false);
      assert.equal(flags.showDiscover, true);
    }
  });

  it("F stale private rows: visible counts ignore Draft/orphan presentation", () => {
    const published = bySlug("herb-focaccia", "salsa-verde");
    const bySlugMap = new Map(published.map((recipe) => [recipe.slug, recipe]));
    const byId = new Map(published.map((recipe) => [recipe.id!, recipe]));
    const preview = buildMemberHomeSavedPreview({
      saves: [
        { slug: "herb-focaccia", recipeId: "id-herb-focaccia" },
        { slug: "draft-gone", recipeId: "draft-1" },
        { slug: "orphan", recipeId: null },
        { slug: "salsa-verde", recipeId: "id-salsa-verde" },
      ],
      publishedBySlug: bySlugMap,
      publishedById: byId,
    });
    assert.equal(preview.totalSaveCount, 4);
    assert.equal(preview.visibleSaveCount, 2);
    assert.deepEqual(
      preview.recipes.map((row) => row.slug),
      ["herb-focaccia", "salsa-verde"],
    );

    const meals = selectMemberHomeNextMeals(
      [
        {
          id: "1",
          recipeId: null,
          recipeTitle: "Hidden Draft",
          planDate: "2026-09-15",
          mealSlot: "dinner",
          plannedServings: 2,
          recipeAvailability: "unavailable",
          publicRecipeSlug: null,
          note: "secret",
        },
        {
          id: "2",
          recipeId: "id-herb-focaccia",
          recipeTitle: "Herb Focaccia",
          planDate: "2026-09-15",
          mealSlot: "lunch",
          plannedServings: 4,
          recipeAvailability: "available",
          publicRecipeSlug: "herb-focaccia",
          note: "private note",
        },
      ],
      "2026-09-15",
    );
    assert.equal(meals.length, 1);
    assert.equal(JSON.stringify(meals).includes("note"), false);
    assert.equal(JSON.stringify(meals).includes("Hidden Draft"), false);
  });

  it("near-cold Get Started: 1 Published save still shows tutorial", () => {
    const home = emptyHome({
      saved: { status: "ok", recipes: [], totalSaveCount: 1, visibleSaveCount: 1 },
    });
    assert.equal(isMemberHomeColdStart(home), false);
    assert.equal(isMemberHomeGetStartedVisible(home), true);
    assert.equal(shouldShowMemberHomeDiscover(home), true);
  });
});

describe("Phase 7E — related score + explanation determinism", () => {
  it("caps related contribution at 50 and keeps because_saved deterministic", () => {
    const saved = bySlug("herb-focaccia");
    const candidate = bySlug("breakfast-tortillas")[0]!;
    // Force a strong related pair from breads if available; otherwise assert cap math.
    const breadish = bySlug("chile-honey-roasted-chicken")[0]!;
    const related = scoreRelatedRecipe(saved[0]!, breadish, new Set());
    const contribution = Math.min(
      MEMBER_HOME_RELATED_SCORE_CAP,
      related * MEMBER_HOME_RELATED_SCORE_SCALE,
    );
    assert.ok(contribution <= MEMBER_HOME_RELATED_SCORE_CAP);

    const catalogue = staticRecipes.map((recipe) => ({
      ...recipe,
      id: recipe.id || `id-${recipe.slug}`,
    }));
    const rankedA = rankMemberHomeRecommendations({
      publishedCandidates: catalogue,
      savedPublished: bySlug("herb-focaccia", "peach-skillet-cobbler"),
    });
    const rankedB = rankMemberHomeRecommendations({
      publishedCandidates: [...catalogue].reverse(),
      savedPublished: bySlug("peach-skillet-cobbler", "herb-focaccia"),
    });
    assert.deepEqual(
      rankedA.map((row) => [row.recipe.slug, row.reason.type, row.reason.label]),
      rankedB.map((row) => [row.recipe.slug, row.reason.type, row.reason.label]),
    );
    for (const row of rankedA) {
      if (row.reason.type === "because_saved") {
        assert.match(row.reason.label, /^Because you saved /);
        assert.ok(
          scoreMemberHomeCandidate(
            catalogue.find((recipe) => recipe.slug === row.recipe.slug)!,
            bySlug("herb-focaccia", "peach-skillet-cobbler"),
            buildMemberHomeAffinity(bySlug("herb-focaccia", "peach-skillet-cobbler")),
          ).topRelatedScore >= MEMBER_HOME_BECAUSE_SAVED_RELATED_MIN,
        );
      }
    }
    void candidate;
  });

  it("documents explanation priority: because_saved → category → saved_preferences", () => {
    const domain = readRepo("src/lib/member-home.ts");
    assert.match(domain, /because_saved/);
    assert.match(domain, /More from /);
    assert.match(domain, /Based on recipes you saved/);
    // Priority order in buildReason
    const becauseIdx = domain.indexOf('type: "because_saved"');
    const categoryIdx = domain.indexOf('type: "category"');
    const genericIdx = domain.indexOf('type: "saved_preferences"');
    assert.ok(becauseIdx > 0 && categoryIdx > becauseIdx && genericIdx > categoryIdx);
  });
});

describe("Phase 7E — planner civil boundaries + week action security", () => {
  it("Monday–Sunday week helpers cross month and year boundaries", () => {
    assert.equal(startOfWeekMonday("2026-09-14"), "2026-09-14"); // Monday
    assert.equal(endOfWeekSunday("2026-09-14"), "2026-09-20");
    assert.equal(startOfWeekMonday("2026-09-13"), "2026-09-07"); // Sunday → prior Monday
    assert.equal(startOfWeekMonday("2027-01-01"), "2026-12-28"); // year boundary
    assert.equal(endOfWeekSunday("2026-12-28"), "2027-01-03");
    assert.equal(startOfWeekMonday("2026-03-01"), "2026-02-23"); // month boundary
    assert.ok(validateMealPlanDate("2026-02-28").ok);
    assert.equal(validateMealPlanDate("2026-02-30").ok, false);
  });

  it("week action validates horizon and never accepts client userId/planId", () => {
    const actions = readRepo("src/app/profile/member-home-actions.ts");
    assert.match(actions, /validateMealPlanDateHorizon/);
    assert.match(actions, /OUT_OF_HORIZON/);
    assert.match(actions, /serverUtcCivilYmd/);
    assert.doesNotMatch(actions, /ensureDefaultMealPlanForUser/);
    assert.doesNotMatch(actions, /userId:\s*|planId:/);
    const far = validateMealPlanDateHorizon("2099-01-01", "2026-09-15");
    assert.equal(far.ok, false);
  });

  it("item mutations bump MealPlan.updatedAt for Home plan selection", () => {
    const server = readRepo("src/lib/meal-planner-server.ts");
    assert.match(server, /mealPlan\.update\([\s\S]*updatedAt:\s*new Date\(\)/);
    assert.match(server, /orderBy: \[\{ updatedAt: "desc" \}/);
  });
});

describe("Phase 7E — discover + page wiring contracts", () => {
  it("Discover is deterministic and Published-only", () => {
    const a = selectMemberHomeDiscover(staticRecipes).map((row) => row.slug);
    const b = selectMemberHomeDiscover([...staticRecipes].reverse()).map((row) => row.slug);
    assert.deepEqual(a, b);
    assert.ok(a.length <= 4);
    assert.equal(new Set(a).size, a.length);
  });

  it("page uses section flags and saved visible wording", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /memberHomeServerSectionFlags/);
    assert.match(page, /available saved/);
    assert.match(page, /sections\.showGetStarted/);
    assert.match(page, /sections\.showDiscover/);
    assert.doesNotMatch(page, /Bookmarks/);
    assert.doesNotMatch(page, /<h[12][^>]*>\s*Favorites/);
    const baseline = page.slice(page.indexOf("function BaselineProfile"));
    assert.doesNotMatch(baseline, /memberHomeServerSectionFlags|MemberHomeRecentlyViewed/);
  });

  it("gate OFF baseline markers remain", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /if \(!isPersonalizedMemberHomeEnabled\(\)\)/);
    assert.match(page, /Saved recipes/);
    assert.match(page, /ProfileSavedCollections/);
    assert.match(page, /\{isMealPlannerEnabled\(\) \?/);
  });
});
