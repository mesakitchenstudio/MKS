/**
 * Phase 7B — Personalized Member Home domain + contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Recipe } from "@/data/types";
import { isPersonalizedMemberHomeEnabled } from "@/lib/flags";
import { scoreRelatedRecipe } from "@/lib/recipe-related";
import {
  MEMBER_HOME_BECAUSE_SAVED_RELATED_MIN,
  MEMBER_HOME_DISCOVER_MAX,
  MEMBER_HOME_RECOMMENDATION_MAX,
  MEMBER_HOME_RECOMMENDATION_MAX_PER_PRIMARY_CATEGORY,
  MEMBER_HOME_RECOMMENDATION_MIN_RESULTS,
  MEMBER_HOME_RECOMMENDATION_MIN_SAVES,
  MEMBER_HOME_RECOMMENDATION_MIN_SCORE,
  MEMBER_HOME_RELATED_SCORE_CAP,
  MEMBER_HOME_RELATED_SCORE_SCALE,
  MEMBER_HOME_SAVED_PREVIEW_MAX,
  MEMBER_HOME_SCORE_COURSE,
  MEMBER_HOME_SCORE_CUISINE,
  MEMBER_HOME_SCORE_METHOD,
  MEMBER_HOME_SCORE_PRIMARY_CATEGORY,
  MEMBER_HOME_SCORE_TYPE,
  buildMemberHomeAffinity,
  buildMemberHomeSavedPreview,
  rankMemberHomeRecommendations,
  scoreMemberHomeCandidate,
  selectMemberHomeDiscover,
  selectMemberHomeNextMeals,
  selectMemberHomePlan,
} from "@/lib/member-home";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

function recipe(partial: Partial<Recipe> & Pick<Recipe, "slug" | "title">): Recipe {
  return {
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    image: "/img.jpg",
    imageAlt: partial.title,
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-01",
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 4,
    servingsUnit: "servings",
    course: "Main",
    method: "",
    cuisine: "",
    categories: ["main-dishes"],
    tags: [],
    ingredients: [],
    instructions: [],
    notes: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    ...partial,
    id: partial.id ?? `id-${partial.slug}`,
  };
}

describe("Phase 7B — PERSONALIZED_MEMBER_HOME_ENABLED gate", () => {
  it("enables only for exact string true", () => {
    const prev = process.env.PERSONALIZED_MEMBER_HOME_ENABLED;
    const prevPublic = process.env.NEXT_PUBLIC_PERSONALIZED_MEMBER_HOME_ENABLED;
    try {
      delete process.env.PERSONALIZED_MEMBER_HOME_ENABLED;
      delete process.env.NEXT_PUBLIC_PERSONALIZED_MEMBER_HOME_ENABLED;
      assert.equal(isPersonalizedMemberHomeEnabled(), false);

      process.env.PERSONALIZED_MEMBER_HOME_ENABLED = "false";
      assert.equal(isPersonalizedMemberHomeEnabled(), false);

      process.env.PERSONALIZED_MEMBER_HOME_ENABLED = "true";
      assert.equal(isPersonalizedMemberHomeEnabled(), true);

      process.env.PERSONALIZED_MEMBER_HOME_ENABLED = "True";
      assert.equal(isPersonalizedMemberHomeEnabled(), false);

      process.env.PERSONALIZED_MEMBER_HOME_ENABLED = "1";
      assert.equal(isPersonalizedMemberHomeEnabled(), false);

      delete process.env.PERSONALIZED_MEMBER_HOME_ENABLED;
      process.env.NEXT_PUBLIC_PERSONALIZED_MEMBER_HOME_ENABLED = "true";
      assert.equal(isPersonalizedMemberHomeEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.PERSONALIZED_MEMBER_HOME_ENABLED;
      else process.env.PERSONALIZED_MEMBER_HOME_ENABLED = prev;
      if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_PERSONALIZED_MEMBER_HOME_ENABLED;
      else process.env.NEXT_PUBLIC_PERSONALIZED_MEMBER_HOME_ENABLED = prevPublic;
    }
  });

  it("does not define a NEXT_PUBLIC personalized home flag in flags.ts", () => {
    const flags = readRepo("src/lib/flags.ts");
    assert.match(flags, /PERSONALIZED_MEMBER_HOME_ENABLED === "true"/);
    assert.doesNotMatch(flags, /NEXT_PUBLIC_PERSONALIZED_MEMBER_HOME_ENABLED/);
  });
});

describe("Phase 7B — recommendation thresholds and exclusions", () => {
  const savedBread = recipe({
    slug: "saved-bread",
    title: "Saved Bread",
    categories: ["breads"],
    course: "Bread",
    cuisine: "Italian",
    method: "Bake",
    typeName: "Loaf",
    tags: ["yeast"],
  });
  const savedDessert = recipe({
    slug: "saved-dessert",
    title: "Saved Dessert",
    categories: ["desserts"],
    course: "Dessert",
    cuisine: "French",
    method: "Bake",
    typeName: "Cake",
    tags: ["sweet"],
  });

  const breadA = recipe({
    slug: "bread-a",
    title: "Bread A",
    categories: ["breads"],
    course: "Bread",
    cuisine: "Italian",
    method: "Bake",
    typeName: "Loaf",
    tags: ["yeast"],
    publishedAt: "2026-06-01",
  });
  const breadB = recipe({
    slug: "bread-b",
    title: "Bread B",
    categories: ["breads"],
    course: "Bread",
    cuisine: "Italian",
    method: "Bake",
    typeName: "Loaf",
    publishedAt: "2026-05-01",
  });
  const breadC = recipe({
    slug: "bread-c",
    title: "Bread C",
    categories: ["breads"],
    course: "Bread",
    cuisine: "Italian",
    method: "Bake",
    typeName: "Loaf",
    publishedAt: "2026-04-01",
  });
  const dessertA = recipe({
    slug: "dessert-a",
    title: "Dessert A",
    categories: ["desserts"],
    course: "Dessert",
    cuisine: "French",
    method: "Bake",
    typeName: "Cake",
    tags: ["sweet"],
    publishedAt: "2026-06-02",
  });
  const dessertB = recipe({
    slug: "dessert-b",
    title: "Dessert B",
    categories: ["desserts"],
    course: "Dessert",
    cuisine: "French",
    method: "Bake",
    typeName: "Cake",
    publishedAt: "2026-05-02",
  });
  const unrelated = recipe({
    slug: "drink-x",
    title: "Drink X",
    categories: ["drinks"],
    course: "Drink",
    cuisine: "American",
    method: "Blend",
    typeName: "Smoothie",
  });

  it("returns [] with zero saves", () => {
    assert.deepEqual(
      rankMemberHomeRecommendations({
        publishedCandidates: [breadA, dessertA, dessertB],
        savedPublished: [],
      }),
      [],
    );
  });

  it("returns [] with one save", () => {
    assert.deepEqual(
      rankMemberHomeRecommendations({
        publishedCandidates: [breadA, dessertA, dessertB, breadB],
        savedPublished: [savedBread],
      }),
      [],
    );
    assert.equal(MEMBER_HOME_RECOMMENDATION_MIN_SAVES, 2);
  });

  it("returns recommendations when two saves and enough strong candidates", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [breadA, breadB, dessertA, dessertB, unrelated],
      savedPublished: [savedBread, savedDessert],
    });
    assert.ok(ranked.length >= MEMBER_HOME_RECOMMENDATION_MIN_RESULTS);
    assert.ok(ranked.length <= MEMBER_HOME_RECOMMENDATION_MAX);
    assert.ok(ranked.every((row) => row.score >= MEMBER_HOME_RECOMMENDATION_MIN_SCORE));
  });

  it("returns [] when fewer than 3 qualifying candidates after thresholds", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [breadA, unrelated],
      savedPublished: [savedBread, savedDessert],
    });
    assert.deepEqual(ranked, []);
    assert.equal(MEMBER_HOME_RECOMMENDATION_MIN_RESULTS, 3);
  });

  it("excludes saved Recipes", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [savedBread, savedDessert, breadA, breadB, dessertA, dessertB],
      savedPublished: [savedBread, savedDessert],
    });
    const slugs = ranked.map((row) => row.recipe.slug);
    assert.equal(slugs.includes("saved-bread"), false);
    assert.equal(slugs.includes("saved-dessert"), false);
  });

  it("excludes duplicate candidates", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [breadA, { ...breadA }, breadB, dessertA, dessertB],
      savedPublished: [savedBread, savedDessert],
    });
    const slugs = ranked.map((row) => row.recipe.slug);
    assert.equal(new Set(slugs).size, slugs.length);
  });

  it("is deterministic for the same inputs", () => {
    const input = {
      publishedCandidates: [dessertB, breadA, breadC, dessertA, breadB, unrelated],
      savedPublished: [savedDessert, savedBread],
    };
    const a = rankMemberHomeRecommendations(input).map((row) => row.recipe.slug);
    const b = rankMemberHomeRecommendations(input).map((row) => row.recipe.slug);
    assert.deepEqual(a, b);
  });

  it("caps at 4 results", () => {
    const extras = Array.from({ length: 6 }, (_, i) =>
      recipe({
        slug: `extra-${i}`,
        title: `Extra ${i}`,
        categories: i % 2 === 0 ? ["breads"] : ["desserts"],
        course: i % 2 === 0 ? "Bread" : "Dessert",
        cuisine: i % 2 === 0 ? "Italian" : "French",
        method: "Bake",
        typeName: i % 2 === 0 ? "Loaf" : "Cake",
        publishedAt: `2026-07-0${i + 1}`,
      }),
    );
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [breadA, breadB, dessertA, dessertB, ...extras],
      savedPublished: [savedBread, savedDessert],
    });
    assert.ok(ranked.length <= MEMBER_HOME_RECOMMENDATION_MAX);
    assert.equal(MEMBER_HOME_RECOMMENDATION_MAX, 4);
  });

  it("applies diversity max 2 per primary category", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [breadA, breadB, breadC, dessertA, dessertB],
      savedPublished: [savedBread, savedDessert],
    });
    const breadCount = ranked.filter((row) => row.recipe.categories[0] === "breads").length;
    assert.ok(breadCount <= MEMBER_HOME_RECOMMENDATION_MAX_PER_PRIMARY_CATEGORY);
  });

  it("returns [] when diversity leaves fewer than 3 (all one category)", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [breadA, breadB, breadC],
      savedPublished: [savedBread, savedDessert],
    });
    assert.deepEqual(ranked, []);
  });

  it("does not require Recently Viewed input", () => {
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [breadA, breadB, dessertA, dessertB],
      savedPublished: [savedBread, savedDessert],
    });
    assert.ok(ranked.length >= 3);
    assert.equal("recentlyViewed" in ({} as object), false);
  });
});

describe("Phase 7B — affinity weights and related contribution", () => {
  it("awards primary-category / course / cuisine / type / method affinities", () => {
    const saved = recipe({
      slug: "s1",
      title: "S1",
      categories: ["breads"],
      course: "Bread",
      cuisine: "Italian",
      method: "Bake",
      typeName: "Loaf",
    });
    const affinity = buildMemberHomeAffinity([saved]);
    const full = recipe({
      slug: "c1",
      title: "C1",
      categories: ["breads"],
      course: "Bread",
      cuisine: "Italian",
      method: "Bake",
      typeName: "Loaf",
      tags: [],
    });
    // Score without related by using empty tags and mismatched tags so related may still fire on course/category.
    const scored = scoreMemberHomeCandidate(full, [saved], affinity);
    assert.ok(scored.score >= MEMBER_HOME_SCORE_PRIMARY_CATEGORY);
    assert.ok(scored.score >= MEMBER_HOME_SCORE_PRIMARY_CATEGORY + MEMBER_HOME_SCORE_COURSE);
    assert.ok(
      scored.score >=
        MEMBER_HOME_SCORE_PRIMARY_CATEGORY +
          MEMBER_HOME_SCORE_COURSE +
          MEMBER_HOME_SCORE_CUISINE +
          MEMBER_HOME_SCORE_TYPE +
          MEMBER_HOME_SCORE_METHOD,
    );
  });

  it("scales and caps related-score contribution", () => {
    const saved = recipe({
      slug: "s-rel",
      title: "Saved Rel",
      categories: ["breads"],
      course: "Bread",
      cuisine: "",
      method: "",
      typeName: "Loaf",
      tags: ["yeast", "crust"],
    });
    const candidate = recipe({
      slug: "c-rel",
      title: "Cand Rel",
      categories: ["breads"],
      course: "Bread",
      cuisine: "Mexican",
      method: "Fry",
      typeName: "Loaf",
      tags: ["yeast", "crust"],
    });
    const related = scoreRelatedRecipe(saved, candidate, new Set());
    assert.ok(related > 0);
    const affinity = buildMemberHomeAffinity([saved]);
    const scored = scoreMemberHomeCandidate(candidate, [saved], affinity);
    const expectedRelated = Math.min(
      MEMBER_HOME_RELATED_SCORE_CAP,
      related * MEMBER_HOME_RELATED_SCORE_SCALE,
    );
    const affinityOnly =
      MEMBER_HOME_SCORE_PRIMARY_CATEGORY +
      MEMBER_HOME_SCORE_COURSE +
      MEMBER_HOME_SCORE_TYPE;
    assert.ok(scored.score >= affinityOnly + expectedRelated - 0.001);
    assert.ok(expectedRelated <= MEMBER_HOME_RELATED_SCORE_CAP);
    assert.equal(MEMBER_HOME_RELATED_SCORE_SCALE, 0.2);
  });

  it("emits explainability labels including because_saved when related is strong", () => {
    const saved = recipe({
      slug: "saved-strong",
      title: "Ciabatta",
      categories: ["breads"],
      course: "Bread",
      cuisine: "Italian",
      method: "Bake",
      typeName: "Loaf",
      tags: ["yeast"],
    });
    const saved2 = recipe({
      slug: "saved-strong-2",
      title: "Tarte",
      categories: ["desserts"],
      course: "Dessert",
      cuisine: "French",
      method: "Bake",
      typeName: "Tart",
    });
    const peer = recipe({
      slug: "peer-bread",
      title: "Focaccia",
      categories: ["breads"],
      course: "Bread",
      cuisine: "Italian",
      method: "Bake",
      typeName: "Loaf",
      tags: ["yeast"],
      publishedAt: "2026-08-01",
    });
    const peer2 = recipe({
      slug: "peer-dessert",
      title: "Gateau",
      categories: ["desserts"],
      course: "Dessert",
      cuisine: "French",
      method: "Bake",
      typeName: "Cake",
      publishedAt: "2026-08-02",
    });
    const peer3 = recipe({
      slug: "peer-bread-2",
      title: "Rolls",
      categories: ["breads"],
      course: "Bread",
      cuisine: "Italian",
      method: "Bake",
      typeName: "Loaf",
      publishedAt: "2026-07-01",
    });
    const related = scoreRelatedRecipe(saved, peer, new Set());
    assert.ok(related >= MEMBER_HOME_BECAUSE_SAVED_RELATED_MIN);
    const ranked = rankMemberHomeRecommendations({
      publishedCandidates: [peer, peer2, peer3],
      savedPublished: [saved, saved2],
    });
    assert.ok(ranked.length >= 3);
    const because = ranked.find((row) => row.reason.type === "because_saved");
    assert.ok(because);
    assert.match(because!.reason.label, /^Because you saved /);
    assert.ok(ranked.every((row) => typeof row.reason.label === "string" && row.reason.label.length > 0));
    assert.ok(
      ranked.some(
        (row) =>
          row.reason.type === "category" ||
          row.reason.type === "saved_preferences" ||
          row.reason.type === "because_saved",
      ),
    );
  });

  it("enforces minimum score of 40", () => {
    assert.equal(MEMBER_HOME_RECOMMENDATION_MIN_SCORE, 40);
    const saved = recipe({
      slug: "s-min",
      title: "S",
      categories: ["breads"],
      course: "Bread",
    });
    const weak = recipe({
      slug: "weak",
      title: "Weak",
      categories: ["drinks"],
      course: "Drink",
      cuisine: "X",
      method: "Y",
      typeName: "Z",
    });
    const affinity = buildMemberHomeAffinity([saved]);
    const scored = scoreMemberHomeCandidate(weak, [saved], affinity);
    assert.ok(scored.score < MEMBER_HOME_RECOMMENDATION_MIN_SCORE);
  });
});

describe("Phase 7B — saved preview", () => {
  it("returns at most 6 Published cards, recent-first, hides draft/orphan", () => {
    const published = [
      recipe({ slug: "a", title: "A", publishedAt: "2026-01-06" }),
      recipe({ slug: "b", title: "B", publishedAt: "2026-01-05" }),
      recipe({ slug: "c", title: "C", publishedAt: "2026-01-04" }),
      recipe({ slug: "d", title: "D", publishedAt: "2026-01-03" }),
      recipe({ slug: "e", title: "E", publishedAt: "2026-01-02" }),
      recipe({ slug: "f", title: "F", publishedAt: "2026-01-01" }),
      recipe({ slug: "g", title: "G", publishedAt: "2025-12-01" }),
    ];
    const bySlug = new Map(published.map((row) => [row.slug, row]));
    const byId = new Map(published.map((row) => [row.id!, row]));
    const preview = buildMemberHomeSavedPreview({
      saves: [
        { slug: "a", recipeId: "id-a", createdAt: "2026-09-07" },
        { slug: "draft-x", recipeId: "draft-id", createdAt: "2026-09-06" },
        { slug: "orphan-y", recipeId: null, createdAt: "2026-09-05" },
        { slug: "b", recipeId: "id-b", createdAt: "2026-09-04" },
        { slug: "c", recipeId: "id-c", createdAt: "2026-09-03" },
        { slug: "d", recipeId: "id-d", createdAt: "2026-09-02" },
        { slug: "e", recipeId: "id-e", createdAt: "2026-09-01" },
        { slug: "f", recipeId: "id-f", createdAt: "2026-08-31" },
        { slug: "g", recipeId: "id-g", createdAt: "2026-08-30" },
      ],
      publishedBySlug: bySlug,
      publishedById: byId,
    });
    assert.equal(preview.recipes.length, MEMBER_HOME_SAVED_PREVIEW_MAX);
    assert.deepEqual(
      preview.recipes.map((row) => row.slug),
      ["a", "b", "c", "d", "e", "f"],
    );
    assert.equal(preview.totalSaveCount, 9);
    assert.equal(preview.visibleSaveCount, 7);
    assert.equal(preview.recipes.some((row) => row.slug === "draft-x"), false);
  });
});

describe("Phase 7B — discover fallback", () => {
  it("returns at most 4 latest Published recipes", () => {
    const pool = Array.from({ length: 6 }, (_, i) =>
      recipe({
        slug: `d${i}`,
        title: `D${i}`,
        updatedAt: `2026-0${i + 1}-01`,
        publishedAt: `2026-0${i + 1}-01`,
      }),
    );
    const discover = selectMemberHomeDiscover(pool);
    assert.equal(discover.length, MEMBER_HOME_DISCOVER_MAX);
    assert.equal(discover[0]?.slug, "d5");
  });
});

describe("Phase 7B — meal planner summary helpers", () => {
  it("selects first plan deterministically and does not invent plans", () => {
    assert.equal(selectMemberHomePlan([]), null);
    assert.deepEqual(selectMemberHomePlan([{ id: "p1" }, { id: "p2" }]), { id: "p1" });
  });

  it("orders next meals, max 3, omits notes and draft/orphan", () => {
    const meals = selectMemberHomeNextMeals(
      [
        {
          id: "1",
          recipeId: "r1",
          recipeTitle: "Past",
          planDate: "2026-09-14",
          mealSlot: "lunch",
          plannedServings: 2,
          recipeAvailability: "available",
          publicRecipeSlug: "past",
          note: "secret",
        },
        {
          id: "2",
          recipeId: "r2",
          recipeTitle: "Draft Meal",
          planDate: "2026-09-15",
          mealSlot: "dinner",
          plannedServings: 2,
          recipeAvailability: "unavailable",
          publicRecipeSlug: null,
          note: "draft note",
        },
        {
          id: "3",
          recipeId: null,
          recipeTitle: "Orphan Meal",
          planDate: "2026-09-15",
          mealSlot: "lunch",
          plannedServings: 1,
          recipeAvailability: "orphaned",
          publicRecipeSlug: null,
        },
        {
          id: "4",
          recipeId: "r4",
          recipeTitle: "Today",
          planDate: "2026-09-15",
          mealSlot: "breakfast",
          plannedServings: 3,
          recipeAvailability: "available",
          publicRecipeSlug: "today",
          note: "private",
        },
        {
          id: "5",
          recipeId: "r5",
          recipeTitle: "Tue",
          planDate: "2026-09-16",
          mealSlot: "dinner",
          plannedServings: 4,
          recipeAvailability: "available",
          publicRecipeSlug: "tue",
        },
        {
          id: "6",
          recipeId: "r6",
          recipeTitle: "Wed",
          planDate: "2026-09-17",
          mealSlot: "lunch",
          plannedServings: 2,
          recipeAvailability: "available",
          publicRecipeSlug: "wed",
        },
        {
          id: "7",
          recipeId: "r7",
          recipeTitle: "Thu",
          planDate: "2026-09-18",
          mealSlot: "lunch",
          plannedServings: 2,
          recipeAvailability: "available",
          publicRecipeSlug: "thu",
        },
      ],
      "2026-09-15",
    );
    assert.equal(meals.length, 3);
    assert.deepEqual(
      meals.map((row) => row.recipeSlug),
      ["today", "tue", "wed"],
    );
    assert.equal(JSON.stringify(meals).includes("private"), false);
    assert.equal(JSON.stringify(meals).includes("secret"), false);
    assert.equal(JSON.stringify(meals).includes("note"), false);
  });
});

describe("Phase 7B — wiring contracts", () => {
  it("server aggregator is read-only for Meal Plans and requires trusted userId", () => {
    const server = readRepo("src/lib/member-home-server.ts");
    assert.match(server, /getPersonalizedMemberHomeForUser/);
    assert.match(server, /listMealPlansForUser/);
    assert.doesNotMatch(server, /ensureDefaultMealPlanForUser\(/);
    assert.match(server, /requires an authenticated member userId/);
    assert.match(server, /weekAnchorYmd/);
    assert.doesNotMatch(server, /mesa:recently-viewed|localStorage.*recently/i);
    assert.match(server, /Recently Viewed is not used here/);
    assert.doesNotMatch(server, /unstable_cache/);
  });

  it("wires Personalized Home behind the feature gate only", () => {
    const page = readRepo("src/app/profile/page.tsx");
    assert.match(page, /isPersonalizedMemberHomeEnabled/);
    assert.match(page, /getPersonalizedMemberHomeForUser/);
    assert.match(page, /BaselineProfile/);
    assert.match(page, /MemberHomeRecentlyViewed/);
    assert.match(page, /force-dynamic/);
    assert.match(page, /robots:\s*\{\s*index:\s*false/);
    assert.doesNotMatch(page, /NEXT_PUBLIC_PERSONALIZED_MEMBER_HOME/);
    assert.doesNotMatch(page, /ensureDefaultMealPlanForUser/);
  });

  it("domain documents no Recently Viewed scoring and no plan creation", () => {
    const domain = readRepo("src/lib/member-home.ts");
    assert.match(domain, /Recently Viewed is intentionally excluded/);
    assert.match(domain, /never create a Meal Plan/);
    assert.match(domain, /MEMBER_HOME_SCORE_PRIMARY_CATEGORY = 40/);
  });
});
