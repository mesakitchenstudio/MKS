import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  RECIPE_IDENTITY_BACKFILL_SETTING_KEY,
  backfillRecipeIdentity,
  formatRecipeIdentityBackfillReport,
  resolveRecipeFromLegacySlug,
} from "./recipe-identity.ts";
import {
  recipePublicPath,
  upsertRecipeSlugChangeRedirect,
} from "./redirects.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("recipe identity hardening wiring", () => {
  it("exposes an explicit backfill script and package command", () => {
    const pkg = readFileSync(path.join(root, "../..", "package.json"), "utf8");
    assert.match(pkg, /"db:backfill-recipe-identity"/);
    const script = readFileSync(
      path.join(root, "../..", "scripts", "backfill-recipe-identity.ts"),
      "utf8",
    );
    assert.match(script, /backfillRecipeIdentity/);
    assert.match(script, /formatRecipeIdentityBackfillReport/);
  });

  it("does not run identity backfill on public favorites/review request paths", () => {
    assert.doesNotMatch(read("lib/accounts.ts"), /ensureRecipeIdentityBackfill/);
    assert.doesNotMatch(read("lib/recipe-reviews.ts"), /ensureRecipeIdentityBackfill/);
  });

  it("resolves legacy slugs through redirects when Recipe.slug already changed", () => {
    const bySlug = new Map([
      ["new-slug", { id: "rid", slug: "new-slug", title: "T" }],
    ]);
    const redirects = new Map([
      ["/recipes/old-slug", "/recipes/new-slug"],
    ]);
    const hit = resolveRecipeFromLegacySlug("old-slug", bySlug, redirects);
    assert.equal(hit?.id, "rid");
    assert.equal(resolveRecipeFromLegacySlug("missing", bySlug, redirects), null);
  });

  it("formats an operational report", () => {
    const text = formatRecipeIdentityBackfillReport({
      status: "SUCCESS_WITH_ORPHANS",
      savesExamined: 10,
      savesResolved: 8,
      savesMerged: 2,
      savesOrphaned: 1,
      reviewsExamined: 5,
      reviewsResolved: 4,
      reviewsMerged: 1,
      reviewsOrphaned: 0,
      reviewConflicts: 0,
      reviewConflictDetails: [],
      funnelExamined: 3,
      funnelResolved: 2,
      funnelUnresolved: 1,
      alreadyDone: false,
    });
    assert.match(text, /Duplicates merged:\s+2/);
    assert.match(text, /SUCCESS_WITH_ORPHANS/);
  });
});

describe("recipe identity duplicate reconciliation", () => {
  const db = new PrismaClient();
  const suffix = `h-${Date.now()}`;
  let typeId = "";
  let userId = "";
  let recipeId = "";
  const oldSlug = `old-${suffix}`;
  const newSlug = `new-${suffix}`;

  before(async () => {
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    const user = await db.user.create({
      data: { email: `u-${suffix}@example.com`, name: "Hardening" },
    });
    userId = user.id;
    const recipe = await db.recipe.create({
      data: {
        slug: newSlug,
        title: "Renamed Recipe",
        typeId,
        status: "published",
        publishedAt: new Date(),
        values: "{}",
      },
    });
    recipeId = recipe.id;

    // Historical: saved under old slug, then again under new slug after rename.
    await db.recipeSave.create({
      data: {
        userId,
        recipeId: null,
        slug: oldSlug,
        title: "Old Title",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    });
    await db.recipeSave.create({
      data: {
        userId,
        recipeId: null,
        slug: newSlug,
        title: "New Title",
        createdAt: new Date("2025-06-01T00:00:00.000Z"),
      },
    });

    await upsertRecipeSlugChangeRedirect({
      previousSlug: oldSlug,
      nextSlug: newSlug,
      wasPublished: true,
    });

    // Equivalent reviews under old + new slug (safe merge).
    await db.recipeReview.create({
      data: {
        recipeId: null,
        recipeSlug: oldSlug,
        authorName: "A",
        authorEmail: `a-${suffix}@example.com`,
        rating: 4,
        body: "Same review text.",
        createdAt: new Date("2025-02-01T00:00:00.000Z"),
      },
    });
    await db.recipeReview.create({
      data: {
        recipeId: null,
        recipeSlug: newSlug,
        authorName: "A",
        authorEmail: `a-${suffix}@example.com`,
        rating: 4,
        body: "Same review text.",
        createdAt: new Date("2025-07-01T00:00:00.000Z"),
      },
    });

    // Divergent reviews — must conflict, not auto-delete.
    await db.recipeReview.create({
      data: {
        recipeId: null,
        recipeSlug: oldSlug,
        authorName: "B",
        authorEmail: `b-${suffix}@example.com`,
        rating: 5,
        body: "Loved the first bake.",
      },
    });
    await db.recipeReview.create({
      data: {
        recipeId: null,
        recipeSlug: newSlug,
        authorName: "B",
        authorEmail: `b-${suffix}@example.com`,
        rating: 2,
        body: "Changed my mind after the rename.",
      },
    });
  });

  after(async () => {
    await db.recipeReviewReply.deleteMany({
      where: { review: { authorEmail: { contains: suffix } } },
    });
    await db.recipeReview.deleteMany({
      where: { authorEmail: { contains: suffix } },
    });
    await db.recipeSave.deleteMany({ where: { userId } });
    await db.redirect.deleteMany({
      where: {
        OR: [{ fromPath: recipePublicPath(oldSlug) }, { fromPath: recipePublicPath(newSlug) }],
      },
    });
    await db.recipe.deleteMany({ where: { id: recipeId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.siteSetting.deleteMany({ where: { key: RECIPE_IDENTITY_BACKFILL_SETTING_KEY } });
    await db.$disconnect();
  });

  it("merges duplicate saves via redirect, merges equivalent reviews, reports conflicts", async () => {
    const run1 = await backfillRecipeIdentity({ force: true });
    assert.equal(run1.savesMerged >= 1, true);
    assert.equal(run1.reviewsMerged >= 1, true);
    assert.equal(run1.reviewConflicts >= 1, true);
    assert.match(
      run1.status,
      /SUCCESS_WITH_CONFLICTS|SUCCESS_WITH_ORPHANS_AND_CONFLICTS/,
    );

    const saves = await db.recipeSave.findMany({ where: { userId } });
    assert.equal(saves.length, 1);
    assert.equal(saves[0]?.recipeId, recipeId);
    assert.equal(saves[0]?.slug, newSlug);
    assert.equal(saves[0]?.createdAt.toISOString(), "2025-01-01T00:00:00.000Z");

    const equiv = await db.recipeReview.findMany({
      where: { authorEmail: `a-${suffix}@example.com` },
    });
    assert.equal(equiv.length, 1);
    assert.equal(equiv[0]?.recipeId, recipeId);

    const conflict = await db.recipeReview.findMany({
      where: { authorEmail: `b-${suffix}@example.com` },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(conflict.length, 2);
    assert.ok(conflict.every((row) => row.recipeId === recipeId));

    const run2 = await backfillRecipeIdentity({ force: true });
    assert.equal(run2.savesMerged, 0);
    assert.equal(run2.reviewsMerged, 0);
    // Conflicts still detected/reported when force re-runs grouping.
    assert.equal(run2.reviewConflicts >= 1, true);

    const run3 = await backfillRecipeIdentity();
    assert.equal(run3.alreadyDone, true);
    assert.equal(run3.status, "ALREADY_DONE");

    const savesAfter = await db.recipeSave.count({ where: { userId } });
    assert.equal(savesAfter, 1);
  });
});
