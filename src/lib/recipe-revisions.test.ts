import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildRecipeRevisionSnapshot,
  contentPayloadForHash,
  formatRecipeRevisionBaselineReport,
  hashRecipeRevisionSnapshot,
  humanizeRecipeRevisionReason,
  resolveRecipeRevisionReason,
  stableSerialize,
} from "./recipe-revisions.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

describe("recipe revision history", () => {
  it("adds RecipeRevision with SetNull delete policy and stableRecipeId", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.match(schema, /model RecipeRevision/);
    assert.match(schema, /stableRecipeId/);
    assert.match(schema, /onDelete:\s*SetNull/);
    assert.match(schema, /revisions\s+RecipeRevision\[\]/);
  });

  it("builds deterministic hashes ignoring key order and category order", () => {
    const a = buildRecipeRevisionSnapshot({
      title: "Baguettes",
      excerpt: "x",
      featured: false,
      seasonal: true,
      typeId: "t1",
      categoryIds: ["c2", "c1"],
      values: { b: 1, a: { z: 2, m: 3 } },
      slug: "baguettes",
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
    });
    const b = buildRecipeRevisionSnapshot({
      title: "Baguettes",
      excerpt: "x",
      featured: false,
      seasonal: true,
      typeId: "t1",
      categoryIds: ["c1", "c2"],
      values: { a: { m: 3, z: 2 }, b: 1 },
      slug: "baguettes",
      status: "published",
      publishedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(hashRecipeRevisionSnapshot(a), hashRecipeRevisionSnapshot(b));
    assert.equal(stableSerialize(contentPayloadForHash(a)), stableSerialize(contentPayloadForHash(b)));
  });

  it("excludes slug and status from content hash so URL/publish-only changes do not duplicate", () => {
    const base = {
      title: "Baguettes",
      excerpt: "x",
      featured: false,
      seasonal: false,
      typeId: "t1",
      categoryIds: ["c1"],
      values: { ingredients: [] },
    };
    const draft = buildRecipeRevisionSnapshot({
      ...base,
      slug: "old",
      status: "draft",
      publishedAt: null,
    });
    const published = buildRecipeRevisionSnapshot({
      ...base,
      slug: "new-slug",
      status: "published",
      publishedAt: "2026-09-07T00:00:00.000Z",
    });
    assert.equal(hashRecipeRevisionSnapshot(draft), hashRecipeRevisionSnapshot(published));
  });

  it("includes public update fields in content hash when editorial note changes", () => {
    const base = {
      title: "Baguettes",
      excerpt: "x",
      featured: false,
      seasonal: false,
      typeId: "t1",
      categoryIds: ["c1"],
      values: { ingredients: [] },
      slug: "baguettes",
      status: "published" as const,
      publishedAt: "2026-01-01T00:00:00.000Z",
    };
    const a = buildRecipeRevisionSnapshot(base);
    const b = buildRecipeRevisionSnapshot({
      ...base,
      publicUpdateNote: "We retested this recipe and adjusted the baking time.",
      publicUpdatedAt: "2026-09-07T12:00:00.000Z",
    });
    assert.notEqual(hashRecipeRevisionSnapshot(a), hashRecipeRevisionSnapshot(b));
  });

  it("resolves revision reasons and human labels", () => {
    assert.equal(resolveRecipeRevisionReason({ isCreate: true }), "created");
    assert.equal(
      resolveRecipeRevisionReason({ oldStatus: "draft", newStatus: "published" }),
      "published",
    );
    assert.equal(
      resolveRecipeRevisionReason({ oldStatus: "published", newStatus: "draft" }),
      "moved_to_draft",
    );
    assert.equal(humanizeRecipeRevisionReason("baseline"), "Initial baseline");
  });

  it("formats baseline report without PII", () => {
    const report = formatRecipeRevisionBaselineReport({
      status: "SUCCESS",
      examined: 42,
      created: 39,
      alreadyVersioned: 3,
      failures: 0,
    });
    assert.match(report, /Recipes examined:\s+42/);
    assert.match(report, /Baselines created:\s+39/);
    assert.match(report, /SUCCESS/);
    assert.doesNotMatch(report, /@/);
  });

  it("wires transactional revision create into saveRecipeAction and restore action", () => {
    const actions = read("app/admin/actions.ts");
    assert.match(actions, /createRecipeRevisionIfChanged/);
    assert.match(actions, /\$transaction/);
    assert.match(actions, /restoreRecipeRevisionAction/);
    assert.match(actions, /restoreRecipeRevisionContent/);
  });

  it("exposes History UI under recipe admin and baseline CLI", () => {
    const history = read("app/admin/(app)/recipes/[id]/history/page.tsx");
    assert.match(history, /Revision History|REVISION HISTORY|History/);
    assert.match(history, /keeps the current public URL/);
    assert.match(read("app/admin/(app)/recipes/[id]/history/[revisionId]/page.tsx"), /Restore content/);
    assert.match(read("components/admin/RecipeEditor.tsx"), /RecipeEditorSubnav/);
    const pkg = readFileSync(path.join(srcRoot, "..", "package.json"), "utf8");
    assert.match(pkg, /db:backfill-recipe-revisions/);
  });
});
