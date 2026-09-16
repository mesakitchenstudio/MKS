/**
 * Phase 8D — first-ever publish follower notification fan-out.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { recordAdminAuditEvent } from "./admin-audit.ts";
import { isMemberFollowsEnabled } from "./flags.ts";
import {
  fanOutRecipeFollowedPublishNotifications,
  maybeRunRecipeFollowedPublishFanOut,
  pickPrimaryFollowPublishContext,
} from "./member-follow-publish-fanout.ts";
import { followCategoryForUser, followSeriesForUser, unfollowCategoryForUser } from "./member-follows-server.ts";
import {
  buildRecipeFollowedPublishDedupeKey,
  MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
} from "./member-notifications.ts";
import {
  countUnreadMemberNotificationsForUser,
  createRecipeFollowedPublishNotificationForUser,
} from "./member-notifications-server.ts";
import {
  isFirstEverRecipePublicationTransition,
  RECIPE_PUBLICATION_LEGACY_MARKER_ACTION,
  recipeHadPriorPublication,
} from "./recipe-first-publication.ts";
import {
  buildRecipeRevisionSnapshot,
  createRecipeRevisionIfChanged,
} from "./recipe-revisions.ts";
import { runScheduledRecipePublishLifecycle } from "./recipe-schedule-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

function publishableValues(overrides: Record<string, unknown> = {}) {
  return {
    image: "https://example.public.blob.vercel-storage.com/flatbread.jpg",
    imageAlt: "Flatbread",
    intro: "Soft stovetop flatbread.",
    ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
    instructions: [{ title: "Mix", steps: ["Combine flour and water."] }],
    prepMinutes: 20,
    servings: 4,
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ...overrides,
  };
}

async function withGate(enabled: boolean, fn: () => Promise<void>) {
  const prev = process.env.MEMBER_FOLLOWS_ENABLED;
  try {
    if (enabled) process.env.MEMBER_FOLLOWS_ENABLED = "true";
    else delete process.env.MEMBER_FOLLOWS_ENABLED;
    await fn();
  } finally {
    if (prev === undefined) delete process.env.MEMBER_FOLLOWS_ENABLED;
    else process.env.MEMBER_FOLLOWS_ENABLED = prev;
  }
}

describe("Phase 8D — first-ever publication predicate", () => {
  it("detects eligible draft → published when no prior history", () => {
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: false,
      }),
      true,
    );
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: null,
        nextStatus: "published",
        hadPriorPublication: false,
      }),
      true,
    );
  });

  it("rejects republish, published edits, draft saves, unpublish", () => {
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: true,
      }),
      false,
    );
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: "published",
        nextStatus: "published",
        hadPriorPublication: true,
      }),
      false,
    );
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: "draft",
        nextStatus: "draft",
        hadPriorPublication: false,
      }),
      false,
    );
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: "published",
        nextStatus: "draft",
        hadPriorPublication: true,
      }),
      false,
    );
  });

  it("primary context priority and tie-break", () => {
    const matchingSeries = [
      { id: "s2", title: "Breads" },
      { id: "s1", title: "Breads" },
    ].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    const matchingCategories = [{ id: "c1", name: "Desserts" }];

    assert.deepEqual(
      pickPrimaryFollowPublishContext({
        followedSeriesIds: new Set(["s1", "s2"]),
        followedCategoryIds: new Set(["c1"]),
        matchingSeries,
        matchingCategories,
      }),
      { kind: "series", seriesId: "s1" },
    );
    assert.deepEqual(
      pickPrimaryFollowPublishContext({
        followedSeriesIds: new Set(),
        followedCategoryIds: new Set(["c1"]),
        matchingSeries,
        matchingCategories,
      }),
      { kind: "category", categoryId: "c1" },
    );
  });
});

describe("Phase 8D — wiring guards", () => {
  it("uses shared helper in manual and cron paths", () => {
    const actions = readRepo("src/app/admin/actions.ts");
    assert.match(actions, /maybeRunRecipeFollowedPublishFanOut/);
    assert.match(actions, /recipeHadPriorPublication/);
    const cron = readRepo("src/lib/recipe-schedule-server.ts");
    assert.match(cron, /maybeRunRecipeFollowedPublishFanOut/);
    const adminAudit = readRepo("src/lib/admin-audit.ts");
    assert.doesNotMatch(adminAudit, /member-follow-publish-fanout|MemberNotification/);
  });
});

describe("Phase 8D — fan-out integration", () => {
  const db = new PrismaClient();
  const suffix = `f8d-${Date.now()}`;
  let typeId = "";
  let userId = "";
  let userLateId = "";
  let seriesPubId = "";
  let seriesPub2Id = "";
  let seriesDraftId = "";
  let catDessertsId = "";
  let catMethodId = "";
  let recipeDraftId = "";
  let recipeScheduledId = "";

  before(async () => {
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    await db.recipeTypeField.createMany({
      data: [
        { typeId, key: "image", label: "Hero", kind: "image", required: true, sortOrder: 0 },
        { typeId, key: "imageAlt", label: "Alt", kind: "text", required: true, sortOrder: 1 },
        { typeId, key: "intro", label: "Intro", kind: "textarea", required: true, sortOrder: 2 },
        {
          typeId,
          key: "ingredients",
          label: "Ingredients",
          kind: "ingredients",
          required: true,
          sortOrder: 3,
        },
        {
          typeId,
          key: "instructions",
          label: "Instructions",
          kind: "instructions",
          required: true,
          sortOrder: 4,
        },
        { typeId, key: "prepMinutes", label: "Prep", kind: "minutes", required: true, sortOrder: 5 },
        { typeId, key: "servings", label: "Servings", kind: "number", required: true, sortOrder: 6 },
      ],
    });

    const [user, userLate] = await Promise.all([
      db.user.create({ data: { email: `member-${suffix}@example.com`, name: "Member" } }),
      db.user.create({ data: { email: `late-${suffix}@example.com`, name: "Late" } }),
    ]);
    userId = user.id;
    userLateId = userLate.id;

    const [seriesPub, seriesPub2, seriesDraft, catDesserts, catMethod] = await Promise.all([
      db.series.create({
        data: { slug: `series-a-${suffix}`, title: `Alpha ${suffix}`, isPublished: true },
      }),
      db.series.create({
        data: { slug: `series-b-${suffix}`, title: `Beta ${suffix}`, isPublished: true },
      }),
      db.series.create({
        data: { slug: `series-draft-${suffix}`, title: `Draft ${suffix}`, isPublished: false },
      }),
      db.category.create({
        data: { slug: `desserts-${suffix}`, name: `Desserts ${suffix}`, group: "desserts" },
      }),
      db.category.create({
        data: { slug: `method-${suffix}`, name: `Method ${suffix}`, group: "method" },
      }),
    ]);
    seriesPubId = seriesPub.id;
    seriesPub2Id = seriesPub2.id;
    seriesDraftId = seriesDraft.id;
    catDessertsId = catDesserts.id;
    catMethodId = catMethod.id;

    const values = JSON.stringify(publishableValues());
    const [draft, scheduled] = await Promise.all([
      db.recipe.create({
        data: {
          slug: `draft-${suffix}`,
          title: `Draft ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "draft",
          values,
          categories: { create: [{ categoryId: catDessertsId }] },
        },
      }),
      db.recipe.create({
        data: {
          slug: `scheduled-${suffix}`,
          title: `Scheduled ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "draft",
          values,
          scheduledPublishAt: new Date(Date.now() - 60_000),
          categories: { create: [{ categoryId: catDessertsId }] },
        },
      }),
    ]);
    recipeDraftId = draft.id;
    recipeScheduledId = scheduled.id;

    await db.seriesItem.create({
      data: { seriesId: seriesPubId, recipeId: recipeDraftId, sortOrder: 0 },
    });
    await db.seriesItem.create({
      data: { seriesId: seriesPub2Id, recipeId: recipeDraftId, sortOrder: 1 },
    });
    await db.seriesItem.create({
      data: { seriesId: seriesDraftId, recipeId: recipeDraftId, sortOrder: 2 },
    });
    await db.seriesItem.create({
      data: { seriesId: seriesPubId, recipeId: recipeScheduledId, sortOrder: 0 },
    });
  });

  after(async () => {
    await db.memberNotification.deleteMany({
      where: { userId: { in: [userId, userLateId].filter(Boolean) } },
    });
    await db.userSeriesFollow.deleteMany({
      where: { userId: { in: [userId, userLateId].filter(Boolean) } },
    });
    await db.userCategoryFollow.deleteMany({
      where: { userId: { in: [userId, userLateId].filter(Boolean) } },
    });
    await db.adminAuditEvent.deleteMany({
      where: { entityId: { in: [recipeDraftId, recipeScheduledId].filter(Boolean) } },
    });
    await db.seriesItem.deleteMany({
      where: { recipeId: { in: [recipeDraftId, recipeScheduledId].filter(Boolean) } },
    });
    await db.recipeCategory.deleteMany({
      where: { recipeId: { in: [recipeDraftId, recipeScheduledId].filter(Boolean) } },
    });
    await db.recipe.deleteMany({
      where: { id: { in: [recipeDraftId, recipeScheduledId].filter(Boolean) } },
    });
    await db.user.deleteMany({ where: { id: { in: [userId, userLateId].filter(Boolean) } } });
    await db.series.deleteMany({
      where: { id: { in: [seriesPubId, seriesPub2Id, seriesDraftId].filter(Boolean) } },
    });
    await db.category.deleteMany({
      where: { id: { in: [catDessertsId, catMethodId].filter(Boolean) } },
    });
    await db.recipeTypeField.deleteMany({ where: { typeId } });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  async function publishDraft(recipeId: string) {
    await db.recipe.update({
      where: { id: recipeId },
      data: { status: "published", publishedAt: new Date() },
    });
  }

  async function seedPriorPublication(recipeId: string) {
    await recordAdminAuditEvent({
      actor: { actorType: "system", name: "System", role: "system" },
      action: "recipe.published",
      area: "content",
      entityType: "recipe",
      entityId: recipeId,
      entityLabel: "Prior",
      entityPath: `/admin/recipes/${recipeId}`,
    });
  }

  async function notificationCount(recipeId: string) {
    return db.memberNotification.count({
      where: {
        recipeId,
        type: MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
      },
    });
  }

  it("draft save creates no notifications", async () => {
    await withGate(true, async () => {
      const result = await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeDraftId,
        previousStatus: "draft",
        nextStatus: "draft",
        hadPriorPublication: false,
      });
      assert.equal(result.eligible, false);
      assert.equal(await notificationCount(recipeDraftId), 0);
    });
  });

  it("gate OFF — first publish creates no notifications", async () => {
    await withGate(false, async () => {
      assert.equal(isMemberFollowsEnabled(), false);
      await followSeriesForUser(userId, seriesPubId);
      await publishDraft(recipeDraftId);
      const result = await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeDraftId,
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: false,
      });
      assert.equal(result.enabled, false);
      assert.equal(await notificationCount(recipeDraftId), 0);
    });
  });

  it("first manual publish — one notification with series context", async () => {
    await withGate(true, async () => {
      await db.memberNotification.deleteMany({ where: { recipeId: recipeDraftId } });
      await db.userSeriesFollow.deleteMany({ where: { userId } });
      await db.userCategoryFollow.deleteMany({ where: { userId } });
      await followSeriesForUser(userId, seriesPubId);
      await followSeriesForUser(userId, seriesPub2Id);
      await followCategoryForUser(userId, catDessertsId);

      await db.recipe.update({
        where: { id: recipeDraftId },
        data: { status: "draft", publishedAt: null },
      });

      const hadPrior = await recipeHadPriorPublication(recipeDraftId);
      assert.equal(hadPrior, false);

      await publishDraft(recipeDraftId);
      await recordAdminAuditEvent({
        actor: { actorType: "system", name: "System", role: "system" },
        action: "recipe.published",
        area: "content",
        entityType: "recipe",
        entityId: recipeDraftId,
        entityLabel: `Draft ${suffix}`,
        entityPath: `/admin/recipes/${recipeDraftId}`,
      });
      const result = await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeDraftId,
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: hadPrior,
      });

      assert.equal(result.created, 1);
      assert.equal(result.matchedUsers, 1);
      assert.equal(await notificationCount(recipeDraftId), 1);

      const row = await db.memberNotification.findFirst({
        where: { userId, recipeId: recipeDraftId },
      });
      assert.ok(row);
      assert.equal(row!.readAt, null);
      assert.equal(row!.dedupeKey, buildRecipeFollowedPublishDedupeKey(recipeDraftId));
      assert.equal(row!.seriesId, seriesPubId);
      assert.equal(row!.categoryId, null);
    });
  });

  it("published edit, slug change, update note — no extra notifications", async () => {
    await withGate(true, async () => {
      const before = await notificationCount(recipeDraftId);
      await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeDraftId,
        previousStatus: "published",
        nextStatus: "published",
        hadPriorPublication: true,
      });
      await db.recipe.update({
        where: { id: recipeDraftId },
        data: {
          slug: `renamed-${suffix}`,
          excerpt: "Updated excerpt",
          publicUpdateNote: "Updated",
          publicUpdatedAt: new Date(),
        },
      });
      await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeDraftId,
        previousStatus: "published",
        nextStatus: "published",
        hadPriorPublication: true,
      });
      assert.equal(await notificationCount(recipeDraftId), before);
    });
  });

  it("unpublish and republish — no new notifications", async () => {
    await withGate(true, async () => {
      const before = await notificationCount(recipeDraftId);
      await db.recipe.update({
        where: { id: recipeDraftId },
        data: { status: "draft", publishedAt: null },
      });
      await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeDraftId,
        previousStatus: "published",
        nextStatus: "draft",
        hadPriorPublication: true,
      });

      const hadPrior = await recipeHadPriorPublication(recipeDraftId);
      assert.equal(hadPrior, true);

      await publishDraft(recipeDraftId);
      const result = await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeDraftId,
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: hadPrior,
      });
      assert.equal(result.eligible, false);
      assert.equal(await notificationCount(recipeDraftId), before);
    });
  });

  it("late follower + republish — no notification", async () => {
    await withGate(true, async () => {
      const slug = `late-${suffix}`;
      const values = JSON.stringify(publishableValues());
      const recipe = await db.recipe.create({
        data: {
          slug,
          title: `Late ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "draft",
          values,
          categories: { create: [{ categoryId: catDessertsId }] },
        },
      });

      try {
        await seedPriorPublication(recipe.id);
        await publishDraft(recipe.id);
        await db.recipe.update({
          where: { id: recipe.id },
          data: { status: "draft", publishedAt: null },
        });

        await followCategoryForUser(userLateId, catDessertsId);
        const hadPrior = await recipeHadPriorPublication(recipe.id);
        assert.equal(hadPrior, true);

        await publishDraft(recipe.id);
        const result = await maybeRunRecipeFollowedPublishFanOut({
          recipeId: recipe.id,
          previousStatus: "draft",
          nextStatus: "published",
          hadPriorPublication: hadPrior,
        });
        assert.equal(result.eligible, false);
        assert.equal(
          await db.memberNotification.count({ where: { userId: userLateId, recipeId: recipe.id } }),
          0,
        );
      } finally {
        await db.memberNotification.deleteMany({ where: { recipeId: recipe.id } });
        await db.userCategoryFollow.deleteMany({ where: { userId: userLateId } });
        await db.adminAuditEvent.deleteMany({ where: { entityId: recipe.id } });
        await db.recipeCategory.deleteMany({ where: { recipeId: recipe.id } });
        await db.recipe.delete({ where: { id: recipe.id } });
      }
    });
  });

  it("method category follow ignored", async () => {
    await withGate(true, async () => {
      const slug = `method-only-${suffix}`;
      const recipe = await db.recipe.create({
        data: {
          slug,
          title: `Method only ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "draft",
          values: JSON.stringify(publishableValues()),
          categories: { create: [{ categoryId: catMethodId }] },
        },
      });
      const methodUser = await db.user.create({
        data: { email: `method-${suffix}@example.com`, name: "Method" },
      });
      try {
        await db.userCategoryFollow.create({
          data: { userId: methodUser.id, categoryId: catMethodId },
        });
        await publishDraft(recipe.id);
        const result = await fanOutRecipeFollowedPublishNotifications(recipe.id);
        assert.equal(result.matchedUsers, 0);
        assert.equal(result.created, 0);
      } finally {
        await db.userCategoryFollow.deleteMany({ where: { userId: methodUser.id } });
        await db.user.delete({ where: { id: methodUser.id } });
        await db.recipeCategory.deleteMany({ where: { recipeId: recipe.id } });
        await db.recipe.delete({ where: { id: recipe.id } });
      }
    });
  });

  it("unpublished series ignored; category may still notify", async () => {
    await withGate(true, async () => {
      const slug = `unpub-series-${suffix}`;
      const recipe = await db.recipe.create({
        data: {
          slug,
          title: `Unpub series ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "draft",
          values: JSON.stringify(publishableValues()),
          categories: { create: [{ categoryId: catDessertsId }] },
        },
      });
      const isolatedUser = await db.user.create({
        data: { email: `unpub-${suffix}@example.com`, name: "Unpub" },
      });
      try {
        await db.seriesItem.create({
          data: { seriesId: seriesDraftId, recipeId: recipe.id, sortOrder: 0 },
        });
        await followSeriesForUser(isolatedUser.id, seriesDraftId);
        await followCategoryForUser(isolatedUser.id, catDessertsId);
        await publishDraft(recipe.id);
        await fanOutRecipeFollowedPublishNotifications(recipe.id);
        const row = await db.memberNotification.findFirst({
          where: { userId: isolatedUser.id, recipeId: recipe.id },
        });
        assert.ok(row);
        assert.equal(row?.seriesId, null);
        assert.equal(row?.categoryId, catDessertsId);
      } finally {
        await db.memberNotification.deleteMany({ where: { recipeId: recipe.id } });
        await db.userSeriesFollow.deleteMany({ where: { userId: isolatedUser.id } });
        await db.userCategoryFollow.deleteMany({ where: { userId: isolatedUser.id } });
        await db.seriesItem.deleteMany({ where: { recipeId: recipe.id } });
        await db.user.delete({ where: { id: isolatedUser.id } });
        await db.recipeCategory.deleteMany({ where: { recipeId: recipe.id } });
        await db.recipe.delete({ where: { id: recipe.id } });
      }
    });
  });

  it("category-only match", async () => {
    await withGate(true, async () => {
      const slug = `cat-only-${suffix}`;
      const recipe = await db.recipe.create({
        data: {
          slug,
          title: `Cat only ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "draft",
          values: JSON.stringify(publishableValues()),
          categories: { create: [{ categoryId: catDessertsId }] },
        },
      });
      const catUser = await db.user.create({
        data: { email: `cat-${suffix}@example.com`, name: "Cat" },
      });
      try {
        await followCategoryForUser(catUser.id, catDessertsId);
        await publishDraft(recipe.id);
        await fanOutRecipeFollowedPublishNotifications(recipe.id);
        const row = await db.memberNotification.findFirst({
          where: { userId: catUser.id, recipeId: recipe.id },
        });
        assert.equal(row?.categoryId, catDessertsId);
        assert.equal(row?.seriesId, null);
      } finally {
        await db.memberNotification.deleteMany({ where: { recipeId: recipe.id } });
        await db.userCategoryFollow.deleteMany({ where: { userId: catUser.id } });
        await db.user.delete({ where: { id: catUser.id } });
        await db.recipeCategory.deleteMany({ where: { recipeId: recipe.id } });
        await db.recipe.delete({ where: { id: recipe.id } });
      }
    });
  });

  it("idempotent rerun counts deduped", async () => {
    await withGate(true, async () => {
      const first = await fanOutRecipeFollowedPublishNotifications(recipeDraftId);
      const second = await fanOutRecipeFollowedPublishNotifications(recipeDraftId);
      assert.ok(first.created + first.deduped >= 1);
      assert.equal(second.deduped, second.matchedUsers);
      assert.equal(second.created, 0);
    });
  });

  it("no followers — successful zero result", async () => {
    await withGate(true, async () => {
      const slug = `lonely-${suffix}`;
      const recipe = await db.recipe.create({
        data: {
          slug,
          title: `Lonely ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: JSON.stringify(publishableValues()),
        },
      });
      try {
        const result = await fanOutRecipeFollowedPublishNotifications(recipe.id);
        assert.equal(result.matchedUsers, 0);
        assert.equal(result.created, 0);
        assert.equal(result.failed, 0);
      } finally {
        await db.recipe.delete({ where: { id: recipe.id } });
      }
    });
  });

  it("maybeRun never throws when recipe missing after publish boundary", async () => {
    await withGate(true, async () => {
      await assert.doesNotReject(async () => {
        const result = await maybeRunRecipeFollowedPublishFanOut({
          recipeId: "nonexistent-recipe-id",
          previousStatus: "draft",
          nextStatus: "published",
          hadPriorPublication: false,
        });
        assert.equal(result.eligible, true);
      });
    });
  });

  it("membership/category change after publication — no notification", async () => {
    await withGate(true, async () => {
      const slug = `post-membership-${suffix}`;
      const recipe = await db.recipe.create({
        data: {
          slug,
          title: `Post membership ${suffix}`,
          excerpt: "Excerpt",
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: JSON.stringify(publishableValues()),
        },
      });
      const isoUser = await db.user.create({
        data: { email: `post-${suffix}@example.com`, name: "Post" },
      });
      try {
        await seedPriorPublication(recipe.id);
        await followSeriesForUser(isoUser.id, seriesPubId);
        await db.seriesItem.create({
          data: { seriesId: seriesPubId, recipeId: recipe.id, sortOrder: 0 },
        });
        await db.recipeCategory.create({
          data: { recipeId: recipe.id, categoryId: catDessertsId },
        });
        const result = await maybeRunRecipeFollowedPublishFanOut({
          recipeId: recipe.id,
          previousStatus: "published",
          nextStatus: "published",
          hadPriorPublication: true,
        });
        assert.equal(result.eligible, false);
        assert.equal(
          await db.memberNotification.count({ where: { userId: isoUser.id, recipeId: recipe.id } }),
          0,
        );
      } finally {
        await db.seriesItem.deleteMany({ where: { recipeId: recipe.id } });
        await db.recipeCategory.deleteMany({ where: { recipeId: recipe.id } });
        await db.userSeriesFollow.deleteMany({ where: { userId: isoUser.id } });
        await db.user.delete({ where: { id: isoUser.id } });
        await db.adminAuditEvent.deleteMany({ where: { entityId: recipe.id } });
        await db.recipe.delete({ where: { id: recipe.id } });
      }
    });
  });

  it("first scheduled publish through cron lifecycle", async () => {
    await withGate(true, async () => {
      await db.memberNotification.deleteMany({ where: { recipeId: recipeScheduledId } });
      await db.userSeriesFollow.deleteMany({ where: { userId } });
      await db.userCategoryFollow.deleteMany({ where: { userId } });
      await followCategoryForUser(userId, catDessertsId);

      await db.recipe.update({
        where: { id: recipeScheduledId },
        data: {
          status: "draft",
          publishedAt: null,
          scheduledPublishAt: new Date(Date.now() - 60_000),
        },
      });

      const hadPrior = await recipeHadPriorPublication(recipeScheduledId);
      assert.equal(hadPrior, false);

      const run = await runScheduledRecipePublishLifecycle(new Date());
      assert.ok(run.published >= 1);

      assert.equal(await notificationCount(recipeScheduledId), 1);
      const row = await db.memberNotification.findFirst({
        where: { userId, recipeId: recipeScheduledId },
      });
      assert.ok(row);
      assert.equal(row!.categoryId, catDessertsId);
    });
  });
});

describe("Phase 8F — durable signal independence + lifecycle hardening", () => {
  const db = new PrismaClient();
  const suffix = `f8f-${Date.now()}`;
  let typeId = "";
  let userId = "";
  let categoryId = "";
  let recipeAuditOnly = "";
  let recipeRevOnly = "";
  let recipeNeither = "";
  let recipeLife = "";
  let recipeLegacy = "";
  let recipeWrongEntity = "";
  let recipeLegacyRepub = "";

  before(async () => {
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    const user = await db.user.create({
      data: { email: `f8f-${suffix}@example.com`, name: "F8F" },
    });
    userId = user.id;
    const category = await db.category.create({
      data: { slug: `cat-${suffix}`, name: `Cat ${suffix}`, group: "desserts" },
    });
    categoryId = category.id;

    const [a, b, c, life, legacy, wrong, legRepub] = await Promise.all([
      db.recipe.create({
        data: {
          slug: `audit-only-${suffix}`,
          title: `Audit only ${suffix}`,
          typeId,
          status: "draft",
          values: "{}",
        },
      }),
      db.recipe.create({
        data: {
          slug: `rev-only-${suffix}`,
          title: `Rev only ${suffix}`,
          typeId,
          status: "draft",
          values: "{}",
        },
      }),
      db.recipe.create({
        data: {
          slug: `neither-${suffix}`,
          title: `Neither ${suffix}`,
          typeId,
          status: "draft",
          values: "{}",
        },
      }),
      db.recipe.create({
        data: {
          slug: `life-${suffix}`,
          title: `Life ${suffix}`,
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: "{}",
          categories: { create: [{ categoryId }] },
        },
      }),
      db.recipe.create({
        data: {
          slug: `legacy-${suffix}`,
          title: `Legacy ${suffix}`,
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: "{}",
          categories: { create: [{ categoryId }] },
        },
      }),
      db.recipe.create({
        data: {
          slug: `wrong-ent-${suffix}`,
          title: `Wrong entity ${suffix}`,
          typeId,
          status: "draft",
          values: "{}",
        },
      }),
      db.recipe.create({
        data: {
          slug: `leg-repub-${suffix}`,
          title: `Legacy repub ${suffix}`,
          typeId,
          status: "published",
          publishedAt: new Date(),
          values: JSON.stringify(publishableValues()),
          categories: { create: [{ categoryId }] },
        },
      }),
    ]);
    recipeAuditOnly = a.id;
    recipeRevOnly = b.id;
    recipeNeither = c.id;
    recipeLife = life.id;
    recipeLegacy = legacy.id;
    recipeWrongEntity = wrong.id;
    recipeLegacyRepub = legRepub.id;

    await recordAdminAuditEvent({
      actor: { actorType: "system", name: "System", role: "system" },
      action: "recipe.published",
      area: "content",
      entityType: "recipe",
      entityId: recipeAuditOnly,
      entityLabel: a.title,
      entityPath: `/admin/recipes/${a.id}`,
    });

    await recordAdminAuditEvent({
      actor: { actorType: "system", name: "System", role: "system" },
      action: RECIPE_PUBLICATION_LEGACY_MARKER_ACTION,
      area: "content",
      entityType: "recipe",
      entityId: recipeLegacy,
      entityLabel: legacy.title,
      entityPath: `/admin/recipes/${legacy.id}`,
      metadata: {
        source: "roadmap_8",
        reason: "legacy_publication_safety_backfill",
        syntheticHistoricalMarker: true,
        meaning: "Recipe was already public before follower-notification tracking",
      },
    });

    await recordAdminAuditEvent({
      actor: { actorType: "system", name: "System", role: "system" },
      action: RECIPE_PUBLICATION_LEGACY_MARKER_ACTION,
      area: "content",
      entityType: "recipe",
      entityId: recipeLegacyRepub,
      entityLabel: legRepub.title,
      entityPath: `/admin/recipes/${legRepub.id}`,
      metadata: {
        source: "roadmap_8",
        reason: "legacy_publication_safety_backfill",
        syntheticHistoricalMarker: true,
        meaning: "Recipe was already public before follower-notification tracking",
      },
    });

    // Same entityId, non-recipe entityType — must NOT count as prior publication.
    await db.adminAuditEvent.create({
      data: {
        actorType: "system",
        actorName: "System",
        actorRole: "system",
        action: "recipe.published",
        area: "content",
        entityType: "category",
        entityId: recipeWrongEntity,
        entityLabel: "spoof",
        entityPath: "/admin",
        metadata: "{}",
      },
    });
    await db.adminAuditEvent.create({
      data: {
        actorType: "system",
        actorName: "System",
        actorRole: "system",
        action: RECIPE_PUBLICATION_LEGACY_MARKER_ACTION,
        area: "content",
        entityType: "series",
        entityId: recipeWrongEntity,
        entityLabel: "spoof-legacy",
        entityPath: "/admin",
        metadata: "{}",
      },
    });

    const snap = buildRecipeRevisionSnapshot({
      title: b.title,
      excerpt: "",
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [],
      values: {},
      slug: b.slug,
      status: "published",
      publishedAt: new Date(),
    });
    await createRecipeRevisionIfChanged(db, {
      recipeId: recipeRevOnly,
      actor: { name: "System", role: "system" },
      snapshot: snap,
      reason: "published",
      force: true,
    });
  });

  after(async () => {
    await db.memberNotification.deleteMany({ where: { userId } });
    await db.userCategoryFollow.deleteMany({ where: { userId } });
    await db.adminAuditEvent.deleteMany({
      where: {
        entityId: {
          in: [
            recipeAuditOnly,
            recipeRevOnly,
            recipeNeither,
            recipeLife,
            recipeLegacy,
            recipeWrongEntity,
            recipeLegacyRepub,
          ],
        },
      },
    });
    await db.recipeRevision.deleteMany({
      where: {
        stableRecipeId: {
          in: [
            recipeAuditOnly,
            recipeRevOnly,
            recipeNeither,
            recipeLife,
            recipeLegacy,
            recipeWrongEntity,
            recipeLegacyRepub,
          ],
        },
      },
    });
    await db.recipeCategory.deleteMany({
      where: { recipeId: { in: [recipeLife, recipeLegacy, recipeLegacyRepub] } },
    });
    await db.user.deleteMany({ where: { id: userId } });
    await db.recipe.deleteMany({
      where: {
        id: {
          in: [
            recipeAuditOnly,
            recipeRevOnly,
            recipeNeither,
            recipeLife,
            recipeLegacy,
            recipeWrongEntity,
            recipeLegacyRepub,
          ],
        },
      },
    });
    await db.category.deleteMany({ where: { id: categoryId } });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("never-published draft is not prior publication", async () => {
    assert.equal(await recipeHadPriorPublication(recipeNeither), false);
  });

  it("audit-only history is durable prior publication", async () => {
    assert.equal(await recipeHadPriorPublication(recipeAuditOnly), true);
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: true,
      }),
      false,
    );
  });

  it("revision-only history is durable prior publication", async () => {
    assert.equal(await recipeHadPriorPublication(recipeRevOnly), true);
  });

  it("legacy marker alone is durable prior publication", async () => {
    assert.equal(await recipeHadPriorPublication(recipeLegacy), true);
    const publishedCount = await db.adminAuditEvent.count({
      where: {
        entityType: "recipe",
        entityId: recipeLegacy,
        action: "recipe.published",
      },
    });
    const revCount = await db.recipeRevision.count({
      where: { stableRecipeId: recipeLegacy, reason: "published" },
    });
    assert.equal(publishedCount, 0);
    assert.equal(revCount, 0);
  });

  it("non-recipe entityType with same entityId does not count", async () => {
    assert.equal(await recipeHadPriorPublication(recipeWrongEntity), false);
  });

  it("neither signal keeps first-ever eligibility (legacy risk class)", async () => {
    assert.equal(await recipeHadPriorPublication(recipeNeither), false);
    assert.equal(
      isFirstEverRecipePublicationTransition({
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: false,
      }),
      true,
    );
  });

  it("legacy-marked Recipe republish does not notify followers", async () => {
    await withGate(true, async () => {
      await db.memberNotification.deleteMany({ where: { userId } });
      await db.userCategoryFollow.deleteMany({ where: { userId } });
      await followCategoryForUser(userId, categoryId);

      assert.equal(await recipeHadPriorPublication(recipeLegacyRepub), true);

      await db.recipe.update({
        where: { id: recipeLegacyRepub },
        data: { status: "draft", publishedAt: null },
      });
      await db.recipe.update({
        where: { id: recipeLegacyRepub },
        data: { status: "published", publishedAt: new Date() },
      });

      const result = await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeLegacyRepub,
        previousStatus: "draft",
        nextStatus: "published",
        hadPriorPublication: true,
      });
      assert.equal(result.eligible, false);
      assert.equal(
        await db.memberNotification.count({
          where: {
            userId,
            recipeId: recipeLegacyRepub,
            type: MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
          },
        }),
        0,
      );
    });
  });

  it("unfollow before fan-out yields zero notifications", async () => {
    await withGate(true, async () => {
      await followCategoryForUser(userId, categoryId);
      await unfollowCategoryForUser(userId, categoryId);
      const result = await fanOutRecipeFollowedPublishNotifications(recipeLife);
      assert.equal(result.matchedUsers, 0);
      assert.equal(result.created, 0);
    });
  });

  it("published edit path remains ineligible after late follow", async () => {
    await withGate(true, async () => {
      await followCategoryForUser(userId, categoryId);
      const blocked = await maybeRunRecipeFollowedPublishFanOut({
        recipeId: recipeLife,
        previousStatus: "published",
        nextStatus: "published",
        hadPriorPublication: true,
      });
      assert.equal(blocked.eligible, false);
    });
  });

  it("gate OFF preserves rows; gate ON resurfaces unread count", async () => {
    await createRecipeFollowedPublishNotificationForUser({
      userId,
      recipeId: recipeLife,
      context: { kind: "category", categoryId },
    });
    await withGate(false, async () => {
      const disabled = await fanOutRecipeFollowedPublishNotifications(recipeLife);
      assert.equal(disabled.enabled, false);
      assert.equal(
        await db.memberNotification.count({ where: { userId, recipeId: recipeLife } }),
        1,
      );
    });
    await withGate(true, async () => {
      assert.equal(await countUnreadMemberNotificationsForUser(userId), 1);
    });
  });
});
