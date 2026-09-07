/**
 * Phase 4A — Member Saved Collections foundation.
 * RecipeSave remains canonical; collections organize saves privately.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER,
  SAVED_RECIPE_COLLECTION_NAME_MAX,
  normalizeSavedRecipeCollectionNameKey,
  validateSavedRecipeCollectionName,
} from "./saved-recipe-collections.ts";
import {
  addSavedRecipeToCollectionForUser,
  createSavedRecipeCollectionForUser,
  deleteSavedRecipeCollectionForUser,
  getMemberSavedCollection,
  getMemberSavedCollections,
  removeSavedRecipeFromCollectionForUser,
  renameSavedRecipeCollectionForUser,
} from "./saved-recipe-collections-server.ts";
import type { Recipe } from "../data/types.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function stubPublished(slug: string, title: string): Recipe {
  return {
    id: `pub-${slug}`,
    slug,
    title,
    dishName: "",
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    course: "",
    cuisine: "",
    method: "",
    difficulty: "",
    tags: [],
    categories: [],
    image: "/img.jpg",
    imageAlt: title,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prepMinutes: 10,
    cookMinutes: 10,
    restMinutes: 0,
    bakeMinutes: 0,
    servings: 4,
    servingsUnit: "servings",
    featured: false,
    seasonal: false,
    ingredients: [],
    instructions: [],
    notes: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
  };
}

describe("phase 4A — naming / validation", () => {
  it("trims, rejects empty/HTML, and normalizes duplicate keys", () => {
    assert.equal(validateSavedRecipeCollectionName("  Baking  ").ok, true);
    assert.equal(validateSavedRecipeCollectionName("").ok, false);
    assert.equal(validateSavedRecipeCollectionName("   ").ok, false);
    assert.equal(validateSavedRecipeCollectionName("<script>").ok, false);
    assert.equal(
      normalizeSavedRecipeCollectionNameKey(" Baking "),
      normalizeSavedRecipeCollectionNameKey("BAKING"),
    );
    assert.equal(SAVED_RECIPE_COLLECTION_NAME_MAX, 80);
    assert.equal(SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER, 50);
  });
});

describe("phase 4A — architecture separation", () => {
  it("uses SavedRecipeCollection models and membership through RecipeSave", () => {
    const schema = read("../prisma/schema.prisma");
    assert.match(schema, /model SavedRecipeCollection \{/);
    assert.match(schema, /model SavedRecipeCollectionItem \{/);
    assert.match(schema, /recipeSaveId String/);
    assert.match(schema, /recipeSave\s+RecipeSave/);
    assert.doesNotMatch(schema, /model Collection \{/);
    assert.match(schema, /onDelete: Cascade/);
  });

  it("keeps member library private and separate from Series / Search / Audit", () => {
    const profile = read("app/profile/page.tsx");
    const actions = read("app/profile/collection-actions.ts");
    const server = read("lib/saved-recipe-collections-server.ts");
    assert.match(profile, /Saved recipes/);
    assert.match(profile, /ProfileSavedCollections/);
    assert.match(profile, /All Saved/);
    assert.doesNotMatch(profile, /recordAdminAuditEvent/);
    assert.doesNotMatch(actions, /recordAdminAuditEvent|SearchEvent|emitRecipeSearchAnalytics/);
    assert.doesNotMatch(server, /SeriesItem|seriesItem/);
    assert.match(read("components/ProfileSavedCollections.tsx"), /will not remove the recipes from Saved Recipes/);
  });

  it("does not replace RecipeSave or share Series rows for member collections", () => {
    const float = read("components/RecipeFloatTools.tsx");
    assert.match(float, /Save recipe|Remove from saved recipes/);
    assert.match(float, /toggleLike/);
    assert.doesNotMatch(read("lib/phase3c-collections.ts"), /SavedRecipeCollection/);
  });
});

describe("phase 4A — persistence / security / semantics", () => {
  const db = new PrismaClient();
  const suffix = `p4a-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let recipePublishedId = "";
  let recipeDraftId = "";
  let saveA1 = "";
  let saveA2 = "";
  let saveB1 = "";
  const slugPub = `p4a-pub-${suffix}`;
  const slugDraft = `p4a-draft-${suffix}`;
  const slugRenamed = `p4a-renamed-${suffix}`;

  before(async () => {
    await db.$connect();
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;

    const a = await db.user.create({
      data: { email: `a-${suffix}@example.com`, name: "Member A" },
    });
    const b = await db.user.create({
      data: { email: `b-${suffix}@example.com`, name: "Member B" },
    });
    userA = a.id;
    userB = b.id;

    const published = await db.recipe.create({
      data: {
        slug: slugPub,
        title: "Published Loaf",
        typeId,
        status: "published",
        values: "{}",
      },
    });
    recipePublishedId = published.id;

    const draft = await db.recipe.create({
      data: {
        slug: slugDraft,
        title: "Draft Cake",
        typeId,
        status: "draft",
        values: "{}",
      },
    });
    recipeDraftId = draft.id;

    const s1 = await db.recipeSave.create({
      data: {
        userId: userA,
        recipeId: recipePublishedId,
        slug: slugPub,
        title: "Published Loaf",
      },
    });
    const s2 = await db.recipeSave.create({
      data: {
        userId: userA,
        recipeId: recipeDraftId,
        slug: slugDraft,
        title: "Draft Cake",
      },
    });
    const sb = await db.recipeSave.create({
      data: {
        userId: userB,
        recipeId: recipePublishedId,
        slug: slugPub,
        title: "Published Loaf",
      },
    });
    saveA1 = s1.id;
    saveA2 = s2.id;
    saveB1 = sb.id;
  });

  after(async () => {
    await db.savedRecipeCollectionItem.deleteMany({
      where: { collection: { userId: { in: [userA, userB] } } },
    });
    await db.savedRecipeCollection.deleteMany({
      where: { userId: { in: [userA, userB] } },
    });
    await db.recipeSave.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.recipe.deleteMany({ where: { id: { in: [recipePublishedId, recipeDraftId] } } });
    await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("creates collections with ownership, duplicate-name and multi-user same name", async () => {
    const created = await createSavedRecipeCollectionForUser(userA, "Baking");
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const dup = await createSavedRecipeCollectionForUser(userA, " baking ");
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.error, "DUPLICATE_NAME");

    const other = await createSavedRecipeCollectionForUser(userB, "Baking");
    assert.equal(other.ok, true);

    const empty = await createSavedRecipeCollectionForUser(userA, "  ");
    assert.equal(empty.ok, false);
  });

  it("allows one save in multiple collections and rejects cross-user membership", async () => {
    const baking = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "baking" },
    });
    assert.ok(baking);
    const weeknight = await createSavedRecipeCollectionForUser(userA, "Weeknight");
    assert.equal(weeknight.ok, true);
    if (!weeknight.ok || !baking) return;

    const add1 = await addSavedRecipeToCollectionForUser(userA, baking.id, saveA1);
    const add2 = await addSavedRecipeToCollectionForUser(userA, weeknight.data.id, saveA1);
    assert.equal(add1.ok, true);
    assert.equal(add2.ok, true);

    const idempotent = await addSavedRecipeToCollectionForUser(userA, baking.id, saveA1);
    assert.equal(idempotent.ok, true);

    const cross = await addSavedRecipeToCollectionForUser(userA, baking.id, saveB1);
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.error, "NOT_SAVED");

    const steal = await addSavedRecipeToCollectionForUser(userB, baking.id, saveB1);
    assert.equal(steal.ok, false);
    if (!steal.ok) assert.equal(steal.error, "NOT_FOUND");
  });

  it("counts only published recipes and omits drafts from visible library cards", async () => {
    const baking = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "baking" },
    });
    assert.ok(baking);
    if (!baking) return;

    await addSavedRecipeToCollectionForUser(userA, baking.id, saveA2);

    const published = [stubPublished(slugPub, "Published Loaf")];
    const list = await getMemberSavedCollections(userA, published);
    const row = list.find((item) => item.id === baking.id);
    assert.ok(row);
    assert.equal(row?.visibleCount, 1);

    const detail = await getMemberSavedCollection(userA, baking.id, published);
    assert.ok(detail);
    assert.equal(detail?.recipes.length, 1);
    assert.equal(detail?.recipes[0]?.slug, slugPub);
    assert.equal(detail?.memberships.length, 2);
  });

  it("delete collection preserves RecipeSave; remove preserves save and other memberships", async () => {
    const weeknight = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "weeknight" },
    });
    assert.ok(weeknight);
    if (!weeknight) return;

    const beforeSaves = await db.recipeSave.count({ where: { userId: userA } });
    const deleted = await deleteSavedRecipeCollectionForUser(userA, weeknight.id);
    assert.equal(deleted.ok, true);
    assert.equal(await db.recipeSave.count({ where: { userId: userA } }), beforeSaves);
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { collectionId: weeknight.id } }),
      0,
    );

    const baking = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "baking" },
    });
    assert.ok(baking);
    if (!baking) return;

    const removed = await removeSavedRecipeFromCollectionForUser(userA, baking.id, saveA1);
    assert.equal(removed.ok, true);
    assert.ok(await db.recipeSave.findUnique({ where: { id: saveA1 } }));
    assert.equal(
      await db.savedRecipeCollectionItem.count({
        where: { collectionId: baking.id, recipeSaveId: saveA1 },
      }),
      0,
    );
  });

  it("unsave cascades membership cleanup; rename preserves membership via RecipeSave id", async () => {
    const baking = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "baking" },
    });
    assert.ok(baking);
    if (!baking) return;

    await addSavedRecipeToCollectionForUser(userA, baking.id, saveA1);
    assert.equal(
      await db.savedRecipeCollectionItem.count({
        where: { collectionId: baking.id, recipeSaveId: saveA1 },
      }),
      1,
    );

    await db.recipeSave.delete({ where: { id: saveA1 } });
    assert.equal(
      await db.savedRecipeCollectionItem.count({
        where: { recipeSaveId: saveA1 },
      }),
      0,
    );

    // Recreate save for rename survival test
    const reSave = await db.recipeSave.create({
      data: {
        userId: userA,
        recipeId: recipePublishedId,
        slug: slugPub,
        title: "Published Loaf",
      },
    });
    saveA1 = reSave.id;
    await addSavedRecipeToCollectionForUser(userA, baking.id, saveA1);

    await db.recipe.update({
      where: { id: recipePublishedId },
      data: { slug: slugRenamed, title: "Renamed Loaf" },
    });
    await db.recipeSave.update({
      where: { id: saveA1 },
      data: { slug: slugRenamed, title: "Renamed Loaf" },
    });

    const published = [stubPublished(slugRenamed, "Renamed Loaf")];
    const detail = await getMemberSavedCollection(userA, baking.id, published);
    assert.ok(detail);
    assert.equal(detail?.memberships.some((row) => row.recipeSaveId === saveA1), true);
    assert.equal(detail?.recipes[0]?.slug, slugRenamed);
  });

  it("blocks cross-user rename/delete/read and ignores foreign collection ids", async () => {
    const baking = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "baking" },
    });
    assert.ok(baking);
    if (!baking) return;

    assert.equal((await renameSavedRecipeCollectionForUser(userB, baking.id, "Stolen")).ok, false);
    assert.equal((await deleteSavedRecipeCollectionForUser(userB, baking.id)).ok, false);
    assert.equal(await getMemberSavedCollection(userB, baking.id, []), null);

    const renamed = await renameSavedRecipeCollectionForUser(userA, baking.id, "Oven Projects");
    assert.equal(renamed.ok, true);
  });

  it("enforces per-member collection limit", async () => {
    const existing = await db.savedRecipeCollection.count({ where: { userId: userA } });
    const toCreate = Math.max(0, SAVED_RECIPE_COLLECTIONS_MAX_PER_MEMBER - existing);
    for (let i = 0; i < toCreate; i += 1) {
      const result = await createSavedRecipeCollectionForUser(userA, `Limit ${i} ${suffix}`);
      assert.equal(result.ok, true);
    }
    const over = await createSavedRecipeCollectionForUser(userA, `Over ${suffix}`);
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.error, "COLLECTION_LIMIT");
  });
});

describe("phase 4A — readiness / revisions / save button regressions (static)", () => {
  it("does not wire collections into readiness, revisions, or search analytics", () => {
    assert.doesNotMatch(
      read("lib/recipe-publishing-readiness.ts"),
      /SavedRecipeCollection|savedRecipeCollection/,
    );
    assert.doesNotMatch(read("lib/recipe-revisions.ts"), /SavedRecipeCollection|relatedRecipeIds/);
    assert.doesNotMatch(
      read("lib/search-analytics.ts"),
      /SavedRecipeCollection|collectionName/,
    );
    assert.match(read("app/api/favorites/route.ts"), /toggleSave|removeSave/);
  });
});
