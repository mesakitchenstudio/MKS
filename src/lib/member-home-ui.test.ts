/**
 * Phase 7C — Personalized Member Home Profile UI contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isMemberHomeColdStart,
  isPersonalizedMemberHomeEnabled,
  memberHomeWelcomeHeading,
  type MemberHomeReadModel,
} from "@/lib/member-home";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
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

describe("Phase 7C — feature gate Profile branching", () => {
  it("enables enhanced home only for exact PERSONALIZED_MEMBER_HOME_ENABLED=true", () => {
    const prev = process.env.PERSONALIZED_MEMBER_HOME_ENABLED;
    try {
      delete process.env.PERSONALIZED_MEMBER_HOME_ENABLED;
      assert.equal(isPersonalizedMemberHomeEnabled(), false);
      process.env.PERSONALIZED_MEMBER_HOME_ENABLED = "false";
      assert.equal(isPersonalizedMemberHomeEnabled(), false);
      process.env.PERSONALIZED_MEMBER_HOME_ENABLED = "true";
      assert.equal(isPersonalizedMemberHomeEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.PERSONALIZED_MEMBER_HOME_ENABLED;
      else process.env.PERSONALIZED_MEMBER_HOME_ENABLED = prev;
    }
  });

  it("keeps gate OFF baseline Profile markers and AccountMenu unchanged", () => {
    const page = readRepo("src/app/profile/page.tsx");
    const menu = readRepo("src/components/AccountMenu.tsx");

    assert.match(page, /function BaselineProfile/);
    assert.match(page, /if \(!isPersonalizedMemberHomeEnabled\(\)\)/);
    assert.match(page, /Saved recipes/);
    assert.match(page, /<ProfileFavorites/);
    assert.match(page, /ProfileSavedCollections/);
    assert.match(page, /Open Meal Planner/);
    assert.match(page, /EmailUpdatesPreference/);
    assert.match(page, /DeleteAccountSection/);
    assert.match(page, /\{isMealPlannerEnabled\(\) \?/);

    assert.match(menu, /Profile/);
    assert.match(menu, /Meal Planner/);
    assert.match(menu, /Sign out/);
    assert.doesNotMatch(menu, /Dashboard/);
    assert.doesNotMatch(menu, />\s*Home\s*</);
    assert.doesNotMatch(menu, /PERSONALIZED_MEMBER_HOME|NEXT_PUBLIC_PERSONALIZED/);
  });

  it("does not leak the env var to client components", () => {
    const thisWeek = readRepo("src/components/member-home/MemberHomeThisWeek.tsx");
    const sections = readRepo("src/components/member-home/MemberHomeSections.tsx");
    const create = readRepo("src/components/member-home/MemberHomeCreateCollectionButton.tsx");
    assert.doesNotMatch(thisWeek, /process\.env\.PERSONALIZED_MEMBER_HOME|NEXT_PUBLIC_PERSONALIZED/);
    assert.doesNotMatch(sections, /process\.env\.PERSONALIZED_MEMBER_HOME|NEXT_PUBLIC_PERSONALIZED/);
    assert.doesNotMatch(create, /process\.env\.PERSONALIZED_MEMBER_HOME|NEXT_PUBLIC_PERSONALIZED/);
  });
});

describe("Phase 7C — welcome / cold start helpers", () => {
  it("uses Welcome, firstName or Your Mesa — never email as h1", () => {
    assert.equal(
      memberHomeWelcomeHeading({ name: "Ada Lovelace", email: "ada@example.com" }),
      "Welcome, Ada",
    );
    assert.equal(
      memberHomeWelcomeHeading({ name: "ada@example.com", email: "ada@example.com" }),
      "Your Mesa",
    );
    assert.equal(memberHomeWelcomeHeading({ name: "", email: "ada@example.com" }), "Your Mesa");
    assert.equal(
      memberHomeWelcomeHeading({ name: "ada", email: "ada@example.com" }),
      "Your Mesa",
    );
  });

  it("detects cold start without giant empty shelves", () => {
    assert.equal(isMemberHomeColdStart(emptyHome()), true);
    assert.equal(
      isMemberHomeColdStart(
        emptyHome({
          saved: { status: "ok", recipes: [], totalSaveCount: 2, visibleSaveCount: 2 },
        }),
      ),
      false,
    );
  });
});

describe("Phase 7C — enhanced Profile layout contracts", () => {
  it("renders gate-ON hierarchy with Recently Viewed between This week and Recommended", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /memberHomeWelcomeHeading/);
    assert.match(page, /MemberHomeThisWeek/);
    assert.match(page, /MemberHomeRecentlyViewed/);
    assert.match(page, /MemberHomeRecommendationsSection/);
    assert.match(page, /Your Saved Recipes/);
    assert.match(page, /MemberHomeCollectionsSection/);
    assert.match(page, /MemberHomeDiscoverSection/);
    assert.match(page, /MemberHomeGetStarted/);

    const thisWeekIdx = page.indexOf("<MemberHomeThisWeek");
    const recentIdx = page.indexOf("<MemberHomeRecentlyViewed");
    const recIdx = page.indexOf("<MemberHomeRecommendationsSection");
    assert.ok(thisWeekIdx >= 0 && recentIdx > thisWeekIdx);
    assert.ok(recIdx > recentIdx);

    assert.doesNotMatch(page, /Shopping List|shopping-list/);
    assert.doesNotMatch(page, /ensureDefaultMealPlanForUser/);
    assert.doesNotMatch(page, /rankMemberHomeRecommendations\([^\)]*recent/);
  });

  it("cold-start path favors Discover + Get Started over empty shelves", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /memberHomeServerSectionFlags/);
    assert.match(page, /sections\.showThisWeek/);
    assert.match(page, /sections\.showGetStarted/);
    assert.match(page, /showGetStartedHint=\{sections\.coldStart\}/);
  });

  it("omits Recommended empty state and avoids duplicate shelves when recommendations exist", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.doesNotMatch(page, /No recommendations/);
    assert.match(page, /sections\.showRecommended/);
    assert.match(page, /sections\.showDiscover/);
    const sections = readRepo("src/components/member-home/MemberHomeSections.tsx");
    assert.match(sections, /Recommended for You/);
    assert.match(sections, /Discover something new/);
    assert.match(sections, /0 available recipes/);
    assert.match(sections, /Explore recipe series/);
  });

  it("recommendation cards reuse RecipeGridCard with reason text", () => {
    const card = readRepo("src/components/member-home/RecommendationRecipeCard.tsx");
    assert.match(card, /RecipeGridCard/);
    assert.match(card, /reasonLabel/);
    assert.doesNotMatch(card, /MemberRecipeCard|PersonalizedRecipeCard/);
  });
});

describe("Phase 7D — Member Home Recently Viewed", () => {
  it("reuses shared store, Published resolution, Clear, and display thresholds", () => {
    const section = readRepo("src/components/member-home/MemberHomeRecentlyViewed.tsx");
    const hook = readRepo("src/components/useRecentlyViewedRecipes.ts");
    const home = readRepo("src/components/HomepageRecentlyViewed.tsx");
    const store = readRepo("src/lib/recently-viewed.ts");

    assert.match(section, /useRecentlyViewedRecipes/);
    assert.match(section, /RECENTLY_VIEWED_MIN_DISPLAY/);
    assert.match(section, /clearRecentlyViewed\(\)/);
    assert.match(section, /Clear recently viewed/);
    assert.match(section, /RecipeGridCard/);
    assert.match(section, /Recipes you opened on this device/);
    assert.doesNotMatch(section, /fetch\(|getPersonalizedMemberHome|rankMemberHome/);
    assert.doesNotMatch(section, /confirm\(|window\.confirm/);

    assert.match(hook, /useSyncExternalStore/);
    assert.match(hook, /resolveRecentlyViewedRecipes/);
    assert.match(hook, /publicRecipeId/);
    assert.match(home, /useRecentlyViewedRecipes/);

    assert.equal(
      store.includes('RECENTLY_VIEWED_STORAGE_KEY = "mesa:recently-viewed:v1"'),
      true,
    );
    assert.match(store, /RECENTLY_VIEWED_MAX_STORED = 12/);
    assert.match(store, /RECENTLY_VIEWED_MAX_DISPLAY = 4/);
    assert.match(store, /RECENTLY_VIEWED_MIN_DISPLAY = 2/);
    assert.match(store, /RECENTLY_VIEWED_MAX_AGE_DAYS = 90/);
  });

  it("is gated only by enhanced Profile — not a separate RV flag", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /isPersonalizedMemberHomeEnabled/);
    assert.match(page, /MemberHomeRecentlyViewed/);
    assert.doesNotMatch(page, /RECENTLY_VIEWED_MEMBER_HOME|NEXT_PUBLIC_RECENTLY/);
    const baseline = page.slice(page.indexOf("function BaselineProfile"));
    assert.doesNotMatch(baseline, /MemberHomeRecentlyViewed|Recently viewed/);
  });

  it("does not feed Recently Viewed into recommendation scoring", () => {
    const domain = readRepo("src/lib/member-home.ts");
    const server = readRepo("src/lib/member-home-server.ts");
    assert.match(domain, /Recently Viewed is intentionally excluded/);
    assert.doesNotMatch(domain, /readRecentlyViewed|mesa:recently-viewed/);
    assert.doesNotMatch(server, /readRecentlyViewed|mesa:recently-viewed/);
  });
});

describe("Phase 7C — This week server action", () => {
  it("accepts only weekAnchorYmd and never creates plans", () => {
    const actions = readRepo("src/app/profile/member-home-actions.ts");
    assert.match(actions, /"use server"/);
    assert.match(actions, /getMemberHomeThisWeekAction/);
    assert.match(actions, /weekAnchorYmd/);
    assert.match(actions, /validateMealPlanDateHorizon/);
    assert.match(actions, /INVALID_DATE|NOT_AUTHENTICATED|FEATURE_DISABLED|OUT_OF_HORIZON/);
    assert.doesNotMatch(actions, /ensureDefaultMealPlanForUser/);
    assert.doesNotMatch(actions, /userId:\s*|planId:/);

    const thisWeek = readRepo("src/components/member-home/MemberHomeThisWeek.tsx");
    assert.match(thisWeek, /browserLocalYmd|getFullYear/);
    assert.match(thisWeek, /getMemberHomeThisWeekAction/);
    assert.match(thisWeek, /Start Meal Planning/);
    assert.match(thisWeek, /Open Meal Planner/);
    assert.doesNotMatch(thisWeek, /\.note|MealPlanItem\.note/);
    assert.match(thisWeek, /aria-busy/);
  });

  it("exports read-only week helper from member-home-server", () => {
    const server = readRepo("src/lib/member-home-server.ts");
    assert.match(server, /export async function getMemberHomePlannerWeekForUser/);
    assert.doesNotMatch(server, /ensureDefaultMealPlanForUser\(/);
  });
});

describe("Phase 7C — draft/orphan and privacy", () => {
  it("maps Home cards from Published catalogue only", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /recipesBySlug\.get/);
    assert.match(page, /home\.saved\.recipes/);
    assert.match(page, /force-dynamic/);
    assert.match(page, /robots:\s*\{\s*index:\s*false/);
    assert.doesNotMatch(page, /unstable_cache/);
  });
});

describe("Phase 7C — loading / error boundaries", () => {
  it("does not require profile loading.tsx or error.tsx for MVP", () => {
    // Repository has no app loading.tsx pattern; optional section states cover planner load.
    const thisWeek = readRepo("src/components/member-home/MemberHomeThisWeek.tsx");
    assert.match(thisWeek, /status === "unavailable"/);
    assert.match(thisWeek, /Loading this week/);
  });
});
