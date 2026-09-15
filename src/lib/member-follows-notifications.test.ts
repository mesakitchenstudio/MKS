/**
 * Phase 8B — Follow Topics/Series + Notifications persistence foundation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { isMemberFollowsEnabled } from "./flags.ts";
import {
  isFollowableCategoryGroup,
  isFollowTarget,
} from "./member-follows.ts";
import {
  followCategoryForUser,
  followSeriesForUser,
  isCategoryFollowedByUser,
  isSeriesFollowedByUser,
  listMemberFollowsForUser,
  unfollowCategoryForUser,
  unfollowSeriesForUser,
} from "./member-follows-server.ts";
import {
  MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
  buildRecipeFollowedPublishDedupeKey,
  normalizeMemberNotificationContext,
} from "./member-notifications.ts";
import {
  countUnreadMemberNotificationsForUser,
  createRecipeFollowedPublishNotificationForUser,
  listMemberNotificationsForUser,
  markAllMemberNotificationsReadForUser,
  markMemberNotificationReadForUser,
} from "./member-notifications-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

describe("Phase 8B — feature gate", () => {
  it("MEMBER_FOLLOWS_ENABLED exact true only", () => {
    const prev = process.env.MEMBER_FOLLOWS_ENABLED;
    try {
      delete process.env.MEMBER_FOLLOWS_ENABLED;
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "false";
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "True";
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "1";
      assert.equal(isMemberFollowsEnabled(), false);
      process.env.MEMBER_FOLLOWS_ENABLED = "true";
      assert.equal(isMemberFollowsEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.MEMBER_FOLLOWS_ENABLED;
      else process.env.MEMBER_FOLLOWS_ENABLED = prev;
    }
  });

  it("no NEXT_PUBLIC mirror in flags", () => {
    const flags = readRepo("src/lib/flags.ts");
    assert.match(flags, /MEMBER_FOLLOWS_ENABLED === "true"/);
    assert.doesNotMatch(flags, /NEXT_PUBLIC_MEMBER_FOLLOWS/);
  });
});

describe("Phase 8B — category allow-list + target types", () => {
  it("allow-list course/desserts/holiday only", () => {
    assert.equal(isFollowableCategoryGroup("course"), true);
    assert.equal(isFollowableCategoryGroup("desserts"), true);
    assert.equal(isFollowableCategoryGroup("holiday"), true);
    assert.equal(isFollowableCategoryGroup("method"), false);
    assert.equal(isFollowableCategoryGroup("unknown"), false);
    assert.equal(isFollowableCategoryGroup(""), false);
    assert.equal(isFollowableCategoryGroup(null), false);
    assert.equal(isFollowableCategoryGroup(undefined), false);
    assert.equal(isFollowableCategoryGroup(" COURSE "), true);
  });

  it("FollowTarget is closed union", () => {
    assert.equal(isFollowTarget({ type: "series", id: "abc" }), true);
    assert.equal(isFollowTarget({ type: "category", id: "abc" }), true);
    assert.equal(isFollowTarget({ type: "ingredient", id: "abc" }), false);
    assert.equal(isFollowTarget({ type: "series", id: "" }), false);
    assert.equal(isFollowTarget({ type: "series" }), false);
  });

  it("single allow-list source of truth", () => {
    const domain = readRepo("src/lib/member-follows.ts");
    assert.match(domain, /FOLLOWABLE_CATEGORY_GROUPS/);
    assert.match(domain, /isFollowableCategoryGroup/);
    const server = readRepo("src/lib/member-follows-server.ts");
    assert.match(server, /isFollowableCategoryGroup/);
    assert.doesNotMatch(server, /\["course",\s*"desserts",\s*"holiday"\]/);
  });
});

describe("Phase 8B — notification domain helpers", () => {
  it("dedupe key shape", () => {
    assert.equal(
      buildRecipeFollowedPublishDedupeKey("rec123"),
      "recipe.followed_publish:rec123",
    );
  });

  it("context XOR normalization", () => {
    assert.deepEqual(normalizeMemberNotificationContext({ kind: "none" }), {
      ok: true,
      seriesId: null,
      categoryId: null,
    });
    assert.deepEqual(
      normalizeMemberNotificationContext({ kind: "series", seriesId: " s1 " }),
      { ok: true, seriesId: "s1", categoryId: null },
    );
    assert.deepEqual(
      normalizeMemberNotificationContext({ kind: "category", categoryId: "c1" }),
      { ok: true, seriesId: null, categoryId: "c1" },
    );
    assert.equal(
      normalizeMemberNotificationContext({ kind: "series", seriesId: "  " }).ok,
      false,
    );
  });
});

describe("Phase 8B — migration SQL additive shape", () => {
  it("creates only new tables/indexes/FKs", () => {
    const sql = readRepo(
      "prisma/migrations/20260915190000_member_follows_notifications/migration.sql",
    );
    assert.match(sql, /CREATE TABLE "UserSeriesFollow"/);
    assert.match(sql, /CREATE TABLE "UserCategoryFollow"/);
    assert.match(sql, /CREATE TABLE "MemberNotification"/);
    assert.match(sql, /UserSeriesFollow_userId_seriesId_key/);
    assert.match(sql, /UserCategoryFollow_userId_categoryId_key/);
    assert.match(sql, /MemberNotification_userId_dedupeKey_key/);
    assert.match(sql, /ON DELETE CASCADE/);
    assert.match(sql, /ON DELETE SET NULL/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/);
    assert.doesNotMatch(sql, /\bDROP COLUMN\b/);
    assert.doesNotMatch(sql, /\bALTER TABLE "User"\b/);
    assert.doesNotMatch(sql, /\bALTER TABLE "Recipe"\b/);
    assert.doesNotMatch(sql, /\bALTER TABLE "Series"\b/);
    assert.doesNotMatch(sql, /\bALTER TABLE "Category"\b/);
  });

  it("schemas declare models and prepare-production remains datasource-only", () => {
    const schema = readRepo("prisma/schema.prisma");
    assert.match(schema, /model UserSeriesFollow/);
    assert.match(schema, /model UserCategoryFollow/);
    assert.match(schema, /model MemberNotification/);
    assert.match(schema, /seriesFollows UserSeriesFollow/);
    assert.match(schema, /memberNotifications MemberNotification/);
    const prep = readRepo("prisma/prepare-production.mjs");
    assert.match(prep, /provider  = "postgresql"/);
  });

  it("publish workflow not wired yet", () => {
    const actions = readRepo("src/app/admin/actions.ts");
    assert.doesNotMatch(actions, /createRecipeFollowedPublishNotification|member-notifications-server|followSeriesForUser/);
    const cron = readRepo("src/lib/recipe-schedule-server.ts");
    assert.doesNotMatch(cron, /createRecipeFollowedPublishNotification|member-notifications-server/);
  });
});

describe("Phase 8B — ownership / CRUD / cascade / idempotency", () => {
  const db = new PrismaClient();
  const suffix = `f8b-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let seriesPubId = "";
  let seriesDraftId = "";
  let catCourseId = "";
  let catMethodId = "";
  let recipePubId = "";
  let recipeDraftId = "";
  let recipeOrphanId = "";

  before(async () => {
    const type = await db.recipeType.create({
      data: {
        slug: `type-${suffix}`,
        name: `Type ${suffix}`,
      },
    });
    typeId = type.id;

    const [a, b] = await Promise.all([
      db.user.create({
        data: { email: `a-${suffix}@example.com`, name: "Follow A" },
      }),
      db.user.create({
        data: { email: `b-${suffix}@example.com`, name: "Follow B" },
      }),
    ]);
    userA = a.id;
    userB = b.id;

    const [seriesPub, seriesDraft] = await Promise.all([
      db.series.create({
        data: {
          slug: `series-pub-${suffix}`,
          title: `Published Series ${suffix}`,
          isPublished: true,
        },
      }),
      db.series.create({
        data: {
          slug: `series-draft-${suffix}`,
          title: `Draft Series ${suffix}`,
          isPublished: false,
        },
      }),
    ]);
    seriesPubId = seriesPub.id;
    seriesDraftId = seriesDraft.id;

    const [catCourse, catMethod] = await Promise.all([
      db.category.create({
        data: {
          slug: `course-${suffix}`,
          name: `Course ${suffix}`,
          group: "course",
        },
      }),
      db.category.create({
        data: {
          slug: `method-${suffix}`,
          name: `Method ${suffix}`,
          group: "method",
        },
      }),
    ]);
    catCourseId = catCourse.id;
    catMethodId = catMethod.id;

    const [pub, draft, orphan] = await Promise.all([
      db.recipe.create({
        data: {
          slug: `pub-${suffix}`,
          title: `Published Recipe ${suffix}`,
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: JSON.stringify({ dishName: `Dish ${suffix}` }),
        },
      }),
      db.recipe.create({
        data: {
          slug: `draft-${suffix}`,
          title: `Draft Recipe ${suffix}`,
          typeId,
          status: "draft",
          values: "{}",
        },
      }),
      db.recipe.create({
        data: {
          slug: `orphan-${suffix}`,
          title: `Orphan Recipe ${suffix}`,
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: "{}",
        },
      }),
    ]);
    recipePubId = pub.id;
    recipeDraftId = draft.id;
    recipeOrphanId = orphan.id;
  });

  after(async () => {
    // Cleanup in dependency-safe order
    await db.memberNotification.deleteMany({
      where: { userId: { in: [userA, userB].filter(Boolean) } },
    });
    await db.userSeriesFollow.deleteMany({
      where: { userId: { in: [userA, userB].filter(Boolean) } },
    });
    await db.userCategoryFollow.deleteMany({
      where: { userId: { in: [userA, userB].filter(Boolean) } },
    });
    if (userA) await db.user.deleteMany({ where: { id: userA } });
    if (userB) await db.user.deleteMany({ where: { id: userB } });
    await db.recipe.deleteMany({
      where: { id: { in: [recipePubId, recipeDraftId, recipeOrphanId].filter(Boolean) } },
    });
    await db.series.deleteMany({
      where: { id: { in: [seriesPubId, seriesDraftId].filter(Boolean) } },
    });
    await db.category.deleteMany({
      where: { id: { in: [catCourseId, catMethodId].filter(Boolean) } },
    });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("series follow / duplicate / unfollow / isolation", async () => {
    assert.equal(await isSeriesFollowedByUser(userA, seriesPubId), false);
    const first = await followSeriesForUser(userA, seriesPubId);
    assert.equal(first.ok, true);
    assert.equal(await isSeriesFollowedByUser(userA, seriesPubId), true);

    const dup = await followSeriesForUser(userA, seriesPubId);
    assert.equal(dup.ok, true);
    const count = await db.userSeriesFollow.count({
      where: { userId: userA, seriesId: seriesPubId },
    });
    assert.equal(count, 1);

    assert.equal(await isSeriesFollowedByUser(userB, seriesPubId), false);
    await followSeriesForUser(userB, seriesPubId);
    assert.equal(await isSeriesFollowedByUser(userB, seriesPubId), true);

    const un = await unfollowSeriesForUser(userA, seriesPubId);
    assert.equal(un.ok, true);
    assert.equal(await isSeriesFollowedByUser(userA, seriesPubId), false);
    const un2 = await unfollowSeriesForUser(userA, seriesPubId);
    assert.equal(un2.ok, true);
    assert.equal(await isSeriesFollowedByUser(userB, seriesPubId), true);
  });

  it("rejects unpublished Series for new follows", async () => {
    const result = await followSeriesForUser(userA, seriesDraftId);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "TARGET_NOT_FOLLOWABLE");
    assert.equal(await isSeriesFollowedByUser(userA, seriesDraftId), false);
  });

  it("category follow allow-list + method reject", async () => {
    const ok = await followCategoryForUser(userA, catCourseId);
    assert.equal(ok.ok, true);
    assert.equal(await isCategoryFollowedByUser(userA, catCourseId), true);

    const dup = await followCategoryForUser(userA, catCourseId);
    assert.equal(dup.ok, true);
    assert.equal(
      await db.userCategoryFollow.count({
        where: { userId: userA, categoryId: catCourseId },
      }),
      1,
    );

    const method = await followCategoryForUser(userA, catMethodId);
    assert.equal(method.ok, false);
    if (!method.ok) assert.equal(method.error, "TARGET_NOT_FOLLOWABLE");
    assert.equal(await isCategoryFollowedByUser(userA, catMethodId), false);

    const missing = await followCategoryForUser(userA, "missing-id");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "TARGET_NOT_FOUND");

    await unfollowCategoryForUser(userA, catCourseId);
    assert.equal(await isCategoryFollowedByUser(userA, catCourseId), false);
  });

  it("following list is presentation-safe and omits unpublished Series", async () => {
    await followSeriesForUser(userA, seriesPubId);
    // Direct row for unpublished — should be omitted from visible list.
    await db.userSeriesFollow.create({
      data: { userId: userA, seriesId: seriesDraftId },
    });
    await followCategoryForUser(userA, catCourseId);

    const list = await listMemberFollowsForUser(userA);
    assert.equal(list.series.length, 1);
    assert.equal(list.series[0]?.id, seriesPubId);
    assert.equal(list.series[0]?.slug, `series-pub-${suffix}`);
    assert.equal(list.categories.length, 1);
    assert.equal(list.categories[0]?.id, catCourseId);
    assert.equal(list.categories[0]?.group, "course");
    assert.ok(!("followerCount" in (list.series[0] as object)));

    await db.userSeriesFollow.deleteMany({
      where: { userId: userA, seriesId: seriesDraftId },
    });
  });

  it("notification idempotency + ownership + read/unread", async () => {
    const first = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: recipePubId,
      context: { kind: "series", seriesId: seriesPubId },
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.data.created, true);

    const again = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: recipePubId,
      context: { kind: "category", categoryId: catCourseId },
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.data.created, false);
    assert.equal(again.data.id, first.data.id);
    assert.equal(
      await db.memberNotification.count({
        where: {
          userId: userA,
          type: MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
          recipeId: recipePubId,
        },
      }),
      1,
    );

    const otherUser = await createRecipeFollowedPublishNotificationForUser({
      userId: userB,
      recipeId: recipePubId,
      context: { kind: "none" },
    });
    assert.equal(otherUser.ok, true);

    const otherRecipe = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: recipeDraftId,
      context: { kind: "none" },
    });
    assert.equal(otherRecipe.ok, true);

    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);
    assert.equal(await countUnreadMemberNotificationsForUser(userB), 1);

    const listed = await listMemberNotificationsForUser(userA);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.recipeId, recipePubId);
    assert.equal(listed[0]?.unread, true);
    assert.equal(listed[0]?.recipeTitle, `Dish ${suffix}`);
    assert.equal(listed[0]?.context.kind, "series");

    // Cross-user mark must fail.
    const cross = await markMemberNotificationReadForUser(userB, first.data.id);
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.error, "NOT_FOUND");
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);

    const mark = await markMemberNotificationReadForUser(userA, first.data.id);
    assert.equal(mark.ok, true);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);
    const markAgain = await markMemberNotificationReadForUser(userA, first.data.id);
    assert.equal(markAgain.ok, true);

    // Reset unread for mark-all test via second published recipe notification path:
    await db.memberNotification.update({
      where: { id: first.data.id },
      data: { readAt: null },
    });
    await db.recipe.update({
      where: { id: recipeDraftId },
      data: { status: "published", publishedAt: new Date() },
    });
    // Make draft-as-published visible for mark-all; then count unread.
    assert.ok((await countUnreadMemberNotificationsForUser(userA)) >= 1);
    const markAll = await markAllMemberNotificationsReadForUser(userA);
    assert.equal(markAll.ok, true);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);
    assert.equal(await countUnreadMemberNotificationsForUser(userB), 1);

    // List/open itself does not auto-read — already covered (mark required).
  });

  it("rejects invalid simultaneous context via normalize only (union)", () => {
    // Type system prevents both; empty series id rejected.
    const bad = normalizeMemberNotificationContext({ kind: "series", seriesId: "" });
    assert.equal(bad.ok, false);
  });

  it("recipe delete SetNulls notification recipeId; list hides orphan", async () => {
    const created = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: recipeOrphanId,
      context: { kind: "none" },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await db.recipe.delete({ where: { id: recipeOrphanId } });
    recipeOrphanId = "";

    const row = await db.memberNotification.findUnique({
      where: { id: created.data.id },
    });
    assert.ok(row);
    assert.equal(row?.recipeId, null);

    const listed = await listMemberNotificationsForUser(userA);
    assert.ok(!listed.some((item) => item.id === created.data.id));
  });

  it("series delete cascades follows; category delete cascades follows", async () => {
    const tempSeries = await db.series.create({
      data: {
        slug: `temp-series-${suffix}`,
        title: "Temp",
        isPublished: true,
      },
    });
    await followSeriesForUser(userA, tempSeries.id);
    assert.equal(await isSeriesFollowedByUser(userA, tempSeries.id), true);
    await db.series.delete({ where: { id: tempSeries.id } });
    assert.equal(await isSeriesFollowedByUser(userA, tempSeries.id), false);

    const tempCat = await db.category.create({
      data: {
        slug: `temp-cat-${suffix}`,
        name: "Temp Cat",
        group: "desserts",
      },
    });
    await followCategoryForUser(userA, tempCat.id);
    assert.equal(await isCategoryFollowedByUser(userA, tempCat.id), true);
    await db.category.delete({ where: { id: tempCat.id } });
    assert.equal(await isCategoryFollowedByUser(userA, tempCat.id), false);
  });

  it("user delete cascades follows and notifications", async () => {
    const doomed = await db.user.create({
      data: { email: `doom-${suffix}@example.com`, name: "Doomed" },
    });
    await followSeriesForUser(doomed.id, seriesPubId);
    await followCategoryForUser(doomed.id, catCourseId);
    const note = await createRecipeFollowedPublishNotificationForUser({
      userId: doomed.id,
      recipeId: recipePubId,
      context: { kind: "none" },
    });
    assert.equal(note.ok, true);

    await db.user.delete({ where: { id: doomed.id } });

    assert.equal(
      await db.userSeriesFollow.count({ where: { userId: doomed.id } }),
      0,
    );
    assert.equal(
      await db.userCategoryFollow.count({ where: { userId: doomed.id } }),
      0,
    );
    assert.equal(
      await db.memberNotification.count({ where: { userId: doomed.id } }),
      0,
    );
  });
});
