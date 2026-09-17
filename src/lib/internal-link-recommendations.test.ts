import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isInternalLinkRecommendationsEnabled } from "./flags.ts";
import {
  INTERNAL_LINK_MIN_SCORE,
  INTERNAL_LINK_RECOMMENDATION_LIMIT,
  INTERNAL_LINK_SCORE_INGREDIENT_CAP,
  INTERNAL_LINK_SCORE_METHOD,
  INTERNAL_LINK_SERIES_DIVERSITY_MAX,
  classifyInternalLinkIngredientImportance,
  recommendInternalRecipeLinks,
  scoreInternalLinkRecommendation,
  type RecipeRecommendationCandidate,
} from "./internal-link-recommendations.ts";

function baseCandidate(
  overrides: Partial<RecipeRecommendationCandidate> & Pick<RecipeRecommendationCandidate, "id" | "title">,
): RecipeRecommendationCandidate {
  return {
    series: [],
    collections: [],
    categories: [],
    tags: [],
    ingredients: [],
    relatedRecipeIds: [],
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("internal link recommendations — feature gate", () => {
  const previous = process.env.INTERNAL_LINK_RECOMMENDATIONS_ENABLED;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.INTERNAL_LINK_RECOMMENDATIONS_ENABLED;
    } else {
      process.env.INTERNAL_LINK_RECOMMENDATIONS_ENABLED = previous;
    }
  });

  it("enables only exact lowercase true", () => {
    delete process.env.INTERNAL_LINK_RECOMMENDATIONS_ENABLED;
    assert.equal(isInternalLinkRecommendationsEnabled(), false);

    process.env.INTERNAL_LINK_RECOMMENDATIONS_ENABLED = "true";
    assert.equal(isInternalLinkRecommendationsEnabled(), true);

    for (const value of ["false", "TRUE", "True", "1", "yes", ""]) {
      process.env.INTERNAL_LINK_RECOMMENDATIONS_ENABLED = value;
      assert.equal(isInternalLinkRecommendationsEnabled(), false, value);
    }
  });
});

describe("internal link recommendations — ingredient importance", () => {
  it("marks pantry generics and weak baking staples", () => {
    assert.equal(classifyInternalLinkIngredientImportance("salt"), "generic");
    assert.equal(classifyInternalLinkIngredientImportance("Kosher salt"), "generic");
    assert.equal(classifyInternalLinkIngredientImportance("water"), "generic");
    assert.equal(classifyInternalLinkIngredientImportance("olive oil"), "generic");
    assert.equal(classifyInternalLinkIngredientImportance("black pepper"), "generic");
    assert.equal(classifyInternalLinkIngredientImportance("flour"), "weak");
    assert.equal(classifyInternalLinkIngredientImportance("All-purpose flour"), "weak");
    assert.equal(classifyInternalLinkIngredientImportance("unsalted butter"), "weak");
    assert.equal(classifyInternalLinkIngredientImportance("sugar"), "weak");
    assert.equal(classifyInternalLinkIngredientImportance("chocolate"), "meaningful");
    assert.equal(classifyInternalLinkIngredientImportance("oats"), "meaningful");
    assert.equal(classifyInternalLinkIngredientImportance("banana"), "meaningful");
  });
});

describe("internal link recommendations — scoring signals", () => {
  const source = baseCandidate({
    id: "src",
    title: "Source",
    series: [{ id: "s1", name: "Breads" }],
    collections: [{ id: "col1", name: "Weekend Baking" }],
    categories: [{ id: "c-cookies", name: "Cookies", group: "desserts" }],
    course: "Dessert",
    typeId: "type-cookie",
    typeName: "Cookies",
    cuisine: "American",
    method: "Oven",
    tags: ["sweet"],
    ingredients: [
      { identityKey: "chocolate", label: "chocolate" },
      { identityKey: "oats", label: "oats" },
      { identityKey: "banana", label: "banana" },
      { identityKey: "salt", label: "salt" },
    ],
    relatedRecipeIds: ["pinned"],
  });

  it("scores same Series strongly with reason", () => {
    const candidate = baseCandidate({
      id: "peer",
      title: "Baguettes",
      series: [{ id: "s1", name: "Breads" }],
    });
    const scored = scoreInternalLinkRecommendation(source, candidate);
    assert.ok(scored.score >= INTERNAL_LINK_MIN_SCORE);
    assert.ok(scored.reasons.some((r) => r.kind === "series" && r.label.includes("Breads")));
  });

  it("scores same Collection with bounded contribution", () => {
    const candidate = baseCandidate({
      id: "peer",
      title: "Other",
      collections: [{ id: "col1", name: "Weekend Baking" }],
    });
    const scored = scoreInternalLinkRecommendation(source, candidate);
    assert.ok(scored.score >= INTERNAL_LINK_MIN_SCORE);
    assert.equal(scored.reasons.filter((r) => r.kind === "collection").length, 1);
    assert.ok(scored.reasons.some((r) => r.label.includes("Weekend Baking")));
  });

  it("applies manual related in either direction without excluding", () => {
    const pinned = baseCandidate({ id: "pinned", title: "Pinned" });
    const fromSource = scoreInternalLinkRecommendation(source, pinned);
    assert.ok(fromSource.reasons.some((r) => r.kind === "manual_related"));

    const reverseSource = baseCandidate({
      id: "other",
      title: "Other",
      relatedRecipeIds: ["src"],
    });
    const reverse = scoreInternalLinkRecommendation(source, reverseSource);
    assert.ok(reverse.reasons.some((r) => r.kind === "manual_related"));

    const recs = recommendInternalRecipeLinks({
      source,
      candidates: [pinned],
      acceptedRecipeIds: [],
    });
    assert.equal(recs.length, 1);
    assert.equal(recs[0]?.recipeId, "pinned");
  });

  it("awards strong category/course; method-only stays below threshold", () => {
    const coursePeer = baseCandidate({
      id: "course-peer",
      title: "Course peer",
      course: "Dessert",
    });
    assert.ok(
      scoreInternalLinkRecommendation(source, coursePeer).score >= INTERNAL_LINK_MIN_SCORE,
    );

    const methodOnly = baseCandidate({
      id: "method-only",
      title: "Method only",
      method: "Oven",
    });
    const methodScore = scoreInternalLinkRecommendation(source, methodOnly);
    assert.equal(methodScore.score, INTERNAL_LINK_SCORE_METHOD);
    assert.ok(methodScore.score < INTERNAL_LINK_MIN_SCORE);

    const recs = recommendInternalRecipeLinks({
      source,
      candidates: [methodOnly],
    });
    assert.deepEqual(recs, []);
  });

  it("scores type, cuisine, and tags without empty accidental matches", () => {
    const typed = baseCandidate({
      id: "typed",
      title: "Typed",
      typeId: "type-cookie",
      typeName: "Cookies",
    });
    assert.ok(
      scoreInternalLinkRecommendation(source, typed).reasons.some((r) => r.kind === "type"),
    );

    const cuisineOnly = baseCandidate({
      id: "cuisine",
      title: "Cuisine",
      cuisine: "American",
    });
    const cuisineScore = scoreInternalLinkRecommendation(source, cuisineOnly);
    assert.ok(cuisineScore.reasons.some((r) => r.kind === "cuisine"));
    assert.ok(cuisineScore.score < INTERNAL_LINK_MIN_SCORE);

    const emptyCuisine = baseCandidate({
      id: "empty-c",
      title: "Empty cuisine",
      cuisine: "",
    });
    assert.equal(
      scoreInternalLinkRecommendation(
        { ...source, cuisine: "" },
        emptyCuisine,
      ).reasons.some((r) => r.kind === "cuisine"),
      false,
    );

    const tagged = baseCandidate({
      id: "tagged",
      title: "Tagged",
      tags: ["sweet", "other"],
    });
    const tagScore = scoreInternalLinkRecommendation(source, tagged);
    assert.ok(tagScore.reasons.some((r) => r.kind === "tags"));
    assert.ok(tagScore.score < INTERNAL_LINK_MIN_SCORE);
  });
});

describe("internal link recommendations — ingredients", () => {
  const source = baseCandidate({
    id: "src",
    title: "Source cookies",
    ingredients: [
      { identityKey: "salt", label: "salt" },
      { identityKey: "water", label: "water" },
      { identityKey: "oil", label: "oil" },
      { identityKey: "flour", label: "flour" },
      { identityKey: "butter", label: "butter" },
      { identityKey: "chocolate", label: "chocolate" },
      { identityKey: "oats", label: "oats" },
      { identityKey: "banana", label: "banana" },
      { identityKey: "cinnamon", label: "cinnamon" },
    ],
  });

  it("generic-only overlap contributes 0", () => {
    const candidate = baseCandidate({
      id: "gen",
      title: "Generic peer",
      ingredients: [
        { identityKey: "salt", label: "salt" },
        { identityKey: "water", label: "water" },
        { identityKey: "oil", label: "oil" },
      ],
    });
    const scored = scoreInternalLinkRecommendation(source, candidate);
    assert.equal(
      scored.reasons.some((r) => r.kind === "ingredients"),
      false,
    );
    assert.ok(scored.score < INTERNAL_LINK_MIN_SCORE);
  });

  it("weak flour/butter alone does not pass threshold", () => {
    const candidate = baseCandidate({
      id: "weak",
      title: "Weak baking peer",
      ingredients: [
        { identityKey: "flour", label: "flour" },
        { identityKey: "butter", label: "butter" },
      ],
    });
    const scored = scoreInternalLinkRecommendation(source, candidate);
    assert.equal(scored.score, 0);
    assert.deepEqual(
      recommendInternalRecipeLinks({ source, candidates: [candidate] }),
      [],
    );
  });

  it("meaningful overlap scores with capped contribution and clean reasons", () => {
    const candidate = baseCandidate({
      id: "good",
      title: "Oat cookies",
      ingredients: [
        { identityKey: "salt", label: "salt" },
        { identityKey: "chocolate", label: "chocolate" },
        { identityKey: "oats", label: "oats" },
        { identityKey: "banana", label: "banana" },
        { identityKey: "cinnamon", label: "cinnamon" },
      ],
    });
    const scored = scoreInternalLinkRecommendation(source, candidate);
    assert.equal(scored.score, INTERNAL_LINK_SCORE_INGREDIENT_CAP);
    const reason = scored.reasons.find((r) => r.kind === "ingredients");
    assert.ok(reason);
    assert.match(reason!.label, /Shares 4 ingredients/);
    assert.equal(reason!.label.includes("salt"), false);
    assert.ok(reason!.ingredients?.includes("chocolate"));

    // Cap: 5 meaningful still ≤ 100
    const many = baseCandidate({
      id: "many",
      title: "Many",
      ingredients: [
        { identityKey: "chocolate", label: "chocolate" },
        { identityKey: "oats", label: "oats" },
        { identityKey: "banana", label: "banana" },
        { identityKey: "cinnamon", label: "cinnamon" },
        { identityKey: "vanilla", label: "vanilla" },
      ],
    });
    const sourceMany = baseCandidate({
      id: "src2",
      title: "Src2",
      ingredients: many.ingredients,
    });
    assert.equal(
      scoreInternalLinkRecommendation(sourceMany, many).score,
      INTERNAL_LINK_SCORE_INGREDIENT_CAP,
    );
  });
});

describe("internal link recommendations — pipeline", () => {
  it("excludes self, draft, and accepted; keeps related-shelf peers", () => {
    const source = baseCandidate({
      id: "src",
      title: "Source",
      series: [{ id: "s1", name: "Breads" }],
      relatedRecipeIds: ["related"],
    });
    const self = baseCandidate({
      id: "src",
      title: "Self",
      series: [{ id: "s1", name: "Breads" }],
    });
    const draft = baseCandidate({
      id: "draft",
      title: "Draft",
      status: "draft",
      series: [{ id: "s1", name: "Breads" }],
    });
    const accepted = baseCandidate({
      id: "accepted",
      title: "Accepted",
      series: [{ id: "s1", name: "Breads" }],
    });
    const related = baseCandidate({
      id: "related",
      title: "Related pin",
      series: [{ id: "s1", name: "Breads" }],
    });
    const peer = baseCandidate({
      id: "peer",
      title: "Peer",
      series: [{ id: "s1", name: "Breads" }],
    });

    const recs = recommendInternalRecipeLinks({
      source,
      candidates: [self, draft, accepted, related, peer],
      acceptedRecipeIds: ["accepted"],
    });
    const ids = recs.map((r) => r.recipeId);
    assert.equal(ids.includes("src"), false);
    assert.equal(ids.includes("draft"), false);
    assert.equal(ids.includes("accepted"), false);
    assert.ok(ids.includes("related"));
    assert.ok(ids.includes("peer"));
  });

  it("applies threshold exactly at 90 and does not fill", () => {
    const source = baseCandidate({
      id: "src",
      title: "Source",
      course: "Dessert",
    });
    // course alone = 90
    const atFloor = baseCandidate({
      id: "floor",
      title: "Floor",
      course: "Dessert",
    });
    // method alone = 15
    const below = baseCandidate({
      id: "below",
      title: "Below",
      method: "Oven",
    });
    source.method = "Oven";

    const recs = recommendInternalRecipeLinks({
      source,
      candidates: [atFloor, below],
      minScore: 90,
    });
    assert.deepEqual(
      recs.map((r) => r.recipeId),
      ["floor"],
    );
    assert.ok((recs[0]?.score ?? 0) >= 90);
  });

  it("limits to top 5 with deterministic tie-break", () => {
    const source = baseCandidate({
      id: "src",
      title: "Source",
      course: "Main",
    });
    const candidates = ["f", "e", "d", "c", "b", "a"].map((id, index) =>
      baseCandidate({
        id,
        title: `Title ${id}`,
        course: "Main",
        // Same score path; vary publishedAt — newer first among ties
        publishedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      }),
    );

    const first = recommendInternalRecipeLinks({ source, candidates });
    const second = recommendInternalRecipeLinks({ source, candidates });
    assert.equal(first.length, INTERNAL_LINK_RECOMMENDATION_LIMIT);
    assert.deepEqual(
      first.map((r) => r.recipeId),
      second.map((r) => r.recipeId),
    );
    // Newest publishedAt among equal course scores first: a (Jan 6) … 
    assert.equal(first[0]?.recipeId, "a");
  });

  it("tie-breaks by title then id when publishedAt equal", () => {
    const source = baseCandidate({
      id: "src",
      title: "Source",
      course: "Main",
    });
    const candidates = [
      baseCandidate({
        id: "z",
        title: "Beta",
        course: "Main",
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
      baseCandidate({
        id: "a",
        title: "Alpha",
        course: "Main",
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
      baseCandidate({
        id: "b",
        title: "Alpha",
        course: "Main",
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const recs = recommendInternalRecipeLinks({ source, candidates });
    assert.deepEqual(
      recs.map((r) => r.recipeId),
      ["a", "b", "z"],
    );
  });

  it("diversity prefers ≤2 per Series then fills remaining strong same-Series", () => {
    assert.equal(INTERNAL_LINK_SERIES_DIVERSITY_MAX, 2);
    const source = baseCandidate({
      id: "src",
      title: "Source",
      series: [{ id: "breads", name: "Breads" }],
      course: "Bread",
    });
    const breads = ["b1", "b2", "b3", "b4", "b5"].map((id) =>
      baseCandidate({
        id,
        title: id,
        series: [{ id: "breads", name: "Breads" }],
        publishedAt: "2026-02-01T00:00:00.000Z",
      }),
    );
    const otherStrong = baseCandidate({
      id: "dessert",
      title: "Cake",
      course: "Bread",
      series: [{ id: "cakes", name: "Cakes" }],
      publishedAt: "2026-01-01T00:00:00.000Z",
    });
    const weak = baseCandidate({
      id: "weak",
      title: "Weak",
      method: "Oven",
    });
    source.method = "Oven";

    const recs = recommendInternalRecipeLinks({
      source,
      candidates: [...breads, otherStrong, weak],
    });
    assert.equal(recs.some((r) => r.recipeId === "weak"), false);
    // First two breads + dessert + deferred strong breads to fill to 5
    assert.ok(recs.length <= INTERNAL_LINK_RECOMMENDATION_LIMIT);
    assert.ok(recs.every((r) => r.score >= INTERNAL_LINK_MIN_SCORE));
    assert.ok(recs.some((r) => r.recipeId === "dessert"));
  });

  it("returns empty when nothing passes threshold", () => {
    const source = baseCandidate({ id: "src", title: "Source", method: "Oven" });
    const candidate = baseCandidate({ id: "x", title: "X", method: "Oven" });
    assert.deepEqual(
      recommendInternalRecipeLinks({ source, candidates: [candidate] }),
      [],
    );
  });

  it("passing recommendations always include meaningful reasons", () => {
    const source = baseCandidate({
      id: "src",
      title: "Source",
      series: [{ id: "s1", name: "Breads" }],
    });
    const candidate = baseCandidate({
      id: "peer",
      title: "Peer",
      series: [{ id: "s1", name: "Breads" }],
    });
    const [rec] = recommendInternalRecipeLinks({ source, candidates: [candidate] });
    assert.ok(rec);
    assert.ok(rec.reasons.length > 0);
    assert.ok(rec.reasons.every((r) => r.label.trim().length > 0));
  });
});
