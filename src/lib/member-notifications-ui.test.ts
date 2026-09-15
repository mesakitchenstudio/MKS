/**
 * Phase 8E — Notification center + unread UX contracts and ownership tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  formatMemberNotificationContextLine,
  formatMemberNotificationsMenuLabel,
} from "./member-notifications.ts";
import {
  countUnreadMemberNotificationsForUser,
  createRecipeFollowedPublishNotificationForUser,
  listMemberNotificationsForUser,
  markAllMemberNotificationsReadForUser,
  markMemberNotificationReadForUser,
} from "./member-notifications-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

describe("Phase 8E — presentation helpers", () => {
  it("context copy for series, category, and missing context", () => {
    assert.equal(
      formatMemberNotificationContextLine({
        kind: "series",
        id: "s1",
        name: "Breads",
        slug: "breads",
      }),
      "New recipe in Breads",
    );
    assert.equal(
      formatMemberNotificationContextLine({
        kind: "category",
        id: "c1",
        name: "Desserts",
        slug: "desserts",
      }),
      "New recipe in Desserts",
    );
    assert.equal(
      formatMemberNotificationContextLine({ kind: "none" }),
      "New recipe from something you follow",
    );
  });

  it("menu label omits zero and null", () => {
    assert.equal(formatMemberNotificationsMenuLabel(null), "Notifications");
    assert.equal(formatMemberNotificationsMenuLabel(undefined), "Notifications");
    assert.equal(formatMemberNotificationsMenuLabel(0), "Notifications");
    assert.equal(formatMemberNotificationsMenuLabel(1), "Notifications (1)");
    assert.equal(formatMemberNotificationsMenuLabel(3), "Notifications (3)");
  });
});

describe("Phase 8E — route / actions / AccountMenu contracts", () => {
  it("notifications route is private, gated, force-dynamic, noindex", () => {
    const page = readRepo("src/app/profile/notifications/page.tsx");
    assert.match(page, /dynamic\s*=\s*"force-dynamic"/);
    assert.match(page, /isMemberFollowsEnabled/);
    assert.match(page, /notFound\(\)/);
    assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    assert.match(page, /redirect\("\/profile"\)/);
    assert.match(page, /listMemberNotificationsForUser/);
    assert.match(page, /findActiveMemberByEmail/);
    assert.match(page, /Notifications are temporarily unavailable/);
    assert.doesNotMatch(page, /userId:\s*searchParams|params\.userId/);
    assert.doesNotMatch(page, /markMemberNotificationRead|readAt:\s*new Date/);
  });

  it("actions enforce gate, ownership, and never accept client userId", () => {
    const actions = readRepo("src/app/profile/notification-actions.ts");
    assert.match(actions, /"use server"/);
    assert.match(actions, /isMemberFollowsEnabled\(\)/);
    assert.match(actions, /FEATURE_DISABLED/);
    assert.match(actions, /findActiveMemberByEmail/);
    assert.match(actions, /markMemberNotificationReadAction/);
    assert.match(actions, /markAllMemberNotificationsReadAction/);
    assert.match(actions, /getUnreadMemberNotificationCountAction/);
    assert.match(actions, /revalidatePath\("\/profile\/notifications"\)/);
    assert.doesNotMatch(actions, /userId:\s*input|body\.userId|rawUserId/);
    assert.doesNotMatch(actions, /Resend|newsletter|EmailUpdates/);
  });

  it("AccountMenu unread is client-fetched with failure isolation; order correct", () => {
    const menu = readRepo("src/components/AccountMenu.tsx");
    assert.match(menu, /getUnreadMemberNotificationCountAction/);
    assert.match(menu, /formatMemberNotificationsMenuLabel/);
    assert.match(menu, /mesa-notifications-changed/);
    assert.match(menu, /setUnreadCount\(null\)/);
    assert.match(menu, /\/profile\/notifications/);
    assert.match(menu, /Notifications, \$\{unreadCount\} unread/);
    assert.doesNotMatch(menu, /process\.env\.MEMBER_FOLLOWS|NEXT_PUBLIC_MEMBER_FOLLOWS/);

    const profileIdx = menu.indexOf('href="/profile"');
    const notificationsIdx = menu.indexOf('href="/profile/notifications"');
    const followingIdx = menu.indexOf('href="/profile/following"');
    const mealIdx = menu.indexOf('href="/profile/meal-planner"');
    assert.ok(profileIdx > 0 && notificationsIdx > profileIdx);
    assert.ok(followingIdx > notificationsIdx);
    assert.ok(mealIdx > followingIdx);

    // Unread count is not server-baked into root layout.
    const layout = readRepo("src/app/layout.tsx");
    assert.doesNotMatch(layout, /countUnreadMemberNotifications|unreadCount/);
  });

  it("list UI: real Link, New badge, mark all, empty state, no auto-read", () => {
    const view = readRepo("src/components/ProfileNotificationsView.tsx");
    assert.match(view, /Mark all as read/);
    assert.match(view, /No notifications yet/);
    assert.match(view, /\/profile\/following/);
    assert.match(view, /\/series/);
    assert.match(view, /formatMemberNotificationContextLine/);
    assert.match(view, /formatLongDate/);
    assert.match(view, /<time/);
    assert.match(view, /dateTime=/);
    assert.match(view, /New/);
    assert.match(view, /sr-only.*unread|unread.*sr-only/s);
    assert.match(view, /href=\{href\}/);
    assert.match(view, /markMemberNotificationReadAction/);
    assert.match(view, /Best-effort mark-read/);
    assert.doesNotMatch(view, /preventDefault/);
    assert.doesNotMatch(view, /setInterval|WebSocket|EventSource|pushManager/);
  });

  it("does not add notifications to Member Home or email/analytics", () => {
    const profile = readRepo("src/app/profile/page.tsx");
    const sections = readRepo("src/components/member-home/MemberHomeSections.tsx");
    assert.doesNotMatch(profile, /ProfileNotifications|\/profile\/notifications/);
    assert.doesNotMatch(sections, /Notification|memberNotification/i);
    const actions = readRepo("src/app/profile/notification-actions.ts");
    assert.doesNotMatch(actions, /Resend|newsletter|analytics|trackEvent/i);
  });

  it("fan-out files unchanged by 8E wiring expectations", () => {
    const fanout = readRepo("src/lib/member-follow-publish-fanout.ts");
    const first = readRepo("src/lib/recipe-first-publication.ts");
    assert.match(fanout, /fanOutRecipeFollowedPublishNotifications/);
    assert.match(first, /isFirstEverRecipePublicationTransition/);
    const view = readRepo("src/components/ProfileNotificationsView.tsx");
    assert.doesNotMatch(view, /fanOut|recipeHadPriorPublication/);
  });

  it("notifications path excluded from sitemap helpers", () => {
    const sitemap = readRepo("src/lib/sitemap-entries.ts");
    assert.doesNotMatch(sitemap, /profile\/notifications/i);
  });
});

describe("Phase 8E — ownership / visibility / read semantics", () => {
  const db = new PrismaClient();
  const suffix = `f8e-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let seriesId = "";
  let categoryId = "";
  let recipePubId = "";
  let recipeDraftId = "";
  let notificationA1 = "";
  let notificationA2 = "";

  before(async () => {
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;

    const [a, b] = await Promise.all([
      db.user.create({ data: { email: `a-${suffix}@example.com`, name: "A" } }),
      db.user.create({ data: { email: `b-${suffix}@example.com`, name: "B" } }),
    ]);
    userA = a.id;
    userB = b.id;

    const [series, category] = await Promise.all([
      db.series.create({
        data: { slug: `series-${suffix}`, title: `Series ${suffix}`, isPublished: true },
      }),
      db.category.create({
        data: { slug: `cat-${suffix}`, name: `Category ${suffix}`, group: "desserts" },
      }),
    ]);
    seriesId = series.id;
    categoryId = category.id;

    const [pub, draft] = await Promise.all([
      db.recipe.create({
        data: {
          slug: `pub-${suffix}`,
          title: `Published ${suffix}`,
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: JSON.stringify({ dishName: `Dish ${suffix}` }),
        },
      }),
      db.recipe.create({
        data: {
          slug: `draft-${suffix}`,
          title: `Draft ${suffix}`,
          typeId,
          status: "draft",
          values: "{}",
        },
      }),
    ]);
    recipePubId = pub.id;
    recipeDraftId = draft.id;

    // Second published recipe for multi-unread tests
    const pub2 = await db.recipe.create({
      data: {
        slug: `pub2-${suffix}`,
        title: `Published 2 ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date(),
        values: JSON.stringify({ dishName: `Dish 2 ${suffix}` }),
      },
    });

    const n1 = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: recipePubId,
      context: { kind: "series", seriesId },
    });
    const n2 = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: pub2.id,
      context: { kind: "category", categoryId },
    });
    assert.equal(n1.ok, true);
    assert.equal(n2.ok, true);
    if (n1.ok) notificationA1 = n1.data.id;
    if (n2.ok) notificationA2 = n2.data.id;

    // Store pub2 id on draft cleanup via values? Keep on series of deletes via recipe ids from notifications.
    await db.memberNotification.update({
      where: { id: notificationA2 },
      data: {},
    });
  });

  after(async () => {
    await db.memberNotification.deleteMany({
      where: { userId: { in: [userA, userB].filter(Boolean) } },
    });
    await db.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
    await db.recipe.deleteMany({
      where: {
        OR: [
          { id: { in: [recipePubId, recipeDraftId].filter(Boolean) } },
          { slug: { contains: suffix } },
        ],
      },
    });
    await db.series.deleteMany({ where: { id: seriesId || undefined } });
    await db.category.deleteMany({ where: { id: categoryId || undefined } });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("list does not auto-mark read", async () => {
    const before = await countUnreadMemberNotificationsForUser(userA);
    assert.equal(before, 2);
    const list = await listMemberNotificationsForUser(userA);
    assert.equal(list.length, 2);
    assert.ok(list.every((item) => item.unread));
    const after = await countUnreadMemberNotificationsForUser(userA);
    assert.equal(after, 2);
  });

  it("list order newest first with clean titles and contexts", async () => {
    const list = await listMemberNotificationsForUser(userA);
    assert.ok(list.length >= 2);
    for (let i = 1; i < list.length; i += 1) {
      assert.ok(list[i - 1].createdAt >= list[i].createdAt);
    }
    const seriesItem = list.find((item) => item.context.kind === "series");
    const categoryItem = list.find((item) => item.context.kind === "category");
    assert.ok(seriesItem);
    assert.ok(categoryItem);
    assert.match(seriesItem!.recipeTitle || "", /Dish/);
    assert.equal(
      formatMemberNotificationContextLine(seriesItem!.context),
      `New recipe in Series ${suffix}`,
    );
    assert.equal(
      formatMemberNotificationContextLine(categoryItem!.context),
      `New recipe in Category ${suffix}`,
    );
  });

  it("mark one is owner-scoped and idempotent", async () => {
    const first = await markMemberNotificationReadForUser(userA, notificationA1);
    assert.equal(first.ok, true);
    const second = await markMemberNotificationReadForUser(userA, notificationA1);
    assert.equal(second.ok, true);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);
    const list = await listMemberNotificationsForUser(userA);
    const marked = list.find((item) => item.id === notificationA1);
    assert.equal(marked?.unread, false);
    const other = list.find((item) => item.id === notificationA2);
    assert.equal(other?.unread, true);
  });

  it("cross-user mark-read does not mutate", async () => {
    const before = await db.memberNotification.findUnique({
      where: { id: notificationA2 },
      select: { readAt: true },
    });
    assert.equal(before?.readAt, null);
    const result = await markMemberNotificationReadForUser(userB, notificationA2);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "NOT_FOUND");
    const after = await db.memberNotification.findUnique({
      where: { id: notificationA2 },
      select: { readAt: true },
    });
    assert.equal(after?.readAt, null);
  });

  it("mark all only affects owner", async () => {
    const forB = await createRecipeFollowedPublishNotificationForUser({
      userId: userB,
      recipeId: recipePubId,
      context: { kind: "none" },
    });
    assert.equal(forB.ok, true);

    const result = await markAllMemberNotificationsReadForUser(userA);
    assert.equal(result.ok, true);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);
    assert.equal(await countUnreadMemberNotificationsForUser(userB), 1);

    const list = await listMemberNotificationsForUser(userA);
    assert.ok(list.length >= 1);
    assert.ok(list.every((item) => !item.unread));
  });

  it("draft recipe notifications are hidden from list and unread count", async () => {
    const orphanCreate = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: recipeDraftId,
      context: { kind: "none" },
    });
    assert.equal(orphanCreate.ok, true);
    const list = await listMemberNotificationsForUser(userA);
    assert.ok(!list.some((item) => item.recipeId === recipeDraftId));
    // Unread count excludes draft-backed rows
    const unread = await countUnreadMemberNotificationsForUser(userA);
    assert.equal(unread, 0);

    // Republish historical notification may reappear unread if still unread
    await db.recipe.update({
      where: { id: recipeDraftId },
      data: { status: "published", publishedAt: new Date() },
    });
    const after = await listMemberNotificationsForUser(userA);
    const revived = after.find((item) => item.recipeId === recipeDraftId);
    assert.ok(revived);
    assert.equal(revived!.unread, true);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);

    // Hide again via unpublish — row remains
    await db.recipe.update({
      where: { id: recipeDraftId },
      data: { status: "draft", publishedAt: null },
    });
    assert.ok(
      !(await listMemberNotificationsForUser(userA)).some(
        (item) => item.recipeId === recipeDraftId,
      ),
    );
    if (orphanCreate.ok) {
      const row = await db.memberNotification.findUnique({ where: { id: orphanCreate.data.id } });
      assert.ok(row);
    }
  });

  it("deleted recipe hides notification; deleted context uses generic copy", async () => {
    const doomed = await db.recipe.create({
      data: {
        slug: `doomed-${suffix}`,
        title: `Doomed ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date(),
        values: JSON.stringify({ dishName: "Doomed Dish" }),
      },
    });
    const created = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: doomed.id,
      context: { kind: "series", seriesId },
    });
    assert.equal(created.ok, true);

    await db.recipe.delete({ where: { id: doomed.id } });
    const list = await listMemberNotificationsForUser(userA);
    assert.ok(created.ok);
    assert.ok(!list.some((item) => item.id === created.data.id));
    if (created.ok) {
      const row = await db.memberNotification.findUnique({ where: { id: created.data.id } });
      assert.equal(row?.recipeId, null);
    }

    // Context delete → generic line while recipe still published
    const contextRecipe = await db.recipe.create({
      data: {
        slug: `ctx-${suffix}`,
        title: `Ctx ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date(),
        values: JSON.stringify({ dishName: "Ctx Dish" }),
      },
    });
    const ephemeralSeries = await db.series.create({
      data: {
        slug: `ephemeral-${suffix}`,
        title: `Ephemeral ${suffix}`,
        isPublished: true,
      },
    });
    const withCtx = await createRecipeFollowedPublishNotificationForUser({
      userId: userA,
      recipeId: contextRecipe.id,
      context: { kind: "series", seriesId: ephemeralSeries.id },
    });
    assert.equal(withCtx.ok, true);
    await db.series.delete({ where: { id: ephemeralSeries.id } });
    const afterCtx = await listMemberNotificationsForUser(userA);
    const item = afterCtx.find((row) => row.recipeId === contextRecipe.id);
    assert.ok(item);
    assert.equal(item!.context.kind, "none");
    assert.equal(
      formatMemberNotificationContextLine(item!.context),
      "New recipe from something you follow",
    );

    await db.memberNotification.deleteMany({ where: { recipeId: contextRecipe.id } });
    await db.recipe.delete({ where: { id: contextRecipe.id } });
  });
});
