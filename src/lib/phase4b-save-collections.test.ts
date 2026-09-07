/**
 * Phase 4B — Save-to-collection UX + membership sync foundation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { normalizeCollectionIdList } from "./saved-recipe-collections.ts";
import {
  countRecipeSaveCollectionMembershipsForUser,
  createCollectionAndAddRecipeForUser,
  createSavedRecipeCollectionForUser,
  getRecipeCollectionPickerStateForUser,
  setSavedRecipeCollectionMembershipsForUser,
} from "./saved-recipe-collections-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("phase 4B — UX wiring (static)", () => {
  it("keeps one-click Save and adds Organize only when saved", () => {
    const float = read("components/RecipeFloatTools.tsx");
    assert.match(float, /aria-label=\{liked \? "Remove from saved recipes" : "Save recipe"\}/);
    assert.match(float, /Organize in collections/);
    assert.match(float, /showOrganize = showFavorite && liked && Boolean\(readSession\(\)\)/);
    assert.match(float, /SavedRecipeCollectionPicker/);
    assert.match(float, /UnsaveWithCollectionsConfirm/);
    assert.match(float, /countSavedRecipeCollectionMembershipsAction/);
    assert.doesNotMatch(float, /force collection|must choose a collection/i);
  });

  it("reuses one picker on profile All Saved and protects Unsave", () => {
    const favorites = read("components/ProfileFavorites.tsx");
    const confirm = read("components/SavedRecipeCollectionPicker.tsx");
    assert.match(favorites, /SavedRecipeCollectionPicker/);
    assert.match(favorites, /Organize \$\{dishLabel\} in collections/);
    assert.match(favorites, /UnsaveWithCollectionsConfirm/);
    assert.match(confirm, /Remove from Saved recipes\?/);
    assert.match(confirm, /will remove it[\s\S]*from those collections too/);
    assert.match(read("components/ProfileCollectionView.tsx"), /Remove \$\{dishLabel\} from \$\{collectionName\}/);
    assert.doesNotMatch(read("components/ProfileCollectionView.tsx"), /group\/heart/);
  });

  it("picker stays private and outside Admin Audit / Search / Series", () => {
    const picker = read("components/SavedRecipeCollectionPicker.tsx");
    assert.match(picker, /Save to collections/);
    assert.match(picker, /already in Saved recipes/);
    assert.doesNotMatch(picker, /All Saved/);
    assert.doesNotMatch(picker, /recordAdminAuditEvent|SearchEvent|SeriesItem/);
    assert.match(read("app/profile/collection-actions.ts"), /setSavedRecipeCollectionMembershipsAction/);
    assert.match(read("app/profile/collection-actions.ts"), /createCollectionAndAddRecipeAction/);
    assert.doesNotMatch(read("app/profile/collection-actions.ts"), /recordAdminAuditEvent/);
  });
});

describe("phase 4B — membership sync / picker data", () => {
  const db = new PrismaClient();
  const suffix = `p4b-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let recipeId = "";
  let saveA = "";
  const slug = `p4b-loaf-${suffix}`;

  before(async () => {
    await db.$connect();
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    const a = await db.user.create({
      data: { email: `a-${suffix}@example.com`, name: "A" },
    });
    const b = await db.user.create({
      data: { email: `b-${suffix}@example.com`, name: "B" },
    });
    userA = a.id;
    userB = b.id;
    const recipe = await db.recipe.create({
      data: {
        slug,
        title: "P4B Loaf",
        typeId,
        status: "published",
        values: "{}",
      },
    });
    recipeId = recipe.id;
    saveA = (
      await db.recipeSave.create({
        data: { userId: userA, recipeId, slug, title: "P4B Loaf" },
      })
    ).id;
    await db.recipeSave.create({
      data: { userId: userB, recipeId, slug, title: "P4B Loaf" },
    });
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
    await db.recipe.deleteMany({ where: { id: recipeId } });
    await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("normalizes collection id lists safely", () => {
    assert.deepEqual(normalizeCollectionIdList(["a", "a", "", "b"]), ["a", "b"]);
    assert.deepEqual(normalizeCollectionIdList("nope"), []);
  });

  it("loads picker state for owner and hides other member collections", async () => {
    const baking = await createSavedRecipeCollectionForUser(userA, "Baking");
    const weeknight = await createSavedRecipeCollectionForUser(userA, "Weeknight");
    assert.equal(baking.ok && weeknight.ok, true);
    if (!baking.ok || !weeknight.ok) return;

    await createSavedRecipeCollectionForUser(userB, "Secret");

    const empty = await getRecipeCollectionPickerStateForUser(userA, { recipeId });
    assert.equal(empty.ok, true);
    if (!empty.ok) return;
    assert.equal(empty.data.recipeSaveId, saveA);
    assert.equal(empty.data.collections.length, 2);
    assert.equal(empty.data.collections.every((c) => !c.selected), true);
    assert.equal(
      empty.data.collections.some((c) => c.name === "Secret"),
      false,
    );

    const notSaved = await getRecipeCollectionPickerStateForUser(userA, {
      recipeSlug: "missing-recipe",
    });
    assert.equal(notSaved.ok, false);
    if (!notSaved.ok) assert.equal(notSaved.error, "NOT_SAVED");
  });

  it("synchronizes memberships atomically and rejects cross-user collections", async () => {
    const collections = await db.savedRecipeCollection.findMany({
      where: { userId: userA },
      orderBy: { name: "asc" },
    });
    const baking = collections.find((c) => c.nameNorm === "baking");
    const weeknight = collections.find((c) => c.nameNorm === "weeknight");
    assert.ok(baking && weeknight);
    if (!baking || !weeknight) return;

    const foreign = await db.savedRecipeCollection.findFirst({
      where: { userId: userB },
    });
    assert.ok(foreign);

    const sync = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId,
      collectionIds: [baking.id, weeknight.id, baking.id],
    });
    assert.equal(sync.ok, true);
    if (!sync.ok) return;
    assert.deepEqual(new Set(sync.data.selectedIds), new Set([baking.id, weeknight.id]));

    const picker = await getRecipeCollectionPickerStateForUser(userA, { recipeId });
    assert.equal(picker.ok, true);
    if (!picker.ok) return;
    assert.equal(picker.data.membershipCount, 2);
    assert.equal(picker.data.collections.filter((c) => c.selected).length, 2);

    const count = await countRecipeSaveCollectionMembershipsForUser(userA, { recipeId });
    assert.equal(count.ok, true);
    if (count.ok) assert.equal(count.data.count, 2);

    const cross = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId,
      collectionIds: [baking.id, foreign!.id],
    });
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.error, "NOT_FOUND");

    // Membership unchanged after rejected cross-user write
    const still = await countRecipeSaveCollectionMembershipsForUser(userA, { recipeId });
    assert.equal(still.ok && still.data.count, 2);

    const steal = await setSavedRecipeCollectionMembershipsForUser(userB, {
      recipeId,
      collectionIds: [baking.id],
    });
    assert.equal(steal.ok, false);

    const clear = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId,
      collectionIds: [],
    });
    assert.equal(clear.ok, true);
    assert.ok(await db.recipeSave.findUnique({ where: { id: saveA } }));
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { recipeSaveId: saveA } }),
      0,
    );

    const idempotent = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId,
      collectionIds: [],
    });
    assert.equal(idempotent.ok, true);
  });

  it("creates a collection from picker and attaches the current save", async () => {
    const created = await createCollectionAndAddRecipeForUser(userA, {
      recipeId,
      name: "Want to Try",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.data.name, "Want to Try");
    assert.ok(created.data.selectedIds.includes(created.data.id));

    const picker = await getRecipeCollectionPickerStateForUser(userA, { recipeSlug: slug });
    assert.equal(picker.ok, true);
    if (!picker.ok) return;
    const row = picker.data.collections.find((c) => c.id === created.data.id);
    assert.equal(row?.selected, true);

    const dup = await createCollectionAndAddRecipeForUser(userA, {
      recipeId,
      name: "want to try",
    });
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.error, "DUPLICATE_NAME");

    const invalid = await createCollectionAndAddRecipeForUser(userA, {
      recipeId,
      name: "<bad>",
    });
    assert.equal(invalid.ok, false);
  });

  it("preserves memberships across recipe slug rename via Recipe.id", async () => {
    const renamed = `p4b-renamed-${suffix}`;
    await db.recipe.update({
      where: { id: recipeId },
      data: { slug: renamed, title: "Renamed P4B" },
    });
    await db.recipeSave.update({
      where: { id: saveA },
      data: { slug: renamed, title: "Renamed P4B" },
    });

    const picker = await getRecipeCollectionPickerStateForUser(userA, { recipeId });
    assert.equal(picker.ok, true);
    if (!picker.ok) return;
    assert.ok(picker.data.membershipCount >= 1);

    const bySlug = await getRecipeCollectionPickerStateForUser(userA, {
      recipeSlug: renamed,
    });
    assert.equal(bySlug.ok, true);
  });
});
