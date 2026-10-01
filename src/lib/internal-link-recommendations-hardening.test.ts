import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  classifyInternalLinkIngredientImportance,
  INTERNAL_LINK_MIN_SCORE,
  recommendInternalRecipeLinks,
  scoreInternalLinkRecommendation,
  type RecipeRecommendationCandidate,
} from "./internal-link-recommendations.ts";
import { applyContextualInternalLinksOnSave } from "./contextual-internal-links-save.ts";
import { orderContextualInternalLinkTargetsByAcceptedIds } from "./contextual-internal-links-public.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function candidate(
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

describe("Phase 11E — hardening contracts", () => {
  it("target save/delete/restore all reverse-revalidate linking sources", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /revalidateRecipesLinkingToContextualTarget\(recipe\.id\)/);
    assert.match(actions, /revalidateRecipesLinkingToContextualTarget\(existing\.id\)/);
    assert.match(actions, /revalidateRecipesLinkingToContextualTarget\(recipeId\)/);
    // Delete discovers reverse links before destroying the target row.
    const deleteIdx = actions.indexOf("export async function deleteRecipeAction");
    const reverseInDelete = actions.indexOf(
      "revalidateRecipesLinkingToContextualTarget(existing.id)",
      deleteIdx,
    );
    const destroyIdx = actions.indexOf("recipe.delete", deleteIdx);
    assert.ok(deleteIdx > 0 && reverseInDelete > deleteIdx && destroyIdx > reverseInDelete);
  });

  it("public resolver selects values only for dishName display-title convention", () => {
    const pub = read("lib/contextual-internal-links-public.ts");
    assert.match(pub, /resolveRecipeCardTitle/);
    assert.match(pub, /dishName/);
    assert.match(pub, /status:\s*"published"/);
    assert.doesNotMatch(pub, /recommendInternalRecipeLinks/);
  });

  it("gate OFF save retains prior IDs; gate ON rejects new Draft but keeps prior unavailable", () => {
    const previous = {
      contextualInternalLinks: [{ recipeId: "kept-draft" }],
    };
    const off = applyContextualInternalLinksOnSave({
      previousValues: previous,
      nextValues: { intro: "x" },
      submittedRaw: [{ recipeId: "evil" }],
      sourceRecipeId: "src",
      featureEnabled: false,
      resolveTarget: () => ({ exists: true, status: "published" }),
    });
    assert.equal(off.ok, true);
    if (off.ok) {
      assert.deepEqual(off.values.contextualInternalLinks, [{ recipeId: "kept-draft" }]);
    }

    const keepUnavailable = applyContextualInternalLinksOnSave({
      previousValues: previous,
      nextValues: {},
      submittedRaw: [{ recipeId: "kept-draft" }],
      sourceRecipeId: "src",
      featureEnabled: true,
      resolveTarget: () => ({ exists: false, status: null }),
    });
    assert.equal(keepUnavailable.ok, true);
    if (keepUnavailable.ok) {
      assert.deepEqual(keepUnavailable.values.contextualInternalLinks, [
        { recipeId: "kept-draft" },
      ]);
    }

    const rejectNewDraft = applyContextualInternalLinksOnSave({
      previousValues: previous,
      nextValues: {},
      submittedRaw: [{ recipeId: "kept-draft" }, { recipeId: "new-draft" }],
      sourceRecipeId: "src",
      featureEnabled: true,
      resolveTarget: (id) =>
        id === "kept-draft"
          ? { exists: true, status: "draft" }
          : { exists: true, status: "draft" },
    });
    assert.equal(rejectNewDraft.ok, false);
  });

  it("partial availability preserves relative accepted order", () => {
    const ordered = orderContextualInternalLinkTargetsByAcceptedIds(
      ["c", "a", "b"],
      [
        { id: "a", title: "A", slug: "a" },
        { id: "c", title: "C", slug: "c" },
      ],
    );
    assert.deepEqual(
      ordered.map((t) => t.id),
      ["c", "a"],
    );
  });

  it("Cooking and Print exclude Try next; public path has no scoring", () => {
    assert.doesNotMatch(read("app/recipes/[slug]/cook/page.tsx"), /Try next|RecipeTryNext/);
    assert.match(read("components/recipe/RecipeTryNext.tsx"), /no-print/);
    assert.doesNotMatch(
      read("lib/recipe-detail-presentation.ts"),
      /recommendInternalRecipeLinks/,
    );
  });

  it("no Prisma / NEXT_PUBLIC / analytics in #11 surface", () => {
    const schema = readFileSync(path.join(root, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /ContextualInternalLink|TryNext/);
    assert.doesNotMatch(read("lib/flags.ts"), /NEXT_PUBLIC_INTERNAL_LINK/);
    assert.doesNotMatch(
      read("components/recipe/RecipeTryNext.tsx"),
      /analytics|trackEvent|gtag/,
    );
  });
});

describe("Phase 11E — recommendation quality fixtures", () => {
  it("method-only and pantry-only stay below threshold; Series ranks strongly", () => {
    const source = candidate({
      id: "src",
      title: "Soft Stovetop Flatbread",
      series: [{ id: "breads", name: "Breads" }],
      course: "Bread",
      method: "Stovetop",
      ingredients: [
        { identityKey: "salt", label: "salt" },
        { identityKey: "water", label: "water" },
        { identityKey: "oil", label: "oil" },
        { identityKey: "flour", label: "flour" },
        { identityKey: "yeast", label: "yeast" },
      ],
    });

    const baguette = candidate({
      id: "baguette",
      title: "Classic French Baguettes",
      series: [{ id: "breads", name: "Breads" }],
      course: "Bread",
      method: "Oven",
      ingredients: [
        { identityKey: "flour", label: "flour" },
        { identityKey: "yeast", label: "yeast" },
        { identityKey: "salt", label: "salt" },
        { identityKey: "water", label: "water" },
      ],
    });

    const chips = candidate({
      id: "chips",
      title: "Potato Chips",
      method: "Stovetop",
      ingredients: [
        { identityKey: "salt", label: "salt" },
        { identityKey: "oil", label: "oil" },
        { identityKey: "potato", label: "potato" },
      ],
    });

    const pantryTwin = candidate({
      id: "pantry",
      title: "Pantry Twin",
      ingredients: [
        { identityKey: "salt", label: "salt" },
        { identityKey: "water", label: "water" },
        { identityKey: "oil", label: "oil" },
      ],
    });

    const flourButter = candidate({
      id: "bake-weak",
      title: "Weak Baking Twin",
      ingredients: [
        { identityKey: "flour", label: "flour" },
        { identityKey: "butter", label: "butter" },
        { identityKey: "sugar", label: "sugar" },
      ],
    });

    const baguetteScore = scoreInternalLinkRecommendation(source, baguette);
    const chipsScore = scoreInternalLinkRecommendation(source, chips);
    const pantryScore = scoreInternalLinkRecommendation(source, pantryTwin);
    const weakBake = scoreInternalLinkRecommendation(source, flourButter);

    assert.ok(baguetteScore.score >= INTERNAL_LINK_MIN_SCORE);
    assert.ok(baguetteScore.reasons.some((r) => r.kind === "series"));
    assert.ok(chipsScore.score < INTERNAL_LINK_MIN_SCORE);
    assert.equal(pantryScore.score, 0);
    assert.ok(weakBake.score < INTERNAL_LINK_MIN_SCORE);

    const recs = recommendInternalRecipeLinks({
      source,
      candidates: [baguette, chips, pantryTwin, flourButter],
    });
    assert.deepEqual(
      recs.map((r) => r.recipeId),
      ["baguette"],
    );

    const again = recommendInternalRecipeLinks({
      source,
      candidates: [baguette, chips, pantryTwin, flourButter],
    });
    assert.deepEqual(
      again.map((r) => ({ id: r.recipeId, score: r.score, reasons: r.reasons.map((x) => x.label) })),
      recs.map((r) => ({ id: r.recipeId, score: r.score, reasons: r.reasons.map((x) => x.label) })),
    );
  });

  it("cookie cluster shares desserts signal; generic classification stays stable", () => {
    assert.equal(classifyInternalLinkIngredientImportance("olive oil"), "generic");
    assert.equal(classifyInternalLinkIngredientImportance("unsalted butter"), "weak");
    assert.equal(classifyInternalLinkIngredientImportance("chocolate"), "meaningful");

    const chunk = candidate({
      id: "chunk",
      title: "Chocolate Chunk Cookies",
      categories: [{ id: "cookies", name: "Cookies", group: "desserts" }],
      course: "Dessert",
      ingredients: [
        { identityKey: "chocolate", label: "chocolate" },
        { identityKey: "flour", label: "flour" },
        { identityKey: "butter", label: "butter" },
      ],
    });
    const oat = candidate({
      id: "oat",
      title: "Nut and Seed Oat Cookies",
      categories: [{ id: "cookies", name: "Cookies", group: "desserts" }],
      course: "Dessert",
      ingredients: [
        { identityKey: "oats", label: "oats" },
        { identityKey: "flour", label: "flour" },
        { identityKey: "butter", label: "butter" },
      ],
    });
    const scored = scoreInternalLinkRecommendation(chunk, oat);
    assert.ok(scored.score >= INTERNAL_LINK_MIN_SCORE);
    assert.ok(scored.reasons.some((r) => /Cookies|Dessert|course/i.test(r.label)));
    assert.equal(
      scored.reasons.some((r) => r.kind === "ingredients" && /flour|butter|salt/i.test(r.label)),
      false,
    );
  });

  it("shared holiday/season category alone does not clear the floor", () => {
    const a = candidate({
      id: "a",
      title: "Weekend Bread",
      categories: [{ id: "weekend", name: "Weekend", group: "holiday" }],
      method: "Oven",
    });
    const b = candidate({
      id: "b",
      title: "Weekend Cookies",
      categories: [{ id: "weekend", name: "Weekend", group: "holiday" }],
      method: "Oven",
    });
    const scored = scoreInternalLinkRecommendation(a, b);
    // Primary category 70 + method 15 = 85 — below threshold without stronger signals.
    assert.ok(scored.score < INTERNAL_LINK_MIN_SCORE);
    assert.equal(
      recommendInternalRecipeLinks({ source: a, candidates: [b] }).length,
      0,
    );
  });
});
