/**
 * Phase 6C hardening — transient retry, revision ownership, per-admin receipts,
 * cron claim idempotency. Uses local Prisma DB with isolated fixtures.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  applyNotificationReceipt,
  countUnreadAdminNotifications,
  adminNotificationAdminKey,
} from "./admin-notifications.ts";
import {
  createAdminNotification,
  dismissAdminNotification,
  listAdminNotificationsForAdmin,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "./admin-notifications-server.ts";
import { getDb } from "./db.ts";
import {
  buildRecipeRevisionSnapshot,
  createRecipeRevisionIfChanged,
  hashRecipeRevisionSnapshot,
} from "./recipe-revisions.ts";
import {
  decideScheduledRecipePublish,
  scheduleFailureClearsSchedule,
  scheduledPublishClaimWhere,
} from "./recipe-schedule.ts";
import {
  claimScheduledRecipePublish,
  runScheduledRecipePublishLifecycle,
} from "./recipe-schedule-server.ts";

const requiredFields = [
  { key: "image", label: "Hero image", kind: "image", required: true },
  { key: "imageAlt", label: "Image alt", kind: "text", required: true },
  { key: "intro", label: "Intro", kind: "textarea", required: true },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "prepMinutes", label: "Prep", kind: "minutes", required: true },
  { key: "servings", label: "Servings", kind: "number", required: true },
];

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

describe("phase 6C hardening — pure contracts", () => {
  it("clears schedule only for deterministic failures", () => {
    assert.equal(scheduleFailureClearsSchedule("deterministic"), true);
    assert.equal(scheduleFailureClearsSchedule("transient"), false);
  });

  it("maps not_ready to fail and ready paths to publish", () => {
    const due = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:01:00.000Z");
    assert.equal(
      decideScheduledRecipePublish({
        status: "draft",
        scheduledPublishAt: due,
        readinessStatus: "not_ready",
        now,
      }).action,
      "fail",
    );
    assert.equal(
      decideScheduledRecipePublish({
        status: "draft",
        scheduledPublishAt: due,
        readinessStatus: "ready",
        now,
      }).action,
      "publish",
    );
  });

  it("keeps receipt state independent per admin in pure merge", () => {
    const base = {
      id: "n1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      type: "recipe.schedule.succeeded",
      title: "Published",
      body: "",
      severity: "success",
      entityType: "recipe",
      entityId: "r1",
      entityLabel: "A",
      entityPath: "/admin/recipes/r1",
      recipientAdminId: null,
      metadata: {},
    };
    const forA = applyNotificationReceipt(base, {
      readAt: "2026-01-01T01:00:00.000Z",
      dismissedAt: null,
    });
    const forB = applyNotificationReceipt(base, null);
    assert.ok(forA.readAt);
    assert.equal(forB.readAt, null);
    assert.equal(countUnreadAdminNotifications([forA, forB]), 1);
    assert.equal(adminNotificationAdminKey("env"), "env");
    assert.equal(adminNotificationAdminKey("admin_1"), "admin_1");
    const now = new Date("2026-01-01T00:00:00.000Z");
    assert.deepEqual(scheduledPublishClaimWhere({ recipeId: "r1", now }).id, "r1");
  });
});

describe("phase 6C hardening — DB contracts", () => {
  const db = new PrismaClient();
  const suffix = `p6ch-${Date.now()}`;
  let typeId = "";
  let readyRecipeId = "";
  let raceRecipeId = "";
  let adminAId = "";
  let adminBId = "";
  const createdRecipeIds: string[] = [];
  const createdNotificationIds: string[] = [];

  before(async () => {
    await getDb().$queryRaw`SELECT 1`;
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    for (const field of requiredFields) {
      await db.recipeTypeField.create({
        data: {
          typeId,
          key: field.key,
          label: field.label,
          kind: field.kind,
          required: field.required,
          sortOrder: requiredFields.indexOf(field),
        },
      });
    }
    const adminA = await db.admin.create({
      data: {
        email: `a-${suffix}@example.com`,
        name: "Admin A",
        passwordHash: "x",
        role: "editor",
      },
    });
    const adminB = await db.admin.create({
      data: {
        email: `b-${suffix}@example.com`,
        name: "Admin B",
        passwordHash: "x",
        role: "editor",
      },
    });
    adminAId = adminA.id;
    adminBId = adminB.id;
  });

  after(async () => {
    await db.adminNotificationReceipt.deleteMany({
      where: { adminKey: { in: [adminAId, adminBId, "env"] } },
    });
    if (createdNotificationIds.length) {
      await db.adminNotification.deleteMany({ where: { id: { in: createdNotificationIds } } });
    }
    await db.adminNotification.deleteMany({
      where: { entityId: { in: createdRecipeIds } },
    });
    if (createdRecipeIds.length) {
      await db.recipeRevision.deleteMany({
        where: { stableRecipeId: { in: createdRecipeIds } },
      });
      await db.recipe.deleteMany({ where: { id: { in: createdRecipeIds } } });
    }
    await db.recipeTypeField.deleteMany({ where: { typeId } });
    await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.admin.deleteMany({ where: { id: { in: [adminAId, adminBId] } } });
    await db.$disconnect();
  });

  async function createDraft(opts: {
    slug: string;
    title: string;
    values?: Record<string, unknown>;
    scheduledPublishAt?: Date | null;
  }) {
    const row = await db.recipe.create({
      data: {
        slug: opts.slug,
        title: opts.title,
        excerpt: "Soft and flexible.",
        typeId,
        status: "draft",
        scheduledPublishAt: opts.scheduledPublishAt ?? null,
        values: JSON.stringify(opts.values ?? publishableValues()),
      },
    });
    createdRecipeIds.push(row.id);
    return row;
  }

  it("1. not_ready clears schedule and emits blocked audit/notification once", async () => {
    const due = new Date(Date.now() - 60_000);
    const recipe = await createDraft({
      slug: `blocked-${suffix}`,
      title: `Blocked ${suffix}`,
      values: publishableValues({ intro: "" }),
      scheduledPublishAt: due,
    });

    const first = await runScheduledRecipePublishLifecycle(new Date());
    assert.equal(first.failedDeterministic >= 1, true);

    const after = await db.recipe.findUnique({ where: { id: recipe.id } });
    assert.equal(after?.status, "draft");
    assert.equal(after?.scheduledPublishAt, null);

    const audits = await db.adminAuditEvent.findMany({
      where: {
        entityId: recipe.id,
        action: "recipe.scheduled_publish_blocked",
      },
    });
    assert.equal(audits.length, 1);

    const notes = await db.adminNotification.findMany({
      where: { entityId: recipe.id, type: "recipe.schedule.blocked" },
    });
    assert.equal(notes.length, 1);
    createdNotificationIds.push(...notes.map((n) => n.id));

    // Re-run would not find the recipe (schedule cleared) — no spam.
    await runScheduledRecipePublishLifecycle(new Date());
    const notesAfter = await db.adminNotification.findMany({
      where: { entityId: recipe.id, type: "recipe.schedule.blocked" },
    });
    assert.equal(notesAfter.length, 1);
  });

  it("2–5. publication-only cron does not duplicate content revision; claim is idempotent", async () => {
    const due = new Date(Date.now() - 60_000);
    const recipe = await createDraft({
      slug: `ready-${suffix}`,
      title: `Ready ${suffix}`,
      scheduledPublishAt: due,
    });
    readyRecipeId = recipe.id;

    const baseline = buildRecipeRevisionSnapshot({
      title: recipe.title,
      excerpt: recipe.excerpt,
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [],
      values: recipe.values,
      slug: recipe.slug,
      status: "draft",
      publishedAt: null,
    });
    const created = await createRecipeRevisionIfChanged(db, {
      recipeId: recipe.id,
      actor: { name: "Editor", role: "editor" },
      snapshot: baseline,
      isCreate: true,
      force: true,
      reason: "created",
    });
    assert.equal(created.created, true);
    const beforeCount = await db.recipeRevision.count({
      where: { stableRecipeId: recipe.id },
    });
    const beforeHash = hashRecipeRevisionSnapshot(baseline);

    const run = await runScheduledRecipePublishLifecycle(new Date());
    assert.ok(run.published >= 1);

    const published = await db.recipe.findUnique({ where: { id: recipe.id } });
    assert.equal(published?.status, "published");
    assert.equal(published?.scheduledPublishAt, null);
    assert.ok(published?.publishedAt);

    const afterCount = await db.recipeRevision.count({
      where: { stableRecipeId: recipe.id },
    });
    assert.equal(afterCount, beforeCount, "publication-only must not insert content revision");

    const latest = await db.recipeRevision.findFirst({
      where: { stableRecipeId: recipe.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    assert.equal(latest?.contentHash, beforeHash);

    const audits = await db.adminAuditEvent.findMany({
      where: { entityId: recipe.id, action: "recipe.published" },
    });
    assert.equal(audits.length, 1);

    const successNotes = await db.adminNotification.findMany({
      where: { entityId: recipe.id, type: "recipe.schedule.succeeded" },
    });
    assert.equal(successNotes.length, 1);
    createdNotificationIds.push(...successNotes.map((n) => n.id));

    // Cron again after success — ignored, no new audit/notification.
    await runScheduledRecipePublishLifecycle(new Date());
    const audits2 = await db.adminAuditEvent.findMany({
      where: { entityId: recipe.id, action: "recipe.published" },
    });
    const successNotes2 = await db.adminNotification.findMany({
      where: { entityId: recipe.id, type: "recipe.schedule.succeeded" },
    });
    assert.equal(audits2.length, 1);
    assert.equal(successNotes2.length, 1);
  });

  it("A. concurrent claims publish once", async () => {
    const due = new Date(Date.now() - 60_000);
    const recipe = await createDraft({
      slug: `race-${suffix}`,
      title: `Race ${suffix}`,
      scheduledPublishAt: due,
    });
    raceRecipeId = recipe.id;
    const now = new Date();
    const publishedAt = now;
    const [a, b] = await Promise.all([
      claimScheduledRecipePublish({ recipeId: recipe.id, publishedAt, now }),
      claimScheduledRecipePublish({ recipeId: recipe.id, publishedAt, now }),
    ]);
    assert.equal(Number(a.claimed) + Number(b.claimed), 1);
    const row = await db.recipe.findUnique({ where: { id: recipe.id } });
    assert.equal(row?.status, "published");
    assert.equal(row?.scheduledPublishAt, null);
  });

  it("B. human publish clears schedule so cron claim is a no-op", async () => {
    const due = new Date(Date.now() - 60_000);
    const recipe = await createDraft({
      slug: `human-${suffix}`,
      title: `Human ${suffix}`,
      scheduledPublishAt: due,
    });
    await db.recipe.update({
      where: { id: recipe.id },
      data: {
        status: "published",
        publishedAt: new Date(),
        scheduledPublishAt: null,
      },
    });
    const claim = await claimScheduledRecipePublish({
      recipeId: recipe.id,
      publishedAt: new Date(),
      now: new Date(),
    });
    assert.equal(claim.claimed, false);
  });

  it("3–4. transient retry keeps schedule and dedupes retry notifications", async () => {
    const due = new Date(Date.now() - 60_000);
    const recipe = await createDraft({
      slug: `retry-${suffix}`,
      title: `Retry ${suffix}`,
      scheduledPublishAt: due,
    });

    const first = await createAdminNotification({
      type: "recipe.schedule.retrying",
      severity: "attention",
      title: `Scheduled publish delayed for “${recipe.title}”`,
      body: "A temporary system error blocked publish. Mesa will retry automatically.",
      entityType: "recipe",
      entityId: recipe.id,
      entityLabel: recipe.title,
      entityPath: `/admin/recipes/${recipe.id}`,
      dedupeByTypeEntity: true,
    });
    createdNotificationIds.push(first.id);

    const second = await createAdminNotification({
      type: "recipe.schedule.retrying",
      severity: "attention",
      title: `Scheduled publish delayed for “${recipe.title}”`,
      body: "A temporary system error blocked publish. Mesa will retry automatically.",
      entityType: "recipe",
      entityId: recipe.id,
      entityLabel: recipe.title,
      entityPath: `/admin/recipes/${recipe.id}`,
      dedupeByTypeEntity: true,
    });
    assert.equal(second.id, first.id);

    const still = await db.recipe.findUnique({ where: { id: recipe.id } });
    assert.ok(still?.scheduledPublishAt);

    // Later success publishes once.
    const run = await runScheduledRecipePublishLifecycle(new Date());
    assert.ok(run.published >= 1);
    const published = await db.recipe.findUnique({ where: { id: recipe.id } });
    assert.equal(published?.status, "published");
    assert.equal(published?.scheduledPublishAt, null);
    const success = await db.adminNotification.findMany({
      where: { entityId: recipe.id, type: "recipe.schedule.succeeded" },
    });
    assert.equal(success.length, 1);
    createdNotificationIds.push(...success.map((n) => n.id));
  });

  it("per-admin read/dismiss does not affect the other admin", async () => {
    const note = await createAdminNotification({
      type: "recipe.schedule.succeeded",
      severity: "success",
      title: `Shared note ${suffix}`,
      body: "Both editors should see this.",
      entityType: "recipe",
      entityId: readyRecipeId || raceRecipeId,
      entityLabel: "Shared",
      entityPath: "/admin/recipes/x",
    });
    createdNotificationIds.push(note.id);

    const listA1 = await listAdminNotificationsForAdmin({ adminId: adminAId });
    const listB1 = await listAdminNotificationsForAdmin({ adminId: adminBId });
    assert.ok(listA1.some((row) => row.id === note.id && !row.readAt));
    assert.ok(listB1.some((row) => row.id === note.id && !row.readAt));

    await markAdminNotificationRead(note.id, adminAId);
    const listA2 = await listAdminNotificationsForAdmin({ adminId: adminAId });
    const listB2 = await listAdminNotificationsForAdmin({ adminId: adminBId });
    assert.ok(listA2.some((row) => row.id === note.id && row.readAt));
    assert.ok(listB2.some((row) => row.id === note.id && !row.readAt));

    await dismissAdminNotification(note.id, adminAId);
    const listA3 = await listAdminNotificationsForAdmin({
      adminId: adminAId,
      includeDismissed: false,
    });
    const listB3 = await listAdminNotificationsForAdmin({ adminId: adminBId });
    assert.equal(listA3.some((row) => row.id === note.id), false);
    assert.ok(listB3.some((row) => row.id === note.id && !row.dismissedAt));

    await markAllAdminNotificationsRead(adminAId);
    const listB4 = await listAdminNotificationsForAdmin({
      adminId: adminBId,
      unreadOnly: true,
    });
    assert.ok(listB4.some((row) => row.id === note.id));
  });

  it("wiring: schedule server retains transient schedule and omits force revision", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const server = readFileSync(join(process.cwd(), "src/lib/recipe-schedule-server.ts"), "utf8");
    assert.match(server, /recipe\.scheduled_publish_blocked/);
    assert.match(server, /recipe\.schedule\.retrying/);
    assert.match(server, /claimScheduledRecipePublish/);
    assert.doesNotMatch(server, /force:\s*true/);
    assert.match(server, /scheduleFailureClearsSchedule\("transient"\)/);
    assert.match(server, /scheduleFailureClearsSchedule\("deterministic"\)/);
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    assert.match(schema, /model AdminNotificationReceipt/);
    assert.match(schema, /Per-Admin read\/dismiss/);
  });
});
