/**
 * Phase 9B — Recipe Q&A domain + persistence foundation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { isRecipeQaEnabled } from "./flags.ts";
import { deleteMemberAccount, FORMER_MEMBER_DISPLAY_NAME } from "./member-account-deletion.ts";
import {
  RECIPE_QUESTION_ANSWER_MAX,
  RECIPE_QUESTION_BODY_MAX,
  RECIPE_QUESTION_BODY_MIN,
  RECIPE_QUESTION_FORMER_MEMBER_AUTHOR_NAME,
  RECIPE_QUESTION_PUBLIC_LIST_DEFAULT_LIMIT,
  RECIPE_QUESTION_PUBLIC_LIST_MAX_LIMIT,
  RECIPE_QUESTION_STATUSES,
  buildRecipeQuestionAnsweredDedupeKey,
  clampRecipeQuestionPublicLimit,
  isPubliclyVisibleRecipeQuestion,
  isRecipeQuestionStatus,
} from "./recipe-questions.ts";
import {
  cleanupRecipeQuestionsForUserDeletion,
  countPendingRecipeQuestions,
  createRecipeQuestionForUser,
  deletePendingRecipeQuestionForUser,
  getRecipeQuestionForAdmin,
  hideRecipeQuestion,
  listPublishedRecipeQuestions,
  listRecipeQuestionsForAdmin,
  listRecipeQuestionsForUser,
  publishRecipeQuestion,
  rejectRecipeQuestion,
  setRecipeQuestionAnswer,
  updatePendingRecipeQuestionForUser,
} from "./recipe-questions-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromRepo: string) {
  return readFileSync(path.join(root, "..", "..", relFromRepo), "utf8");
}

describe("Phase 9B — feature gate", () => {
  it("RECIPE_QA_ENABLED exact lowercase true only", () => {
    const prev = process.env.RECIPE_QA_ENABLED;
    try {
      delete process.env.RECIPE_QA_ENABLED;
      assert.equal(isRecipeQaEnabled(), false);
      process.env.RECIPE_QA_ENABLED = "false";
      assert.equal(isRecipeQaEnabled(), false);
      process.env.RECIPE_QA_ENABLED = "TRUE";
      assert.equal(isRecipeQaEnabled(), false);
      process.env.RECIPE_QA_ENABLED = "True";
      assert.equal(isRecipeQaEnabled(), false);
      process.env.RECIPE_QA_ENABLED = "1";
      assert.equal(isRecipeQaEnabled(), false);
      process.env.RECIPE_QA_ENABLED = "yes";
      assert.equal(isRecipeQaEnabled(), false);
      process.env.RECIPE_QA_ENABLED = "true";
      assert.equal(isRecipeQaEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.RECIPE_QA_ENABLED;
      else process.env.RECIPE_QA_ENABLED = prev;
    }
  });

  it("no NEXT_PUBLIC mirror in flags", () => {
    const flags = readRepo("src/lib/flags.ts");
    assert.match(flags, /RECIPE_QA_ENABLED === "true"/);
    assert.doesNotMatch(flags, /NEXT_PUBLIC_RECIPE_QA/);
  });
});

describe("Phase 9B — domain constants", () => {
  it("status source of truth + public visibility", () => {
    assert.deepEqual([...RECIPE_QUESTION_STATUSES], [
      "pending",
      "published",
      "hidden",
      "rejected",
    ]);
    assert.equal(isRecipeQuestionStatus("pending"), true);
    assert.equal(isRecipeQuestionStatus("Published"), false);
    assert.equal(
      isPubliclyVisibleRecipeQuestion({ status: "published", answerBody: "Yes" }),
      true,
    );
    assert.equal(
      isPubliclyVisibleRecipeQuestion({ status: "published", answerBody: null }),
      false,
    );
    assert.equal(
      isPubliclyVisibleRecipeQuestion({ status: "published", answerBody: "  " }),
      false,
    );
    assert.equal(
      isPubliclyVisibleRecipeQuestion({ status: "pending", answerBody: "Yes" }),
      false,
    );
  });

  it("public limit clamp + future dedupe key only", () => {
    assert.equal(clampRecipeQuestionPublicLimit(), RECIPE_QUESTION_PUBLIC_LIST_DEFAULT_LIMIT);
    assert.equal(clampRecipeQuestionPublicLimit(999), RECIPE_QUESTION_PUBLIC_LIST_MAX_LIMIT);
    assert.equal(
      buildRecipeQuestionAnsweredDedupeKey("q1"),
      "recipe_question.answered:q1",
    );
    assert.equal(
      RECIPE_QUESTION_FORMER_MEMBER_AUTHOR_NAME,
      FORMER_MEMBER_DISPLAY_NAME,
    );
  });

  it("migration SQL is additive only", () => {
    const sql = readRepo(
      "prisma/migrations/20260916120000_recipe_qa_foundation/migration.sql",
    );
    assert.match(sql, /CREATE TABLE "RecipeQuestion"/);
    assert.match(sql, /ADD COLUMN "recipeQuestionId"/);
    assert.match(sql, /RecipeQuestion_recipeId_status_answeredAt_idx/);
    assert.match(sql, /RecipeQuestion_status_createdAt_idx/);
    assert.match(sql, /RecipeQuestion_userId_createdAt_idx/);
    assert.match(sql, /MemberNotification_recipeQuestionId_idx/);
    assert.match(sql, /ON DELETE CASCADE/);
    assert.match(sql, /ON DELETE SET NULL/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/);
    assert.doesNotMatch(sql, /\bDROP COLUMN\b/);
    assert.doesNotMatch(sql, /\bUPDATE\s+"/i);
    assert.doesNotMatch(sql, /\bINSERT\b/);
  });

  it("schema declares models, indexes, and delete semantics", () => {
    const schema = readRepo("prisma/schema.prisma");
    assert.match(schema, /model RecipeQuestion/);
    assert.match(
      schema,
      /recipe\s+Recipe\s+@relation\(fields: \[recipeId\], references: \[id\], onDelete: Cascade\)/,
    );
    assert.match(
      schema,
      /user\s+User\?\s+@relation\(fields: \[userId\], references: \[id\], onDelete: SetNull\)/,
    );
    assert.match(
      schema,
      /answeredByAdmin\s+Admin\?\s+@relation\(fields: \[answeredByAdminId\], references: \[id\], onDelete: SetNull\)/,
    );
    assert.match(
      schema,
      /recipeQuestion\s+RecipeQuestion\?\s+@relation\(fields: \[recipeQuestionId\], references: \[id\], onDelete: SetNull\)/,
    );
    assert.match(schema, /@@index\(\[recipeId, status, answeredAt\]\)/);
    assert.match(schema, /@@index\(\[status, createdAt\]\)/);
    assert.match(schema, /@@index\(\[userId, createdAt\]\)/);
    assert.match(schema, /@@index\(\[recipeQuestionId\]\)/);
  });

  it("Admin delete paths wire Q&A cleanup; no UI/notification generation", () => {
    const actions = readRepo("src/app/admin/actions.ts");
    assert.match(actions, /cleanupRecipeQuestionsForUserDeletion/);
    const deletion = readRepo("src/lib/member-account-deletion.ts");
    assert.match(deletion, /cleanupRecipeQuestionsForUserDeletion/);
    const server = readRepo("src/lib/recipe-questions-server.ts");
    assert.doesNotMatch(server, /recordAdminAuditEvent/);
    assert.doesNotMatch(server, /revalidatePath\(/);
    assert.doesNotMatch(server, /createRecipeFollowedPublishNotification/);
    assert.doesNotMatch(server, /MemberNotification\.create|memberNotification\.create/);
  });
});

describe("Phase 9B — persistence / ownership / admin / reads / lifecycle", () => {
  const db = new PrismaClient();
  const suffix = `r9b-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let adminA = "";
  let adminB = "";
  let recipePubId = "";
  let recipeDraftId = "";

  before(async () => {
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;

    const [a, b] = await Promise.all([
      db.user.create({
        data: { email: `a-${suffix}@example.com`, name: "QA Member A" },
      }),
      db.user.create({
        data: { email: `b-${suffix}@example.com`, name: "QA Member B" },
      }),
    ]);
    userA = a.id;
    userB = b.id;

    const [staffA, staffB] = await Promise.all([
      db.admin.create({
        data: {
          email: `admin-a-${suffix}@example.com`,
          name: "Staff A",
          passwordHash: "x",
          role: "editor",
        },
      }),
      db.admin.create({
        data: {
          email: `admin-b-${suffix}@example.com`,
          name: "Staff B",
          passwordHash: "x",
          role: "editor",
        },
      }),
    ]);
    adminA = staffA.id;
    adminB = staffB.id;

    const [pub, draft] = await Promise.all([
      db.recipe.create({
        data: {
          slug: `pub-${suffix}`,
          title: `Published Recipe ${suffix}`,
          status: "published",
          typeId,
          values: "{}",
        },
      }),
      db.recipe.create({
        data: {
          slug: `draft-${suffix}`,
          title: `Draft Recipe ${suffix}`,
          status: "draft",
          typeId,
          values: "{}",
        },
      }),
    ]);
    recipePubId = pub.id;
    recipeDraftId = draft.id;
  });

  after(async () => {
    await db.memberNotification.deleteMany({
      where: { user: { email: { contains: suffix } } },
    });
    await db.recipeQuestion.deleteMany({
      where: { recipe: { slug: { contains: suffix } } },
    });
    await db.recipe.deleteMany({ where: { slug: { contains: suffix } } });
    await db.user.deleteMany({ where: { email: { contains: suffix } } });
    await db.admin.deleteMany({ where: { email: { contains: suffix } } });
    await db.recipeType.deleteMany({ where: { slug: { contains: suffix } } });
    await db.$disconnect();
  });

  it("create: published ok; draft/missing rejected; validation + sanitize", async () => {
    const ok = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "  A  ",
      body: "How do I substitute yogurt?",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.data.status, "pending");
    assert.equal(ok.data.authorName, "A");

    const draft = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipeDraftId,
      authorName: "A",
      body: "Can I ask on a draft recipe?",
    });
    assert.equal(draft.ok, false);
    if (draft.ok) return;
    assert.equal(draft.error, "RECIPE_NOT_PUBLISHED");

    const missing = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: "missing-recipe-id",
      authorName: "A",
      body: "Where did this recipe go?",
    });
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.error, "NOT_FOUND");

    const tooShort = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "x".repeat(RECIPE_QUESTION_BODY_MIN - 1),
    });
    assert.equal(tooShort.ok, false);

    const minOk = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "x".repeat(RECIPE_QUESTION_BODY_MIN),
    });
    assert.equal(minOk.ok, true);

    const maxOk = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "y".repeat(RECIPE_QUESTION_BODY_MAX),
    });
    assert.equal(maxOk.ok, true);

    const overMax = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "z".repeat(RECIPE_QUESTION_BODY_MAX + 1),
    });
    // sanitize truncates to max, so over-max still valid length after sanitize
    assert.equal(overMax.ok, true);

    const whitespace = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "   \n\t   ",
    });
    assert.equal(whitespace.ok, false);

    const unicode = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "Café 🌮",
      body: "Can I use ½ cup of crème fraîche instead?",
    });
    assert.equal(unicode.ok, true);
    if (unicode.ok) {
      assert.match(unicode.data.body, /crème/);
      assert.match(unicode.data.authorName, /Café/);
    }

    const htmlish = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "<b>Hack</b>",
      body: "Is <script>alert(1)</script> stripped as plain text ok?",
    });
    assert.equal(htmlish.ok, true);
    if (htmlish.ok) {
      // Plain-text sanitize keeps characters; no HTML engine / no auto-link.
      assert.match(htmlish.data.body, /script/);
      assert.match(htmlish.data.authorName, /Hack/);
    }

    const emptyName = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "   ",
      body: "What is a good make-ahead strategy here?",
    });
    assert.equal(emptyName.ok, true);
    if (emptyName.ok) assert.equal(emptyName.data.authorName, "Mesa member");

    const before = await db.memberNotification.count({ where: { userId: userA } });
    assert.equal(before, 0);
  });

  it("ownership: edit/delete pending only; cross-user NOT_FOUND", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Ownership pending question body?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const qid = created.data.id;

    const edited = await updatePendingRecipeQuestionForUser({
      userId: userA,
      questionId: qid,
      body: "Updated ownership pending question?",
    });
    assert.equal(edited.ok, true);

    const crossEdit = await updatePendingRecipeQuestionForUser({
      userId: userB,
      questionId: qid,
      body: "Stolen edit attempt here!!",
    });
    assert.equal(crossEdit.ok, false);
    if (!crossEdit.ok) assert.equal(crossEdit.error, "NOT_FOUND");

    const crossDelete = await deletePendingRecipeQuestionForUser({
      userId: userB,
      questionId: qid,
    });
    assert.equal(crossDelete.ok, false);
    if (!crossDelete.ok) assert.equal(crossDelete.error, "NOT_FOUND");

    await setRecipeQuestionAnswer({
      questionId: qid,
      adminId: adminA,
      answerBody: "Yes — chill overnight before baking.",
    });
    await publishRecipeQuestion({ questionId: qid });

    const editPublished = await updatePendingRecipeQuestionForUser({
      userId: userA,
      questionId: qid,
      body: "Trying to edit published question!",
    });
    assert.equal(editPublished.ok, false);
    if (!editPublished.ok) assert.equal(editPublished.error, "NOT_EDITABLE");

    const deletePublished = await deletePendingRecipeQuestionForUser({
      userId: userA,
      questionId: qid,
    });
    assert.equal(deletePublished.ok, false);
    if (!deletePublished.ok) assert.equal(deletePublished.error, "NOT_DELETABLE");

    const pending = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Delete me while still pending please?",
    });
    assert.equal(pending.ok, true);
    if (!pending.ok) return;
    const del = await deletePendingRecipeQuestionForUser({
      userId: userA,
      questionId: pending.data.id,
    });
    assert.equal(del.ok, true);
    assert.equal(
      await db.recipeQuestion.findUnique({ where: { id: pending.data.id } }),
      null,
    );

    const rejected = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "This will be rejected for testing!!",
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    await rejectRecipeQuestion({ questionId: rejected.data.id });
    const editRejected = await updatePendingRecipeQuestionForUser({
      userId: userA,
      questionId: rejected.data.id,
      body: "Cannot edit after reject status!!",
    });
    assert.equal(editRejected.ok, false);
    if (!editRejected.ok) assert.equal(editRejected.error, "NOT_EDITABLE");
  });

  it("admin answer/publish/hide/reject + timestamp semantics", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Admin flow question about scaling?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const qid = created.data.id;

    const publishNoAnswer = await publishRecipeQuestion({ questionId: qid });
    assert.equal(publishNoAnswer.ok, false);
    if (!publishNoAnswer.ok) assert.equal(publishNoAnswer.error, "ANSWER_REQUIRED");

    const answer = await setRecipeQuestionAnswer({
      questionId: qid,
      adminId: adminA,
      answerBody: "Scale linearly; keep bake time similar.",
    });
    assert.equal(answer.ok, true);
    if (!answer.ok) return;
    assert.equal(answer.data.wasFirstAnswer, true);
    const firstAnsweredAt = answer.data.answeredAt;

    await new Promise((r) => setTimeout(r, 20));

    const editAnswer = await setRecipeQuestionAnswer({
      questionId: qid,
      adminId: adminB,
      answerBody: "Scale by weight when possible for best results.",
    });
    assert.equal(editAnswer.ok, true);
    if (!editAnswer.ok) return;
    assert.equal(editAnswer.data.wasFirstAnswer, false);
    assert.equal(editAnswer.data.answeredAt.getTime(), firstAnsweredAt.getTime());
    assert.equal(editAnswer.data.answeredByAdminId, adminB);

    const published = await publishRecipeQuestion({ questionId: qid });
    assert.equal(published.ok, true);
    if (!published.ok) return;
    const firstPublishedAt = published.data.publishedAt;

    await new Promise((r) => setTimeout(r, 20));

    const hidden = await hideRecipeQuestion({ questionId: qid });
    assert.equal(hidden.ok, true);
    const afterHide = await db.recipeQuestion.findUnique({ where: { id: qid } });
    assert.equal(afterHide?.status, "hidden");
    assert.equal(afterHide?.publishedAt?.getTime(), firstPublishedAt.getTime());
    assert.equal(afterHide?.answeredAt?.getTime(), firstAnsweredAt.getTime());
    assert.ok(afterHide?.answerBody);

    const republished = await publishRecipeQuestion({ questionId: qid });
    assert.equal(republished.ok, true);
    if (!republished.ok) return;
    assert.equal(republished.data.publishedAt.getTime(), firstPublishedAt.getTime());

    const editWhilePublished = await setRecipeQuestionAnswer({
      questionId: qid,
      adminId: adminA,
      answerBody: "Edited while still published — no new notify later.",
    });
    assert.equal(editWhilePublished.ok, true);
    const afterEdit = await db.recipeQuestion.findUnique({ where: { id: qid } });
    assert.equal(afterEdit?.status, "published");
    assert.equal(afterEdit?.publishedAt?.getTime(), firstPublishedAt.getTime());
    assert.equal(afterEdit?.answeredAt?.getTime(), firstAnsweredAt.getTime());

    const rejectedQ = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Spam question that should be rejected!",
    });
    assert.equal(rejectedQ.ok, true);
    if (!rejectedQ.ok) return;
    await rejectRecipeQuestion({ questionId: rejectedQ.data.id });
    const answerRejected = await setRecipeQuestionAnswer({
      questionId: rejectedQ.data.id,
      adminId: adminA,
      answerBody: "Should not answer rejected questions.",
    });
    assert.equal(answerRejected.ok, false);
    if (!answerRejected.ok) assert.equal(answerRejected.error, "REJECTED_TERMINAL");
    const publishRejected = await publishRecipeQuestion({
      questionId: rejectedQ.data.id,
    });
    assert.equal(publishRejected.ok, false);
    if (!publishRejected.ok) assert.equal(publishRejected.error, "REJECTED_TERMINAL");

    const draftQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipeDraftId,
        userId: userA,
        authorName: "A",
        body: "Fixture on draft recipe for publish gate.",
        status: "pending",
        answerBody: "Official answer text present.",
        answeredAt: new Date(),
        answeredByAdminId: adminA,
      },
    });
    const publishDraftRecipe = await publishRecipeQuestion({ questionId: draftQ.id });
    assert.equal(publishDraftRecipe.ok, false);
    if (!publishDraftRecipe.ok) {
      assert.equal(publishDraftRecipe.error, "RECIPE_NOT_PUBLISHED");
    }

    const auditCount = await db.adminAuditEvent.count({
      where: { entityId: qid },
    });
    assert.equal(auditCount, 0);
    const notifCount = await db.memberNotification.count({
      where: { recipeQuestionId: qid },
    });
    assert.equal(notifCount, 0);

    const longAnswer = "a".repeat(RECIPE_QUESTION_ANSWER_MAX + 50);
    const capped = await setRecipeQuestionAnswer({
      questionId: qid,
      adminId: adminA,
      answerBody: longAnswer,
    });
    assert.equal(capped.ok, true);
    if (capped.ok) assert.equal(capped.data.answerBody.length, RECIPE_QUESTION_ANSWER_MAX);
  });

  it("public / profile / admin read models", async () => {
    const pending = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Pending should not appear publicly!!",
    });
    assert.equal(pending.ok, true);

    const older = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Older answered public question body?",
    });
    assert.equal(older.ok, true);
    if (!older.ok) return;
    await setRecipeQuestionAnswer({
      questionId: older.data.id,
      adminId: adminA,
      answerBody: "Older official answer.",
    });
    const olderPub = await publishRecipeQuestion({ questionId: older.data.id });
    assert.equal(olderPub.ok, true);
    await db.recipeQuestion.update({
      where: { id: older.data.id },
      data: { answeredAt: new Date("2020-01-01T00:00:00.000Z") },
    });

    const newer = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Newer answered public question body?",
    });
    assert.equal(newer.ok, true);
    if (!newer.ok) return;
    await setRecipeQuestionAnswer({
      questionId: newer.data.id,
      adminId: adminA,
      answerBody: "Newer official answer.",
    });
    const newerPub = await publishRecipeQuestion({ questionId: newer.data.id });
    assert.equal(newerPub.ok, true);
    await db.recipeQuestion.update({
      where: { id: newer.data.id },
      data: { answeredAt: new Date("2024-06-01T00:00:00.000Z") },
    });

    const corrupt = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: userA,
        authorName: "Corrupt",
        body: "Published without answer should be hidden.",
        status: "published",
        answerBody: null,
        publishedAt: new Date(),
      },
    });

    const hidden = await createRecipeQuestionForUser({
      userId: userA,
      recipeId: recipePubId,
      authorName: "A",
      body: "Hidden answered question should stay private?",
    });
    assert.equal(hidden.ok, true);
    if (!hidden.ok) return;
    await setRecipeQuestionAnswer({
      questionId: hidden.data.id,
      adminId: adminA,
      answerBody: "Hidden answer.",
    });
    await publishRecipeQuestion({ questionId: hidden.data.id });
    await hideRecipeQuestion({ questionId: hidden.data.id });

    const publicList = await listPublishedRecipeQuestions({
      recipeId: recipePubId,
      limit: 50,
    });
    const ids = publicList.map((q) => q.id);
    assert.ok(ids.includes(newer.data.id));
    assert.ok(ids.includes(older.data.id));
    assert.ok(!ids.includes(corrupt.id));
    assert.ok(!ids.includes(hidden.data.id));
    if (pending.ok) assert.ok(!ids.includes(pending.data.id));

    const newerIdx = ids.indexOf(newer.data.id);
    const olderIdx = ids.indexOf(older.data.id);
    assert.ok(newerIdx < olderIdx);

    for (const item of publicList) {
      assert.equal("userId" in item, false);
      assert.equal("answeredByAdminId" in item, false);
      assert.ok(item.answerBody.trim().length > 0);
    }

    const limited = await listPublishedRecipeQuestions({
      recipeId: recipePubId,
      limit: 1,
    });
    assert.equal(limited.length, 1);

    const profileA = await listRecipeQuestionsForUser({ userId: userA });
    const profileB = await listRecipeQuestionsForUser({ userId: userB });
    assert.ok(profileA.some((q) => q.id === newer.data.id));
    assert.ok(profileA.every((q) => q.recipeSlug && q.recipeTitle));
    assert.ok(!profileB.some((q) => q.recipeId === recipePubId && q.body.includes("Newer")));

    const adminPending = await listRecipeQuestionsForAdmin({ status: "pending" });
    assert.ok(adminPending.every((q) => q.status === "pending"));
    const detail = await getRecipeQuestionForAdmin(newer.data.id);
    assert.ok(detail);
    assert.equal(detail?.hasAnswer, true);
    assert.ok(detail?.memberEmail === null || typeof detail?.memberEmail === "string");

    const pendingCount = await countPendingRecipeQuestions();
    assert.ok(pendingCount >= 1);
  });

  it("user delete: publish retained/anonymized; non-public deleted (self-delete path)", async () => {
    const email = `del-${suffix}@example.com`;
    const user = await db.user.create({
      data: { email, name: "Delete QA User" },
    });

    const pubQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: user.id,
        authorName: "Delete QA User",
        body: "Published Q&A that should survive deletion.",
        status: "published",
        answerBody: "Keep this official answer.",
        answeredAt: new Date(),
        answeredByAdminId: adminA,
        publishedAt: new Date(),
      },
    });
    const pendingQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: user.id,
        authorName: "Delete QA User",
        body: "Pending should be removed on delete.",
        status: "pending",
      },
    });
    const hiddenQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: user.id,
        authorName: "Delete QA User",
        body: "Hidden should be removed on delete.",
        status: "hidden",
        answerBody: "Hidden answer",
        answeredAt: new Date(),
        publishedAt: new Date(),
      },
    });
    const rejectedQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: user.id,
        authorName: "Delete QA User",
        body: "Rejected should be removed on delete.",
        status: "rejected",
      },
    });

    const result = await deleteMemberAccount(email);
    assert.equal(result.ok, true);

    const kept = await db.recipeQuestion.findUnique({ where: { id: pubQ.id } });
    assert.ok(kept);
    assert.equal(kept?.userId, null);
    assert.equal(kept?.authorName, "Former member");
    assert.ok(!kept?.authorName.includes("@"));

    assert.equal(await db.recipeQuestion.findUnique({ where: { id: pendingQ.id } }), null);
    assert.equal(await db.recipeQuestion.findUnique({ where: { id: hiddenQ.id } }), null);
    assert.equal(await db.recipeQuestion.findUnique({ where: { id: rejectedQ.id } }), null);
  });

  it("admin-style delete cleanup helper anonymizes the same way", async () => {
    const user = await db.user.create({
      data: {
        email: `adel-${suffix}@example.com`,
        name: "Admin Delete QA",
      },
    });
    const pubQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: user.id,
        authorName: "Admin Delete QA",
        body: "Admin delete path published question.",
        status: "published",
        answerBody: "Answer stays.",
        answeredAt: new Date(),
        publishedAt: new Date(),
      },
    });
    const pendingQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: user.id,
        authorName: "Admin Delete QA",
        body: "Admin delete path pending question.",
        status: "pending",
      },
    });

    await db.$transaction(async (tx) => {
      await cleanupRecipeQuestionsForUserDeletion(tx, user.id);
      await tx.user.delete({ where: { id: user.id } });
    });

    const kept = await db.recipeQuestion.findUnique({ where: { id: pubQ.id } });
    assert.equal(kept?.userId, null);
    assert.equal(kept?.authorName, "Former member");
    assert.equal(await db.recipeQuestion.findUnique({ where: { id: pendingQ.id } }), null);
  });

  it("recipe delete cascades questions; notification FK SetNull", async () => {
    const recipe = await db.recipe.create({
      data: {
        slug: `cascade-${suffix}`,
        title: `Cascade Recipe ${suffix}`,
        status: "published",
        typeId,
        values: "{}",
      },
    });
    const q = await db.recipeQuestion.create({
      data: {
        recipeId: recipe.id,
        userId: userA,
        authorName: "A",
        body: "Will cascade when recipe is deleted.",
        status: "pending",
      },
    });
    const notif = await db.memberNotification.create({
      data: {
        userId: userA,
        type: "RECIPE_FOLLOWED_PUBLISH",
        recipeId: recipe.id,
        recipeQuestionId: q.id,
        dedupeKey: `fixture.qa_cascade:${q.id}`,
      },
    });

    await db.recipe.delete({ where: { id: recipe.id } });

    assert.equal(await db.recipeQuestion.findUnique({ where: { id: q.id } }), null);
    const keptNotif = await db.memberNotification.findUnique({ where: { id: notif.id } });
    assert.ok(keptNotif);
    assert.equal(keptNotif?.recipeQuestionId, null);
    assert.equal(keptNotif?.recipeId, null);
  });

  it("question delete SetNulls notification FK without dropping notification", async () => {
    const q = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: userA,
        authorName: "A",
        body: "Delete question; keep notification row.",
        status: "pending",
      },
    });
    const notif = await db.memberNotification.create({
      data: {
        userId: userA,
        type: "RECIPE_FOLLOWED_PUBLISH",
        recipeId: recipePubId,
        recipeQuestionId: q.id,
        dedupeKey: `fixture.qa_qdel:${q.id}`,
      },
    });

    await db.recipeQuestion.delete({ where: { id: q.id } });
    const kept = await db.memberNotification.findUnique({ where: { id: notif.id } });
    assert.ok(kept);
    assert.equal(kept?.recipeQuestionId, null);
    assert.equal(kept?.recipeId, recipePubId);
  });

  it("admin delete SetNulls answeredByAdminId; answer survives", async () => {
    const staff = await db.admin.create({
      data: {
        email: `doomed-${suffix}@example.com`,
        name: "Doomed Staff",
        passwordHash: "x",
        role: "editor",
      },
    });
    const q = await db.recipeQuestion.create({
      data: {
        recipeId: recipePubId,
        userId: userA,
        authorName: "A",
        body: "Answered by doomed staff member here.",
        status: "published",
        answerBody: "Official Mesa answer remains.",
        answeredAt: new Date(),
        answeredByAdminId: staff.id,
        publishedAt: new Date(),
      },
    });

    await db.admin.delete({ where: { id: staff.id } });
    const kept = await db.recipeQuestion.findUnique({ where: { id: q.id } });
    assert.ok(kept);
    assert.equal(kept?.answeredByAdminId, null);
    assert.equal(kept?.answerBody, "Official Mesa answer remains.");
    assert.equal(kept?.status, "published");
  });
});
