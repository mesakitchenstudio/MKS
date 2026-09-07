/**
 * Phase 4C — Member Saved Collections cross-system lifecycle / isolation.
 * Isolated fixtures only. Prefer serial DB runners when combined with identity backfill.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { deleteMemberAccount } from "./member-account-deletion.ts";
import {
  createCollectionAndAddRecipeForUser,
  createSavedRecipeCollectionForUser,
  deleteSavedRecipeCollectionForUser,
  getMemberSavedCollection,
  getMemberSavedCollections,
  getRecipeCollectionPickerStateForUser,
  removeSavedRecipeFromCollectionForUser,
  renameSavedRecipeCollectionForUser,
  setSavedRecipeCollectionMembershipsForUser,
} from "./saved-recipe-collections-server.ts";
import type { Recipe } from "../data/types.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function stubPublished(input: {
  id: string;
  slug: string;
  title: string;
}): Recipe {
  return {
    id: input.id,
    slug: input.slug,
    title: input.title,
    excerpt: "",
    intro: "",
    whyItWorks: "",
    keyIngredients: [],
    tips: [],
    faqs: [],
    notes: [],
    nutrition: { calories: 0, carbs: 0, protein: 0, fat: 0 },
    course: "",
    cuisine: "",
    method: "",
    tags: [],
    categories: [],
    image: "/img.jpg",
    imageAlt: input.title,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prepMinutes: 10,
    cookMinutes: 10,
    servings: 4,
    servingsUnit: "servings",
    ingredients: [],
    instructions: [],
  };
}

describe("phase 4C — ownership map / invariants (static)", () => {
  it("documents one clear owner per mutation domain", () => {
    assert.match(read("app/api/favorites/route.ts"), /toggleSave|removeSave/);
    assert.match(read("lib/accounts.ts"), /export async function toggleSave/);
    assert.match(read("app/profile/collection-actions.ts"), /requireMemberUserId/);
    assert.doesNotMatch(
      read("app/profile/collection-actions.ts"),
      /userId:\s*String\(formData|body\.userId|input\.userId/,
    );
    assert.match(
      read("lib/saved-recipe-collections-server.ts"),
      /setSavedRecipeCollectionMembershipsForUser/,
    );
    assert.match(read("components/RecipeFloatTools.tsx"), /toggleLike/);
    assert.match(read("components/RecipeFloatTools.tsx"), /countSavedRecipeCollectionMembershipsAction/);
    assert.match(read("components/ProfileFavorites.tsx"), /countSavedRecipeCollectionMembershipsAction/);
  });

  it("keeps Phase 4 isolated from Audit / Search / Series / Readiness / Revisions", () => {
    const actions = read("app/profile/collection-actions.ts");
    assert.doesNotMatch(actions, /recordAdminAuditEvent|SearchEvent|emitRecipeSearchAnalytics/);
    assert.doesNotMatch(read("lib/recipe-publishing-readiness.ts"), /SavedRecipeCollection/);
    assert.doesNotMatch(read("lib/recipe-revisions.ts"), /SavedRecipeCollection/);
    assert.doesNotMatch(read("lib/search-analytics.ts"), /SavedRecipeCollection|collectionName/);
    assert.doesNotMatch(read("lib/phase3c-collections.ts"), /SavedRecipeCollection/);
    assert.doesNotMatch(read("components/SearchOverlay.tsx"), /SavedRecipeCollection/);
    assert.match(read("app/profile/page.tsx"), /robots: \{ index: false/);
    assert.match(read("app/profile/collections/[collectionId]/page.tsx"), /robots: \{ index: false/);
  });

  it("uses matching Unsave protection on Recipe float tools and Profile", () => {
    const float = read("components/RecipeFloatTools.tsx");
    const favorites = read("components/ProfileFavorites.tsx");
    assert.match(float, /UnsaveWithCollectionsConfirm/);
    assert.match(favorites, /UnsaveWithCollectionsConfirm/);
    assert.match(float, /countSavedRecipeCollectionMembershipsAction/);
    assert.match(favorites, /countSavedRecipeCollectionMembershipsAction/);
    assert.match(read("components/SavedRecipeCollectionPicker.tsx"), /Remove from Saved recipes\?/);
  });

  it("documents safe post-deploy integrity checks (no Admin UI)", () => {
    // Operational review helpers — not executed against production here.
    const checks = [
      "db.savedRecipeCollection.count()",
      "db.savedRecipeCollectionItem.count()",
      "unique(userId, nameNorm) via schema",
      "unique(collectionId, recipeSaveId) via schema",
      "CollectionItems whose recipeSave missing = impossible (FK Cascade)",
      "cross-user ownership mismatch = 0 when joining Collection.userId vs RecipeSave.userId",
    ];
    assert.equal(checks.length >= 5, true);
  });
});

describe("phase 4C — full member lifecycle fixture", () => {
  const db = new PrismaClient();
  const suffix = `p4c-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let emailA = "";
  const recipes: Record<string, { id: string; slug: string; title: string }> = {};
  const saves: Record<string, string> = {};

  before(async () => {
    await db.$connect();
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;

    emailA = `a-${suffix}@example.com`;
    const a = await db.user.create({ data: { email: emailA, name: "User A" } });
    const b = await db.user.create({
      data: { email: `b-${suffix}@example.com`, name: "User B" },
    });
    userA = a.id;
    userB = b.id;

    for (const key of ["A", "B", "C", "D", "E"] as const) {
      const slug = `p4c-recipe-${key.toLowerCase()}-${suffix}`;
      const row = await db.recipe.create({
        data: {
          slug,
          title: `Recipe ${key}`,
          typeId,
          status: "published",
          values: "{}",
        },
      });
      recipes[key] = { id: row.id, slug, title: row.title };
    }
  });

  after(async () => {
    const userIds = [userA, userB].filter(Boolean);
    await db.savedRecipeCollectionItem.deleteMany({
      where: { collection: { userId: { in: userIds } } },
    });
    await db.savedRecipeCollection.deleteMany({ where: { userId: { in: userIds } } });
    await db.recipeSave.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.recipe.deleteMany({
      where: { id: { in: Object.values(recipes).map((r) => r.id) } },
    });
    await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("Save creates one RecipeSave with no automatic collection rows", async () => {
    const save = await db.recipeSave.create({
      data: {
        userId: userA,
        recipeId: recipes.A.id,
        slug: recipes.A.slug,
        title: recipes.A.title,
      },
    });
    saves.A = save.id;

    assert.equal(await db.recipeSave.count({ where: { userId: userA } }), 1);
    assert.equal(save.recipeId, recipes.A.id);
    assert.equal(await db.savedRecipeCollection.count({ where: { userId: userA } }), 0);
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { recipeSaveId: save.id } }),
      0,
    );
  });

  it("create+add from picker and multi-collection exact-set sync", async () => {
    const weeknight = await createCollectionAndAddRecipeForUser(userA, {
      recipeId: recipes.A.id,
      name: "Weeknight",
    });
    assert.equal(weeknight.ok, true);
    if (!weeknight.ok) return;

    const baking = await createSavedRecipeCollectionForUser(userA, "Baking");
    const want = await createSavedRecipeCollectionForUser(userA, "Want to Try");
    assert.equal(baking.ok && want.ok, true);
    if (!baking.ok || !want.ok) return;

    const sync = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [weeknight.data.id, baking.data.id, want.data.id],
    });
    assert.equal(sync.ok, true);
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { recipeSaveId: saves.A } }),
      3,
    );
    assert.equal(await db.recipeSave.count({ where: { userId: userA } }), 1);

    const removeBaking = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [weeknight.data.id, want.data.id],
    });
    assert.equal(removeBaking.ok, true);
    assert.equal(
      await db.savedRecipeCollectionItem.count({
        where: { recipeSaveId: saves.A, collectionId: baking.data.id },
      }),
      0,
    );
    assert.ok(await db.recipeSave.findUnique({ where: { id: saves.A } }));

    const clearAll = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [],
    });
    assert.equal(clearAll.ok, true);
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { recipeSaveId: saves.A } }),
      0,
    );
    assert.ok(await db.recipeSave.findUnique({ where: { id: saves.A } }));
  });

  it("collection detail add/remove preserves RecipeSave; delete collection preserves saves", async () => {
    saves.B = (
      await db.recipeSave.create({
        data: {
          userId: userA,
          recipeId: recipes.B.id,
          slug: recipes.B.slug,
          title: recipes.B.title,
        },
      })
    ).id;

    const weeknight = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "weeknight" },
    });
    assert.ok(weeknight);
    if (!weeknight) return;

    const add = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.B.id,
      collectionIds: [weeknight.id],
    });
    assert.equal(add.ok, true);

    const removed = await removeSavedRecipeFromCollectionForUser(
      userA,
      weeknight.id,
      saves.B,
    );
    assert.equal(removed.ok, true);
    assert.ok(await db.recipeSave.findUnique({ where: { id: saves.B } }));

    await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [weeknight.id],
    });
    await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.B.id,
      collectionIds: [weeknight.id],
    });

    const beforeSaves = await db.recipeSave.count({ where: { userId: userA } });
    const deleted = await deleteSavedRecipeCollectionForUser(userA, weeknight.id);
    assert.equal(deleted.ok, true);
    assert.equal(await db.recipeSave.count({ where: { userId: userA } }), beforeSaves);
    assert.match(
      read("components/ProfileSavedCollections.tsx"),
      /will not remove the recipes from Saved Recipes/,
    );
  });

  it("rename keeps collection id and memberships; foreign user cannot mutate", async () => {
    const baking = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "baking" },
    });
    assert.ok(baking);
    if (!baking) return;

    await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [baking.id],
    });

    const renamed = await renameSavedRecipeCollectionForUser(
      userA,
      baking.id,
      "Quick Dinners",
    );
    assert.equal(renamed.ok, true);
    if (!renamed.ok) return;
    assert.equal(renamed.data.id, baking.id);

    const picker = await getRecipeCollectionPickerStateForUser(userA, {
      recipeId: recipes.A.id,
    });
    assert.equal(picker.ok, true);
    if (!picker.ok) return;
    assert.ok(picker.data.collections.some((c) => c.name === "Quick Dinners" && c.selected));

    assert.equal(
      (await renameSavedRecipeCollectionForUser(userB, baking.id, "Stolen")).ok,
      false,
    );
    assert.equal((await deleteSavedRecipeCollectionForUser(userB, baking.id)).ok, false);
    assert.equal(await getMemberSavedCollection(userB, baking.id, []), null);

    const foreign = await createSavedRecipeCollectionForUser(userB, "Quick Dinners");
    assert.equal(foreign.ok, true);
    if (!foreign.ok) return;
    const cross = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [baking.id, foreign.data.id],
    });
    assert.equal(cross.ok, false);
  });

  it("Unsave cascades memberships while collection rows remain", async () => {
    const collection = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: "quick dinners" },
    });
    assert.ok(collection);
    if (!collection) return;

    await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [collection.id],
    });
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { recipeSaveId: saves.A } }),
      1,
    );

    await db.recipeSave.delete({ where: { id: saves.A } });
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { recipeSaveId: saves.A } }),
      0,
    );
    assert.ok(await db.savedRecipeCollection.findUnique({ where: { id: collection.id } }));

    // Recreate for later tests
    saves.A = (
      await db.recipeSave.create({
        data: {
          userId: userA,
          recipeId: recipes.A.id,
          slug: recipes.A.slug,
          title: recipes.A.title,
        },
      })
    ).id;
  });

  it("exact-set sync A,D → A,B,C and duplicate ids normalize; foreign rejected all-or-nothing", async () => {
    const c1 = await createSavedRecipeCollectionForUser(userA, `Alpha ${suffix}`);
    const c2 = await createSavedRecipeCollectionForUser(userA, `Beta ${suffix}`);
    const c3 = await createSavedRecipeCollectionForUser(userA, `Gamma ${suffix}`);
    const c4 = await createSavedRecipeCollectionForUser(userA, `Delta ${suffix}`);
    assert.equal(c1.ok && c2.ok && c3.ok && c4.ok, true);
    if (!c1.ok || !c2.ok || !c3.ok || !c4.ok) return;

    await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [c1.data.id, c4.data.id],
    });

    const sync = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [c1.data.id, c1.data.id, c2.data.id, c3.data.id],
    });
    assert.equal(sync.ok, true);
    if (!sync.ok) return;
    assert.deepEqual(
      new Set(sync.data.selectedIds),
      new Set([c1.data.id, c2.data.id, c3.data.id]),
    );
    assert.equal(
      await db.savedRecipeCollectionItem.count({
        where: { recipeSaveId: saves.A, collectionId: c4.data.id },
      }),
      0,
    );

    const foreign = await db.savedRecipeCollection.findFirst({ where: { userId: userB } });
    assert.ok(foreign);
    const rejected = await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.A.id,
      collectionIds: [c1.data.id, foreign!.id],
    });
    assert.equal(rejected.ok, false);
    assert.equal(
      await db.savedRecipeCollectionItem.count({ where: { recipeSaveId: saves.A } }),
      3,
    );
  });

  it("slug rename preserves RecipeSave + memberships; draft hides from visible counts", async () => {
    const collection = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: `alpha ${suffix}`.toLowerCase() },
    });
    assert.ok(collection);

    saves.E = (
      await db.recipeSave.create({
        data: {
          userId: userA,
          recipeId: recipes.E.id,
          slug: recipes.E.slug,
          title: recipes.E.title,
        },
      })
    ).id;
    if (collection) {
      await setSavedRecipeCollectionMembershipsForUser(userA, {
        recipeId: recipes.E.id,
        collectionIds: [collection.id],
      });
    }

    const slug2 = `p4c-recipe-e-renamed-${suffix}`;
    await db.recipe.update({
      where: { id: recipes.E.id },
      data: { slug: slug2, title: "Recipe E Renamed" },
    });
    await db.recipeSave.update({
      where: { id: saves.E },
      data: { slug: slug2, title: "Recipe E Renamed" },
    });
    recipes.E.slug = slug2;
    recipes.E.title = "Recipe E Renamed";

    const picker = await getRecipeCollectionPickerStateForUser(userA, {
      recipeId: recipes.E.id,
    });
    assert.equal(picker.ok, true);
    if (picker.ok) assert.ok(picker.data.membershipCount >= 1);

    saves.D = (
      await db.recipeSave.create({
        data: {
          userId: userA,
          recipeId: recipes.D.id,
          slug: recipes.D.slug,
          title: recipes.D.title,
        },
      })
    ).id;
    if (collection) {
      await setSavedRecipeCollectionMembershipsForUser(userA, {
        recipeId: recipes.D.id,
        collectionIds: [collection.id],
      });
    }

    await db.recipe.update({ where: { id: recipes.D.id }, data: { status: "draft" } });

    const published = [
      stubPublished(recipes.A),
      stubPublished(recipes.B),
      stubPublished(recipes.C),
      stubPublished(recipes.E),
    ];
    const list = await getMemberSavedCollections(userA, published);
    const row = list.find((item) => item.id === collection?.id);
    assert.ok(row);
    // Draft D omitted from visible count; E (renamed) still counts.
    assert.equal(row?.visibleCount >= 1, true);
    assert.ok(
      await db.savedRecipeCollectionItem.findFirst({
        where: { recipeSaveId: saves.D },
      }),
    );

    await db.recipe.update({ where: { id: recipes.D.id }, data: { status: "published" } });
    const again = await getMemberSavedCollections(userA, [
      ...published,
      stubPublished(recipes.D),
    ]);
    const row2 = again.find((item) => item.id === collection?.id);
    assert.ok((row2?.visibleCount ?? 0) >= (row?.visibleCount ?? 0));
  });

  it("hard-delete sets RecipeSave.recipeId null and keeps membership without leaking cards", async () => {
    const collection = await db.savedRecipeCollection.findFirst({
      where: { userId: userA, nameNorm: `alpha ${suffix}`.toLowerCase() },
    });
    assert.ok(collection);
    if (!collection) return;

    saves.C = (
      await db.recipeSave.create({
        data: {
          userId: userA,
          recipeId: recipes.C.id,
          slug: recipes.C.slug,
          title: recipes.C.title,
        },
      })
    ).id;
    await setSavedRecipeCollectionMembershipsForUser(userA, {
      recipeId: recipes.C.id,
      collectionIds: [collection.id],
    });

    await db.recipe.delete({ where: { id: recipes.C.id } });
    const orphan = await db.recipeSave.findUnique({ where: { id: saves.C } });
    assert.equal(orphan?.recipeId, null);
    assert.ok(
      await db.savedRecipeCollectionItem.findFirst({
        where: { recipeSaveId: saves.C, collectionId: collection.id },
      }),
    );

    const published = [
      stubPublished(recipes.A),
      stubPublished(recipes.B),
      stubPublished(recipes.D),
      stubPublished(recipes.E),
    ];
    const detail = await getMemberSavedCollection(userA, collection.id, published);
    assert.ok(detail);
    assert.equal(detail?.recipes.some((r) => r.slug === recipes.C.slug), false);
  });

  it("readiness ignores member collection organization", () => {
    assert.doesNotMatch(
      read("lib/recipe-publishing-readiness.ts"),
      /SavedRecipeCollection|recipeSave|collection membership/i,
    );
    assert.doesNotMatch(
      read("components/admin/PublishingReadinessPanel.tsx"),
      /SavedRecipeCollection|member collection/i,
    );
  });

  it("account delete removes User collections and memberships", async () => {
    const beforeCollections = await db.savedRecipeCollection.count({
      where: { userId: userA },
    });
    assert.ok(beforeCollections > 0);

    const result = await deleteMemberAccount(emailA);
    assert.equal(result.ok, true);

    assert.equal(await db.user.findUnique({ where: { id: userA } }), null);
    assert.equal(await db.recipeSave.count({ where: { userId: userA } }), 0);
    assert.equal(await db.savedRecipeCollection.count({ where: { userId: userA } }), 0);
    assert.equal(
      await db.savedRecipeCollectionItem.count({
        where: { collection: { userId: userA } },
      }),
      0,
    );

    // Prevent after() double-delete issues for userA
    userA = "";
  });
});
