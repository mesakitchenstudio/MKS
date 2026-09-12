/**
 * Phase 1F — cross-system lifecycle regression.
 * Isolated fixtures; exercises Redirect, Identity, Revisions, Audit, Readiness,
 * favorites, and reviews together via shared lib helpers (same DB as getDb()).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { canAccess, canViewAdminActivity } from "./admin-access.ts";
import {
  actorFromAdminSession,
  recordAdminAuditEvent,
  recordRecipeSaveAudit,
} from "./admin-audit.ts";
import { getDb } from "./db.ts";
import { getRecipePublishingReadiness } from "./recipe-publishing-readiness.ts";
import {
  backfillRecipeRevisionBaselines,
  buildRecipeRevisionSnapshot,
  createRecipeRevisionIfChanged,
  hashRecipeRevisionSnapshot,
  listRecipeRevisions,
  restoreRecipeRevisionContent,
} from "./recipe-revisions.ts";
import { syncDenormalizedRecipeIdentity } from "./recipe-identity.ts";
import { selectStageVideoHelp } from "./recipe-stage-video-help.ts";
import {
  recipePublicPath,
  resolveActiveRedirect,
  upsertRecipeSlugChangeRedirect,
} from "./redirects.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string) {
  return readFileSync(path.join(root, "..", rel), "utf8");
}

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
    image: "https://cdn.example.public.blob.vercel-storage.com/baguette.jpg",
    imageAlt: "Test baguette",
    intro: "Crisp crust, open crumb.",
    ingredients: [{ name: "Dough", items: [{ item: "flour", amount: "500g", notes: "" }] }],
    instructions: [
      {
        title: "Mix",
        steps: ["Combine flour and water."],
        videoStart: "0:30",
      },
    ],
    prepMinutes: 25,
    servings: 4,
    youtubeUrl: "",
    ...overrides,
  };
}

describe("Phase 1F cross-system lifecycle", () => {
  const db = new PrismaClient();
  const suffix = `p1f-${Date.now()}`;
  const actor = {
    id: "env",
    name: "Owner",
    email: `owner-${suffix}@example.com`,
    role: "owner",
  };
  const auditActor = actorFromAdminSession(actor);

  let typeId = "";
  let categoryId = "";
  let userId = "";
  let recipeId = "";
  let deletedStableId = "";
  const slug1 = `test-french-baguette-${suffix}`;
  const slug2 = `test-classic-french-baguette-${suffix}`;
  const slug3 = `classic-test-baguette-${suffix}`;
  let firstContentRevisionId = "";

  before(async () => {
    // Ensure Prisma client sees RecipeRevision etc.
    await getDb().$queryRaw`SELECT 1`;

    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    const category = await db.category.create({
      data: {
        slug: `cat-${suffix}`,
        name: `Cat ${suffix}`,
        group: "course",
      },
    });
    categoryId = category.id;
    const user = await db.user.create({
      data: { email: `member-${suffix}@example.com`, name: "Lifecycle Member" },
    });
    userId = user.id;
  });

  after(async () => {
    const memberEmail = `member-${suffix}@example.com`;
    const ownerEmail = `owner-${suffix}@example.com`;
    const ids = new Set<string>();
    if (recipeId) ids.add(recipeId);
    if (deletedStableId) ids.add(deletedStableId);

    for (const id of ids) {
      await db.recipeRevision.deleteMany({ where: { stableRecipeId: id } });
      await db.adminAuditEvent.deleteMany({ where: { entityId: id } });
      await db.recipeCategory.deleteMany({ where: { recipeId: id } });
      await db.recipe.deleteMany({ where: { id } });
    }

    await db.adminAuditEvent.deleteMany({ where: { actorEmail: ownerEmail } });
    await db.recipeReview.deleteMany({ where: { authorEmail: memberEmail } });
    await db.recipeSave.deleteMany({ where: { userId } });
    await db.redirect.deleteMany({
      where: {
        OR: [{ fromPath: { contains: suffix } }, { toPath: { contains: suffix } }],
      },
    });
    await db.user.deleteMany({ where: { id: userId } });
    await db.category.deleteMany({ where: { id: categoryId } });
    await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("1–4 create, content save, no-op dedupe, readiness fail/publish", async () => {
    const values = publishableValues({ intro: "" }); // incomplete draft OK
    const created = await db.recipe.create({
      data: {
        title: "Test French Baguette",
        slug: slug1,
        excerpt: "",
        typeId,
        status: "draft",
        values: JSON.stringify(values),
      },
    });
    recipeId = created.id;
    await db.recipeCategory.create({ data: { recipeId, categoryId } });

    const snap1 = buildRecipeRevisionSnapshot({
      title: created.title,
      excerpt: "",
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [categoryId],
      values,
      slug: slug1,
      status: "draft",
      publishedAt: null,
    });
    const rev1 = await createRecipeRevisionIfChanged(db, {
      recipeId,
      actor: auditActor,
      snapshot: snap1,
      isCreate: true,
      force: true,
    });
    assert.equal(rev1.created, true);
    await recordRecipeSaveAudit({
      actor: auditActor,
      isCreate: true,
      recipeId,
      title: created.title,
      slug: slug1,
      previousSlug: null,
      oldStatus: null,
      newStatus: "draft",
      changedFields: ["created"],
    });

    assert.ok(recipeId);
    const createdAudit = await db.adminAuditEvent.findFirst({
      where: { entityId: recipeId, action: "recipe.created" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(createdAudit);
    assert.equal(createdAudit.entityId, recipeId);
    assert.equal(createdAudit.adminId, null); // env actor

    // Content save
    const nextValues = publishableValues({
      intro: "Crisp crust, open crumb.",
      ingredients: [
        {
          name: "Dough",
          items: [
            { item: "flour", amount: "500g", notes: "" },
            { item: "water", amount: "350g", notes: "" },
          ],
        },
      ],
    });
    await db.recipe.update({
      where: { id: recipeId },
      data: {
        excerpt: "A test baguette for Phase 1F.",
        values: JSON.stringify(nextValues),
      },
    });
    const snap2 = buildRecipeRevisionSnapshot({
      title: "Test French Baguette",
      excerpt: "A test baguette for Phase 1F.",
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [categoryId],
      values: nextValues,
      slug: slug1,
      status: "draft",
      publishedAt: null,
    });
    assert.notEqual(hashRecipeRevisionSnapshot(snap1), hashRecipeRevisionSnapshot(snap2));
    const rev2 = await createRecipeRevisionIfChanged(db, {
      recipeId,
      actor: auditActor,
      snapshot: snap2,
      previousSnapshot: snap1,
      oldStatus: "draft",
      newStatus: "draft",
    });
    assert.equal(rev2.created, true);
    if (rev2.created) firstContentRevisionId = rev2.id;
    await recordRecipeSaveAudit({
      actor: auditActor,
      isCreate: false,
      recipeId,
      title: "Test French Baguette",
      slug: slug1,
      previousSlug: slug1,
      oldStatus: "draft",
      newStatus: "draft",
      changedFields: ["excerpt", "ingredients", "learn"],
    });

    // No-op save — same content
    const revNoop = await createRecipeRevisionIfChanged(db, {
      recipeId,
      actor: auditActor,
      snapshot: snap2,
      previousSnapshot: snap2,
    });
    assert.equal(revNoop.created, false);
    assert.equal(revNoop.reason, "duplicate");

    const afterNoop = await listRecipeRevisions(recipeId);
    assert.ok(afterNoop.length >= 2);
    assert.equal(
      afterNoop.filter((r) => r.contentHash === hashRecipeRevisionSnapshot(snap2)).length,
      1,
    );

    // Publish readiness failure (missing required imageAlt via empty values)
    const badValues = { ...nextValues, imageAlt: "" };
    const blocked = getRecipePublishingReadiness({
      title: "Test French Baguette",
      slug: slug1,
      excerpt: "A test baguette for Phase 1F.",
      typeId,
      fields: requiredFields,
      values: badValues,
      categoryIds: [categoryId],
    });
    assert.equal(blocked.status, "not_ready");
    // Do not publish / do not create published audit
    const stillDraft = await db.recipe.findUnique({ where: { id: recipeId } });
    assert.equal(stillDraft?.status, "draft");

    // Restore required data; leave YouTube missing → recommendations OK
    const readyValues = publishableValues({
      intro: "Crisp crust, open crumb.",
      ingredients: nextValues.ingredients,
    });
    const ready = getRecipePublishingReadiness({
      title: "Test French Baguette",
      slug: slug1,
      excerpt: "A test baguette for Phase 1F.",
      typeId,
      fields: requiredFields,
      values: readyValues,
      categoryIds: [categoryId],
    });
    assert.ok(ready.status === "ready" || ready.status === "ready_with_recommendations");
    assert.ok(ready.recommended.some((c) => c.id === "recipe.youtube" && !c.passed));

    // Publish (content unchanged from snap2 aside from ensuring required fields)
    await db.recipe.update({
      where: { id: recipeId },
      data: {
        status: "published",
        publishedAt: new Date(),
        values: JSON.stringify(readyValues),
        excerpt: "A test baguette for Phase 1F.",
      },
    });
    const snapPublished = buildRecipeRevisionSnapshot({
      title: "Test French Baguette",
      excerpt: "A test baguette for Phase 1F.",
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [categoryId],
      values: readyValues,
      slug: slug1,
      status: "published",
      publishedAt: new Date(),
    });
    // Publish-only / content-equivalent — may or may not create revision by hash
    const revPublish = await createRecipeRevisionIfChanged(db, {
      recipeId,
      actor: auditActor,
      snapshot: snapPublished,
      previousSnapshot: snap2,
      oldStatus: "draft",
      newStatus: "published",
    });
    // Hash excludes status — duplicate expected when content same
    assert.equal(revPublish.created, false);

    await recordRecipeSaveAudit({
      actor: auditActor,
      isCreate: false,
      recipeId,
      title: "Test French Baguette",
      slug: slug1,
      previousSlug: slug1,
      oldStatus: "draft",
      newStatus: "published",
      changedFields: ["status"],
    });
    const publishedAudit = await db.adminAuditEvent.findFirst({
      where: { entityId: recipeId, action: "recipe.published" },
    });
    assert.ok(publishedAudit);
    assert.doesNotMatch(publishedAudit.metadata || "", /"values"\s*:/);
  });

  it("5–6 favorite and review bind to Recipe.id", async () => {
    await db.recipeSave.create({
      data: {
        userId,
        recipeId,
        slug: slug1,
        title: "Test French Baguette",
      },
    });
    const saves = await db.recipeSave.findMany({ where: { userId, recipeId } });
    assert.equal(saves.length, 1);
    assert.equal(saves[0]?.recipeId, recipeId);

    await db.recipeReview.create({
      data: {
        recipeId,
        recipeSlug: slug1,
        userId,
        authorName: "Lifecycle Member",
        authorEmail: `member-${suffix}@example.com`,
        rating: 5,
        body: "Excellent test loaf.",
      },
    });
    const reviews = await db.recipeReview.findMany({ where: { recipeId } });
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0]?.recipeId, recipeId);
    assert.equal(reviews[0]?.rating, 5);
  });

  it("7 video/timestamp helper still resolves stage Watch links", () => {
    const stages = [
      {
        id: "stage-0",
        name: "Incorporation & Stretch-and-Fold Rounds",
        steps: [{ globalIndex: 0, text: "Fold" }],
      },
    ];
    const help = selectStageVideoHelp(stages, [
      { label: "Stretch and fold technique", time: 82 },
    ]);
    assert.ok(help["stage-0"]);
    assert.match(help["stage-0"]!.linkLabel, /Watch/i);
  });

  it("8–9 published slug changes flatten redirects and preserve community data", async () => {
    const publishedAt = (await db.recipe.findUnique({ where: { id: recipeId } }))!.publishedAt;

    // First rename
    await db.recipe.update({
      where: { id: recipeId },
      data: { slug: slug2, title: "Test French Baguette" },
    });
    const r1 = await upsertRecipeSlugChangeRedirect({
      previousSlug: slug1,
      nextSlug: slug2,
      wasPublished: true,
    });
    assert.ok(r1 && r1.ok);
    await syncDenormalizedRecipeIdentity({
      recipeId,
      slug: slug2,
      title: "Test French Baguette",
    });
    await recordAdminAuditEvent({
      actor: auditActor,
      action: "recipe.slug_changed",
      area: "content",
      entityType: "recipe",
      entityId: recipeId,
      entityLabel: "Test French Baguette",
      metadata: { oldSlug: slug1, newSlug: slug2, redirectCreated: true },
    });

    assert.equal(await resolveActiveRedirect(recipePublicPath(slug1)), recipePublicPath(slug2));

    // Second rename — flattening
    await db.recipe.update({ where: { id: recipeId }, data: { slug: slug3 } });
    const r2 = await upsertRecipeSlugChangeRedirect({
      previousSlug: slug2,
      nextSlug: slug3,
      wasPublished: true,
    });
    assert.ok(r2 && r2.ok);
    await syncDenormalizedRecipeIdentity({
      recipeId,
      slug: slug3,
      title: "Test French Baguette",
    });

    assert.equal(await resolveActiveRedirect(recipePublicPath(slug1)), recipePublicPath(slug3));
    assert.equal(await resolveActiveRedirect(recipePublicPath(slug2)), recipePublicPath(slug3));

    // Flattened: first hop should point directly at final (not intermediate)
    const first = await db.redirect.findUnique({
      where: { fromPath: recipePublicPath(slug1) },
    });
    assert.equal(first?.toPath, recipePublicPath(slug3));
    assert.equal(first?.isActive, true);

    const save = await db.recipeSave.findFirst({ where: { userId, recipeId } });
    assert.equal(save?.slug, slug3);
    assert.equal(save?.recipeId, recipeId);

    const review = await db.recipeReview.findFirst({ where: { recipeId } });
    assert.equal(review?.recipeSlug, slug3);
    assert.equal(review?.rating, 5);

    const sameId = await db.recipe.findUnique({ where: { id: recipeId } });
    assert.equal(sameId?.id, recipeId);
    assert.equal(sameId?.publishedAt?.toISOString(), publishedAt?.toISOString());

    // Slug-only change should not create content revision
    const beforeCount = (await listRecipeRevisions(recipeId)).length;
    const snapSlug = buildRecipeRevisionSnapshot({
      title: "Test French Baguette",
      excerpt: "A test baguette for Phase 1F.",
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [categoryId],
      values: publishableValues({
        intro: "Crisp crust, open crumb.",
        ingredients: [
          {
            name: "Dough",
            items: [
              { item: "flour", amount: "500g", notes: "" },
              { item: "water", amount: "350g", notes: "" },
            ],
          },
        ],
      }),
      slug: slug3,
      status: "published",
      publishedAt,
    });
    const revSlug = await createRecipeRevisionIfChanged(db, {
      recipeId,
      actor: auditActor,
      snapshot: snapSlug,
    });
    assert.equal(revSlug.created, false);
    assert.equal((await listRecipeRevisions(recipeId)).length, beforeCount);

    const slugAudit = await db.adminAuditEvent.findFirst({
      where: { entityId: recipeId, action: "recipe.slug_changed" },
    });
    assert.ok(slugAudit);
    assert.equal(slugAudit.entityId, recipeId);
  });

  it("10–11 restore preserves URL/status; readiness recalculates", async () => {
    const before = await db.recipe.findUnique({ where: { id: recipeId } });
    assert.ok(before);

    // Change content so restore is meaningful
    await db.recipe.update({
      where: { id: recipeId },
      data: {
        title: "Changed After Rename",
        values: JSON.stringify(publishableValues({ intro: "Changed intro after rename." })),
      },
    });
    const currentSnap = buildRecipeRevisionSnapshot({
      title: "Changed After Rename",
      excerpt: before!.excerpt,
      featured: false,
      seasonal: false,
      typeId,
      categoryIds: [categoryId],
      values: publishableValues({ intro: "Changed intro after rename." }),
      slug: slug3,
      status: "published",
      publishedAt: before!.publishedAt,
    });
    await createRecipeRevisionIfChanged(db, {
      recipeId,
      actor: auditActor,
      snapshot: currentSnap,
      force: true,
    });

    assert.ok(firstContentRevisionId);
    const restored = await restoreRecipeRevisionContent({
      recipeId,
      revisionId: firstContentRevisionId,
      actor: auditActor,
    });
    assert.equal(restored.ok, true);

    const after = await db.recipe.findUnique({ where: { id: recipeId } });
    assert.equal(after?.id, recipeId);
    assert.equal(after?.slug, slug3); // preserved
    assert.equal(after?.status, "published"); // preserved
    assert.equal(after?.publishedAt?.toISOString(), before!.publishedAt?.toISOString());
    assert.notEqual(after?.title, "Changed After Rename"); // content restored

    const save = await db.recipeSave.findFirst({ where: { recipeId } });
    const review = await db.recipeReview.findFirst({ where: { recipeId } });
    assert.equal(save?.recipeId, recipeId);
    assert.equal(review?.recipeId, recipeId);

    await recordAdminAuditEvent({
      actor: auditActor,
      action: "recipe.restored",
      area: "content",
      entityType: "recipe",
      entityId: recipeId,
      entityLabel: after!.title,
      metadata: { restoredFromRevisionId: firstContentRevisionId },
    });
    const restoreAudit = await db.adminAuditEvent.findFirst({
      where: { entityId: recipeId, action: "recipe.restored" },
    });
    assert.ok(restoreAudit);
    assert.doesNotMatch(restoreAudit.metadata, /instructionStages|"values"\s*:\s*\{/);

    const revisions = await listRecipeRevisions(recipeId);
    assert.ok(revisions.some((r) => r.reason === "restored"));
    assert.ok(revisions.some((r) => r.id === firstContentRevisionId));

    const readiness = getRecipePublishingReadiness({
      title: after!.title,
      slug: after!.slug,
      excerpt: after!.excerpt,
      typeId,
      fields: requiredFields,
      values: JSON.parse(after!.values || "{}"),
      categoryIds: [categoryId],
    });
    // Restored content should still be publishable (or recommendations only)
    assert.notEqual(readiness.status, "not_ready");

    // Case B: published recipe becomes NOT READY without unpublishing
    await db.recipe.update({
      where: { id: recipeId },
      data: {
        values: JSON.stringify(publishableValues({ imageAlt: "", intro: after!.title })),
      },
    });
    const broken = await db.recipe.findUnique({ where: { id: recipeId } });
    const brokenReady = getRecipePublishingReadiness({
      title: broken!.title,
      slug: broken!.slug,
      excerpt: broken!.excerpt,
      typeId,
      fields: requiredFields,
      values: JSON.parse(broken!.values || "{}"),
      categoryIds: [categoryId],
    });
    assert.equal(brokenReady.status, "not_ready");
    assert.equal(broken!.status, "published"); // not auto-unpublished
  });

  it("12 move to draft then republish", async () => {
    await db.recipe.update({
      where: { id: recipeId },
      data: {
        status: "draft",
        publishedAt: null,
        values: JSON.stringify(publishableValues()),
      },
    });
    await recordRecipeSaveAudit({
      actor: auditActor,
      isCreate: false,
      recipeId,
      title: "Test French Baguette",
      slug: slug3,
      previousSlug: slug3,
      oldStatus: "published",
      newStatus: "draft",
      changedFields: ["status"],
    });
    const draftAudit = await db.adminAuditEvent.findFirst({
      where: { entityId: recipeId, action: "recipe.moved_to_draft" },
    });
    assert.ok(draftAudit);

    const ready = getRecipePublishingReadiness({
      title: "Test French Baguette",
      slug: slug3,
      excerpt: "A test baguette for Phase 1F.",
      typeId,
      fields: requiredFields,
      values: publishableValues(),
      categoryIds: [categoryId],
    });
    assert.ok(ready.status !== "not_ready");
    await db.recipe.update({
      where: { id: recipeId },
      data: { status: "published", publishedAt: new Date() },
    });
  });

  it("13 delete preserves revision/audit/save/review via SetNull", async () => {
    deletedStableId = recipeId;
    const stable = recipeId;
    await db.recipe.delete({ where: { id: recipeId } });
    recipeId = ""; // prevent double-delete in after()

    const revisions = await db.recipeRevision.findMany({ where: { stableRecipeId: stable } });
    assert.ok(revisions.length > 0);
    assert.ok(revisions.every((r) => r.recipeId === null));

    const audits = await db.adminAuditEvent.findMany({ where: { entityId: stable } });
    assert.ok(audits.length > 0);

    const saves = await db.recipeSave.findMany({ where: { userId } });
    assert.ok(saves.some((s) => s.recipeId === null));

    const reviews = await db.recipeReview.findMany({
      where: { authorEmail: `member-${suffix}@example.com` },
    });
    assert.ok(reviews.some((r) => r.recipeId === null));
  });
});

describe("Phase 1F architecture wiring guards", () => {
  it("keeps authorization boundaries for Activity / history / content", () => {
    assert.equal(canViewAdminActivity("owner"), true);
    assert.equal(canViewAdminActivity("editor"), false);
    assert.equal(canViewAdminActivity("members"), false);
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("editor", "staff"), false);
    assert.equal(canAccess("members", "content"), false);

    const activity = readSrc("app/admin/(app)/activity/page.tsx");
    assert.match(activity, /canViewAdminActivity/);
    assert.match(activity, /requireAccess\("staff"\)/);
    const history = readSrc("app/admin/(app)/recipes/[id]/history/page.tsx");
    assert.match(history, /requireAccess\("content"\)/);
    const actions = readSrc("app/admin/actions.ts");
    assert.match(actions, /restoreRecipeRevisionAction/);
    assert.match(actions, /getRecipePublishingReadiness/);
    assert.match(actions, /status === "published"/);
  });

  it("public recipe page does not load revisions or audit", () => {
    const page = readSrc("app/recipes/[slug]/page.tsx");
    const detail = readSrc("components/recipe/RecipeDetailView.tsx");
    const presentation = readSrc("lib/recipe-detail-presentation.ts");
    assert.doesNotMatch(page, /RecipeRevision|listRecipeRevisions|AdminAuditEvent|getRecipePublishingReadiness/);
    assert.doesNotMatch(detail, /RecipeRevision|listRecipeRevisions|AdminAuditEvent|getRecipePublishingReadiness/);
    assert.doesNotMatch(presentation, /RecipeRevision|listRecipeRevisions|AdminAuditEvent|getRecipePublishingReadiness/);
    assert.match(page, /resolveActiveRedirect/);
    assert.match(presentation, /selectStageVideoHelp/);
    assert.match(detail, /RecipeWatchMethod|RecipeVideoExperience/);
  });

  it("saveRecipeAction is the only admin publish path and is readiness-gated", () => {
    const actions = readSrc("app/admin/actions.ts");
    assert.match(actions, /getRecipePublishingReadiness/);
    assert.match(actions, /error=publish-readiness/);
    const createYt = readSrc("lib/youtube-data/create-recipe-from-video.ts");
    assert.match(createYt, /status:\s*"draft"/);
    assert.doesNotMatch(createYt, /status:\s*"published"/);
  });

  it("baseline CLI remains explicit and idempotent entrypoint", async () => {
    const pkg = readFileSync(path.join(root, "../..", "package.json"), "utf8");
    assert.match(pkg, /db:backfill-recipe-revisions/);
    assert.match(pkg, /db:backfill-recipe-identity/);
    // Smoke: format path exists; full backfill already covered elsewhere.
    assert.equal(typeof backfillRecipeRevisionBaselines, "function");
  });
});
