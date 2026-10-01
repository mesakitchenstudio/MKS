import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  mapRecipeRowToRecommendationCandidate,
  parseSubmittedContextualInternalLinks,
  serializeContextualInternalLinksForForm,
} from "./internal-link-recommendations-admin.ts";
import {
  recommendInternalRecipeLinks,
  scoreInternalLinkRecommendation,
} from "./internal-link-recommendations.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(path.join(root, rel), "utf8");
}

function fakeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    title: "Cookie",
    slug: "cookie",
    status: "published",
    publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    relatedRecipeIds: "[]",
    values: JSON.stringify({
      course: "Dessert",
      method: "Oven",
      cuisine: "American",
      tags: ["sweet"],
    }),
    typeId: "type-1",
    type: { id: "type-1", name: "Cookies" },
    categories: [{ category: { id: "c1", name: "Cookies", group: "desserts" } }],
    seriesItems: [{ series: { id: "s1", title: "Breads" } }],
    recipeIngredients: [
      {
        ingredientId: "ing-choco",
        authoredItem: "chocolate",
        authoredItemNorm: "chocolate",
        ingredient: { id: "ing-choco", name: "chocolate" },
      },
      {
        ingredientId: "ing-salt",
        authoredItem: "salt",
        authoredItemNorm: "salt",
        ingredient: { id: "ing-salt", name: "Kosher salt" },
      },
    ],
    ...overrides,
  };
}

describe("internal link admin adapter — mapping", () => {
  it("maps Recipe rows into scorer candidates with Series + ingredient identity", () => {
    const candidate = mapRecipeRowToRecommendationCandidate(fakeRow() as never);
    assert.equal(candidate.id, "r1");
    assert.equal(candidate.course, "Dessert");
    assert.deepEqual(candidate.series, [{ id: "s1", name: "Breads" }]);
    assert.deepEqual(candidate.collections, []);
    assert.ok(candidate.ingredients?.some((i) => i.identityKey === "ing-choco"));
    assert.ok(candidate.ingredients?.some((i) => i.label === "chocolate"));
  });

  it("feeds scorer so Series + meaningful ingredients produce reasons; generics do not", () => {
    const source = mapRecipeRowToRecommendationCandidate(fakeRow({ id: "src" }) as never);
    const peer = mapRecipeRowToRecommendationCandidate(
      fakeRow({
        id: "peer",
        title: "Oat cookies",
        seriesItems: [{ series: { id: "s1", title: "Breads" } }],
        recipeIngredients: [
          {
            ingredientId: "ing-choco",
            authoredItem: "chocolate chunks",
            authoredItemNorm: "chocolate chunks",
            ingredient: { id: "ing-choco", name: "chocolate" },
          },
          {
            ingredientId: "ing-salt",
            authoredItem: "salt",
            authoredItemNorm: "salt",
            ingredient: { id: "ing-salt", name: "Kosher salt" },
          },
        ],
      }) as never,
    );
    const scored = scoreInternalLinkRecommendation(source, peer);
    assert.ok(scored.reasons.some((r) => r.kind === "series"));
    assert.ok(scored.reasons.some((r) => r.kind === "ingredients"));
    const ingredientReason = scored.reasons.find((r) => r.kind === "ingredients");
    assert.equal(ingredientReason?.label.includes("salt"), false);
    assert.ok(ingredientReason?.label.toLowerCase().includes("chocolate"));

    const genericOnly = mapRecipeRowToRecommendationCandidate(
      fakeRow({
        id: "gen",
        title: "Generic",
        seriesItems: [],
        categories: [],
        values: JSON.stringify({ method: "Stovetop" }),
        recipeIngredients: [
          {
            ingredientId: "ing-salt",
            authoredItem: "salt",
            authoredItemNorm: "salt",
            ingredient: { id: "ing-salt", name: "Kosher salt" },
          },
        ],
      }) as never,
    );
    const weakSource = mapRecipeRowToRecommendationCandidate(
      fakeRow({
        id: "src2",
        seriesItems: [],
        categories: [],
        values: JSON.stringify({ method: "Stovetop" }),
        recipeIngredients: [
          {
            ingredientId: "ing-salt",
            authoredItem: "salt",
            authoredItemNorm: "salt",
            ingredient: { id: "ing-salt", name: "Kosher salt" },
          },
        ],
      }) as never,
    );
    assert.deepEqual(
      recommendInternalRecipeLinks({ source: weakSource, candidates: [genericOnly] }),
      [],
    );
  });

  it("manual below-threshold target remains Published-eligible without score gate", () => {
    const source = mapRecipeRowToRecommendationCandidate(fakeRow({ id: "src" }) as never);
    const weak = mapRecipeRowToRecommendationCandidate(
      fakeRow({
        id: "weak",
        title: "Unrelated",
        seriesItems: [],
        categories: [],
        values: JSON.stringify({ method: "Grill" }),
        recipeIngredients: [],
        relatedRecipeIds: "[]",
      }) as never,
    );
    assert.ok(scoreInternalLinkRecommendation(source, weak).score < 90);
    assert.equal(weak.status, "published");
  });
});

describe("internal link admin adapter — form serialization", () => {
  it("serializes absence as [] for form submit without inventing values persistence", () => {
    assert.equal(serializeContextualInternalLinksForForm({}, "src"), "[]");
    assert.deepEqual(parseSubmittedContextualInternalLinks('[{"recipeId":"a"}]'), [
      { recipeId: "a" },
    ]);
    assert.equal(parseSubmittedContextualInternalLinks(""), undefined);
    assert.equal(parseSubmittedContextualInternalLinks(null), undefined);
  });
});

describe("Phase 11C — Admin wiring contracts", () => {
  it("gates Internal links UI server-side and places it after Related Recipes", () => {
    const editor = read("components/admin/RecipeEditor.tsx");
    const editPage = read("app/admin/(app)/recipes/[id]/page.tsx");
    const ui = read("components/admin/ContextualInternalLinksEditor.tsx");
    const actions = read("app/admin/actions.ts");

    assert.match(editPage, /isInternalLinkRecommendationsEnabled/);
    assert.match(editPage, /loadAdminInternalLinkRecommendations/);
    assert.match(editor, /ContextualInternalLinksEditor/);
    assert.match(editor, /internalLinkRecommendationsEnabled/);
    assert.match(editor, /contextualInternalLinks/);
    assert.match(ui, /Internal links/);
    assert.match(ui, /No strong internal-link recommendations yet/);
    assert.match(ui, /Recommendations temporarily unavailable/);
    assert.match(ui, /Maximum \{CONTEXTUAL_INTERNAL_LINK_MAX\} internal links/);
    assert.match(ui, /as an internal link/);
    assert.match(ui, /from internal links/);
    assert.match(ui, /min-w-0/);
    assert.match(ui, /break-words/);

    const relatedIdx = editor.indexOf("RelatedRecipePinsEditor");
    const internalIdx = editor.indexOf("ContextualInternalLinksEditor");
    assert.ok(relatedIdx > 0 && internalIdx > relatedIdx);

    assert.match(actions, /applyContextualInternalLinksOnSave/);
    assert.match(actions, /isInternalLinkRecommendationsEnabled/);
  });

  it("does not add public Try next / Cooking / Preview / Prisma for 11C", () => {
    const detail = read("lib/recipe-detail-presentation.ts");
    assert.doesNotMatch(detail, /Try next|contextualInternalLinks/);
    const schema = readFileSync(path.join(root, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /ContextualInternalLink|internalLinkRecommendation/i);
    assert.doesNotMatch(read("lib/flags.ts"), /NEXT_PUBLIC_INTERNAL_LINK_RECOMMENDATIONS/);
  });

  it("Related pins editor remains a separate surface", () => {
    const pins = read("components/admin/RelatedRecipePinsEditor.tsx");
    assert.match(pins, /Related recipes/);
    assert.doesNotMatch(pins, /contextualInternalLinks/);
    assert.doesNotMatch(pins, /Internal links/);
  });

  it("unit-test-files.json includes 11C tests", () => {
    const allow = JSON.parse(
      readFileSync(path.join(root, "..", "scripts", "unit-test-files.json"), "utf8"),
    ) as string[];
    assert.ok(allow.includes("src/lib/contextual-internal-links-save.test.ts"));
    assert.ok(allow.includes("src/lib/internal-link-recommendations-admin.test.ts"));
    assert.ok(allow.includes("src/lib/contextual-internal-links.test.ts"));
    assert.ok(allow.includes("src/lib/internal-link-recommendations.test.ts"));
  });
});
