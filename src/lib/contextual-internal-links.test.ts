import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CONTEXTUAL_INTERNAL_LINK_MAX,
  canAcceptContextualInternalLink,
  getContextualInternalLinkIds,
  isContextualInternalLinkPubliclyEligible,
  isPublishedRecipeStatus,
  normalizeContextualInternalLinks,
  withContextualInternalLinks,
} from "./contextual-internal-links.ts";
import {
  buildRecipeRevisionSnapshot,
  hashRecipeRevisionSnapshot,
} from "./recipe-revisions.ts";

describe("contextual internal links — normalize", () => {
  it("treats missing/null/empty as absent (undefined, not [])", () => {
    assert.equal(normalizeContextualInternalLinks(undefined), undefined);
    assert.equal(normalizeContextualInternalLinks(null), undefined);
    assert.equal(normalizeContextualInternalLinks([]), undefined);
    assert.equal(normalizeContextualInternalLinks(""), undefined);
  });

  it("preserves order, drops duplicates, blanks, self, malformed", () => {
    const normalized = normalizeContextualInternalLinks(
      [
        { recipeId: "a" },
        { recipeId: " " },
        { recipeId: "b" },
        { recipeId: "a" },
        { title: "no-id" },
        "c",
        null,
        { recipeId: "self" },
        { recipeId: "d" },
      ],
      "self",
    );
    assert.deepEqual(normalized, [
      { recipeId: "a" },
      { recipeId: "b" },
      { recipeId: "c" },
    ]);
  });

  it("enforces max 3 retaining first occurrences", () => {
    const normalized = normalizeContextualInternalLinks([
      { recipeId: "1" },
      { recipeId: "2" },
      { recipeId: "3" },
      { recipeId: "4" },
    ]);
    assert.equal(CONTEXTUAL_INTERNAL_LINK_MAX, 3);
    assert.deepEqual(normalized, [
      { recipeId: "1" },
      { recipeId: "2" },
      { recipeId: "3" },
    ]);
  });

  it("parses JSON string input", () => {
    assert.deepEqual(normalizeContextualInternalLinks('[{"recipeId":"x"}]'), [
      { recipeId: "x" },
    ]);
    assert.equal(normalizeContextualInternalLinks("{nope"), undefined);
  });

  it("getContextualInternalLinkIds reads values safely", () => {
    assert.deepEqual(getContextualInternalLinkIds(undefined), []);
    assert.deepEqual(getContextualInternalLinkIds({}), []);
    assert.deepEqual(
      getContextualInternalLinkIds({
        contextualInternalLinks: [{ recipeId: "a" }, { recipeId: "a" }],
      }),
      ["a"],
    );
  });

  it("withContextualInternalLinks omits empty field (no [] churn)", () => {
    const base = { intro: "hello", contextualInternalLinks: [{ recipeId: "old" }] };
    const cleared = withContextualInternalLinks(base, [], "src");
    assert.equal("contextualInternalLinks" in cleared, false);
    assert.equal(cleared.intro, "hello");

    const set = withContextualInternalLinks({}, [{ recipeId: "a" }]);
    assert.deepEqual(set.contextualInternalLinks, [{ recipeId: "a" }]);
  });
});

describe("contextual internal links — accept eligibility", () => {
  it("allows Published manual target below recommendation threshold rules", () => {
    const result = canAcceptContextualInternalLink({
      sourceRecipeId: "src",
      targetRecipeId: "tgt",
      targetStatus: "published",
      existingIds: [],
    });
    assert.deepEqual(result, { ok: true });
  });

  it("rejects self, duplicate, max, draft, blank, missing", () => {
    assert.equal(
      canAcceptContextualInternalLink({
        sourceRecipeId: "src",
        targetRecipeId: "src",
        targetStatus: "published",
      }).ok,
      false,
    );
    assert.equal(
      canAcceptContextualInternalLink({
        sourceRecipeId: "src",
        targetRecipeId: "a",
        targetStatus: "published",
        existingIds: ["a"],
      }).reason,
      "duplicate",
    );
    assert.equal(
      canAcceptContextualInternalLink({
        sourceRecipeId: "src",
        targetRecipeId: "d",
        targetStatus: "published",
        existingIds: ["a", "b", "c"],
      }).reason,
      "max",
    );
    assert.equal(
      canAcceptContextualInternalLink({
        sourceRecipeId: "src",
        targetRecipeId: "d",
        targetStatus: "draft",
      }).reason,
      "not_published",
    );
    assert.equal(
      canAcceptContextualInternalLink({
        sourceRecipeId: "src",
        targetRecipeId: "  ",
        targetStatus: "published",
      }).reason,
      "blank",
    );
    assert.equal(
      canAcceptContextualInternalLink({
        sourceRecipeId: "src",
        targetRecipeId: "gone",
        targetExists: false,
        targetStatus: "published",
      }).reason,
      "missing_target",
    );
  });

  it("public eligibility is Published-only; draft retained but not public", () => {
    assert.equal(isPublishedRecipeStatus("published"), true);
    assert.equal(isPublishedRecipeStatus("Published"), true);
    assert.equal(isPublishedRecipeStatus("draft"), false);
    assert.equal(
      isContextualInternalLinkPubliclyEligible({
        targetExists: true,
        targetStatus: "draft",
      }),
      false,
    );
    assert.equal(
      isContextualInternalLinkPubliclyEligible({
        targetExists: true,
        targetStatus: "published",
      }),
      true,
    );
    assert.equal(
      isContextualInternalLinkPubliclyEligible({
        targetExists: false,
        targetStatus: "published",
      }),
      false,
    );
  });
});

describe("contextual internal links — revision / content hash", () => {
  const base = {
    title: "Flatbread",
    excerpt: "x",
    featured: false,
    seasonal: false,
    typeId: "t1",
    categoryIds: ["c1"],
    slug: "flatbread",
    status: "published",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };

  it("absence of contextualInternalLinks does not invent empty array in snapshot values", () => {
    const snap = buildRecipeRevisionSnapshot({
      ...base,
      values: { intro: "plain" },
    });
    assert.equal("contextualInternalLinks" in snap.values, false);
  });

  it("accept / remove / reorder change content hash", () => {
    const none = buildRecipeRevisionSnapshot({
      ...base,
      values: { intro: "plain" },
    });
    const one = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        intro: "plain",
        contextualInternalLinks: [{ recipeId: "a" }],
      },
    });
    const two = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        intro: "plain",
        contextualInternalLinks: [{ recipeId: "a" }, { recipeId: "b" }],
      },
    });
    const reordered = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        intro: "plain",
        contextualInternalLinks: [{ recipeId: "b" }, { recipeId: "a" }],
      },
    });

    assert.notEqual(hashRecipeRevisionSnapshot(none), hashRecipeRevisionSnapshot(one));
    assert.notEqual(hashRecipeRevisionSnapshot(one), hashRecipeRevisionSnapshot(two));
    assert.notEqual(hashRecipeRevisionSnapshot(two), hashRecipeRevisionSnapshot(reordered));
  });
});
