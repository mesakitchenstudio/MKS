import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyContextualInternalLinksOnSave } from "./contextual-internal-links-save.ts";
import { buildRecipeRevisionSnapshot, hashRecipeRevisionSnapshot } from "./recipe-revisions.ts";

describe("contextual internal links — save policy", () => {
  const sourceId = "src";

  it("gate OFF preserves previous links and ignores client mutation", () => {
    const previous = {
      intro: "x",
      contextualInternalLinks: [{ recipeId: "a" }, { recipeId: "b" }],
    };
    const result = applyContextualInternalLinksOnSave({
      previousValues: previous,
      nextValues: { intro: "y", title: "t" },
      submittedRaw: [{ recipeId: "evil" }],
      sourceRecipeId: sourceId,
      featureEnabled: false,
      resolveTarget: () => ({ exists: true, status: "published" }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.values.contextualInternalLinks, [
      { recipeId: "a" },
      { recipeId: "b" },
    ]);
    assert.equal(result.values.intro, "y");
  });

  it("gate OFF with no previous links does not invent empty array", () => {
    const result = applyContextualInternalLinksOnSave({
      previousValues: { intro: "x" },
      nextValues: { intro: "y" },
      submittedRaw: [],
      sourceRecipeId: sourceId,
      featureEnabled: false,
      resolveTarget: () => ({ exists: true, status: "published" }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal("contextualInternalLinks" in result.values, false);
  });

  it("gate ON accepts new Published targets and omits empty", () => {
    const result = applyContextualInternalLinksOnSave({
      previousValues: {},
      nextValues: { intro: "x" },
      submittedRaw: [{ recipeId: "pub1" }],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: (id) =>
        id === "pub1" ? { exists: true, status: "published" } : { exists: false },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.values.contextualInternalLinks, [{ recipeId: "pub1" }]);

    const cleared = applyContextualInternalLinksOnSave({
      previousValues: { contextualInternalLinks: [{ recipeId: "pub1" }] },
      nextValues: { intro: "x" },
      submittedRaw: [],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: () => ({ exists: true, status: "published" }),
    });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.equal("contextualInternalLinks" in cleared.values, false);
  });

  it("rejects brand-new Draft or missing targets", () => {
    const draft = applyContextualInternalLinksOnSave({
      previousValues: {},
      nextValues: {},
      submittedRaw: [{ recipeId: "draft1" }],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: () => ({ exists: true, status: "draft" }),
    });
    assert.equal(draft.ok, false);

    const missing = applyContextualInternalLinksOnSave({
      previousValues: {},
      nextValues: {},
      submittedRaw: [{ recipeId: "gone" }],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: () => ({ exists: false }),
    });
    assert.equal(missing.ok, false);
  });

  it("retains previously accepted Draft/missing targets on save", () => {
    const previous = {
      contextualInternalLinks: [{ recipeId: "old-draft" }, { recipeId: "gone" }],
    };
    const result = applyContextualInternalLinksOnSave({
      previousValues: previous,
      nextValues: { intro: "keep" },
      submittedRaw: [{ recipeId: "old-draft" }, { recipeId: "gone" }],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: (id) =>
        id === "old-draft"
          ? { exists: true, status: "draft" }
          : { exists: false },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.values.contextualInternalLinks, [
      { recipeId: "old-draft" },
      { recipeId: "gone" },
    ]);
  });

  it("rejects self and enforces max 3 via normalization", () => {
    const self = applyContextualInternalLinksOnSave({
      previousValues: {},
      nextValues: {},
      submittedRaw: [{ recipeId: sourceId }],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: () => ({ exists: true, status: "published" }),
    });
    assert.equal(self.ok, true);
    if (!self.ok) return;
    assert.equal("contextualInternalLinks" in self.values, false);

    const many = applyContextualInternalLinksOnSave({
      previousValues: {},
      nextValues: {},
      submittedRaw: [
        { recipeId: "1" },
        { recipeId: "2" },
        { recipeId: "3" },
        { recipeId: "4" },
      ],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: () => ({ exists: true, status: "published" }),
    });
    assert.equal(many.ok, true);
    if (!many.ok) return;
    assert.deepEqual(many.values.contextualInternalLinks, [
      { recipeId: "1" },
      { recipeId: "2" },
      { recipeId: "3" },
    ]);
  });

  it("strips client-invented title/slug fields from persisted entries", () => {
    const result = applyContextualInternalLinksOnSave({
      previousValues: {},
      nextValues: {},
      submittedRaw: [
        {
          recipeId: "pub1",
          title: "Hacked",
          slug: "hacked",
          href: "https://evil.example",
          score: 999,
        },
      ],
      sourceRecipeId: sourceId,
      featureEnabled: true,
      resolveTarget: () => ({ exists: true, status: "published" }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.values.contextualInternalLinks, [{ recipeId: "pub1" }]);
  });

  it("reorder changes content hash through values", () => {
    const base = {
      title: "A",
      excerpt: "",
      featured: false,
      seasonal: false,
      typeId: "t",
      categoryIds: [],
      slug: "a",
      status: "published",
      publishedAt: null,
    };
    const a = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        contextualInternalLinks: [{ recipeId: "1" }, { recipeId: "2" }],
      },
    });
    const b = buildRecipeRevisionSnapshot({
      ...base,
      values: {
        contextualInternalLinks: [{ recipeId: "2" }, { recipeId: "1" }],
      },
    });
    assert.notEqual(hashRecipeRevisionSnapshot(a), hashRecipeRevisionSnapshot(b));
  });
});
