/**
 * Phase 9F — Recipe Q&A final hardening + certification contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import {
  MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
  MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED,
  buildRecipeFollowedPublishDedupeKey,
} from "./member-notifications.ts";
import {
  countUnreadMemberNotificationsForUser,
  createRecipeQuestionAnsweredNotification,
  listMemberNotificationsForUser,
} from "./member-notifications-server.ts";
import {
  buildRecipeQuestionAnsweredDedupeKey,
  isPubliclyVisibleRecipeQuestion,
} from "./recipe-questions.ts";
import {
  createRecipeQuestionForUser,
  deletePendingRecipeQuestionForUser,
  hideRecipeQuestion,
  listPublishedRecipeQuestions,
  listRecipeQuestionsForUser,
  publishRecipeQuestion,
  rejectRecipeQuestion,
  setRecipeQuestionAnswer,
  updatePendingRecipeQuestionForUser,
} from "./recipe-questions-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, "..", "..");

function readRepo(rel: string) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

describe("Phase 9F — contracts / privacy / runner", () => {
  it("unread count uses DB-side visibility predicates (no unbounded findMany)", () => {
    const server = readRepo("src/lib/member-notifications-server.ts");
    const fn = server.slice(
      server.indexOf("countUnreadMemberNotificationsForUser"),
      server.indexOf("markMemberNotificationReadForUser"),
    );
    assert.match(fn, /\.count\(/);
    assert.doesNotMatch(fn, /findMany/);
    assert.match(fn, /RECIPE_FOLLOWED_PUBLISH/);
    assert.match(fn, /RECIPE_QUESTION_ANSWERED/);
    assert.match(fn, /recipeQaEnabled/);
    assert.match(fn, /status:\s*"published"/);
  });

  it("notification list is one bounded query with includes (no N+1)", () => {
    const server = readRepo("src/lib/member-notifications-server.ts");
    const fn = server.slice(
      server.indexOf("listMemberNotificationsForUser"),
      server.indexOf("countUnreadMemberNotificationsForUser"),
    );
    assert.match(fn, /findMany/);
    assert.match(fn, /notificationListInclude|include:/);
    assert.match(fn, /take:/);
    assert.doesNotMatch(fn, /for\s*\([^)]*\)\s*\{[\s\S]*findUnique|for\s*\([^)]*\)\s*\{[\s\S]*findFirst/);
  });

  it("client never supplies ownership fields to #9 actions", () => {
    const memberAsk = readRepo("src/app/recipes/question-actions.ts");
    const memberProfile = readRepo("src/app/profile/question-actions.ts");
    const admin = readRepo("src/app/admin/question-actions.ts");
    assert.doesNotMatch(memberAsk, /userId:\s*input|authorName:\s*input/);
    assert.doesNotMatch(memberProfile, /userId:\s*input/);
    assert.doesNotMatch(admin, /adminId:\s*input|userId:\s*input/);
    assert.match(admin, /requireAccess\("content"\)/);
    assert.match(admin, /isRecipeQaEnabled\(\)/);
    assert.match(memberAsk, /isRecipeQaEnabled\(\)/);
    assert.match(memberProfile, /isRecipeQaEnabled\(\)/);
  });

  it("no FAQ/QAPage schema, email, analytics, or dangerouslySetInnerHTML in Q&A UI", () => {
    const schema = readRepo("src/lib/schema.ts");
    assert.doesNotMatch(schema, /FAQPage|QAPage/);
    for (const rel of [
      "src/components/recipe/RecipeQuestionsSection.tsx",
      "src/components/ProfileQuestionsView.tsx",
      "src/components/admin/AdminQuestionModerationForm.tsx",
    ]) {
      const src = readRepo(rel);
      assert.doesNotMatch(src, /dangerouslySetInnerHTML/);
      assert.doesNotMatch(src, /Resend|NewsletterSubscriber/);
    }
    const adminActions = readRepo("src/app/admin/question-actions.ts");
    assert.doesNotMatch(adminActions, /Resend|NewsletterSubscriber|EmailUpdatesPreference/);
    assert.doesNotMatch(adminActions, /recipe_question\.notified/);
  });

  it("migration remains additive-only and matches current model", () => {
    const sql = readRepo(
      "prisma/migrations/20260916120000_recipe_qa_foundation/migration.sql",
    );
    assert.match(sql, /CREATE TABLE "RecipeQuestion"/);
    assert.match(sql, /ADD COLUMN "recipeQuestionId"/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|UPDATE\s+"RecipeQuestion"/i);
    assert.doesNotMatch(sql, /^\s*INSERT INTO "RecipeQuestion"/im);
    assert.doesNotMatch(sql, /^\s*UPDATE\s+"/im);
    const schema = readRepo("prisma/schema.prisma");
    assert.match(schema, /model RecipeQuestion/);
    assert.match(schema, /recipeQuestionId\s+String\?/);
  });

  it("unit-test-files.json includes all tracked src/scripts test files", () => {
    const allow = JSON.parse(
      readRepo("scripts/unit-test-files.json"),
    ) as string[];
    const tracked = execSync("git ls-files", {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(
        (f) =>
          (f.startsWith("src/") || f.startsWith("scripts/")) &&
          /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f),
      )
      .sort();
    const allowSet = new Set(allow);
    const missing = tracked.filter((f) => !allowSet.has(f));
    assert.deepEqual(missing, [], `Missing from allowlist: ${missing.join(", ")}`);
    assert.ok(allow.includes("src/lib/recipe-questions-hardening.test.ts"));
    assert.ok(allow.includes("src/lib/members-admin.test.ts"));
    assert.ok(allow.includes("src/lib/series.test.ts"));
    assert.ok(allow.includes("src/lib/recipe-editor-navigation.test.ts"));
    assert.ok(allow.includes("src/lib/youtube-data/watch-next.test.ts"));
  });
});

describe("Phase 9F — lifecycle / isolation / matrices", () => {
  const db = new PrismaClient();
  const suffix = `r9f-${Date.now()}`;
  let typeId = "";
  let userA = "";
  let userB = "";
  let recipeId = "";
  let adminId = "";
  const prevGate = process.env.RECIPE_QA_ENABLED;

  before(async () => {
    process.env.RECIPE_QA_ENABLED = "true";
    const type = await db.recipeType.create({
      data: { slug: `type-${suffix}`, name: `Type ${suffix}` },
    });
    typeId = type.id;
    const [a, b, admin] = await Promise.all([
      db.user.create({
        data: { email: `a-${suffix}@example.com`, name: "Hard A" },
      }),
      db.user.create({
        data: { email: `b-${suffix}@example.com`, name: "Hard B" },
      }),
      db.admin.create({
        data: {
          email: `adm-${suffix}@example.com`,
          name: "Hard Admin",
          passwordHash: "x",
          role: "editor",
        },
      }),
    ]);
    userA = a.id;
    userB = b.id;
    adminId = admin.id;
    const recipe = await db.recipe.create({
      data: {
        slug: `hard-${suffix}`,
        title: `Hardening Pasta ${suffix}`,
        status: "published",
        typeId,
        values: JSON.stringify({ dishName: `Hardening Pasta ${suffix}` }),
      },
    });
    recipeId = recipe.id;
  });

  after(async () => {
    if (prevGate === undefined) delete process.env.RECIPE_QA_ENABLED;
    else process.env.RECIPE_QA_ENABLED = prevGate;
    await db.memberNotification.deleteMany({
      where: { userId: { in: [userA, userB] } },
    });
    await db.recipeQuestion.deleteMany({ where: { recipeId } });
    await db.recipe.deleteMany({ where: { id: recipeId } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.admin.deleteMany({ where: { id: adminId } });
    await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("E2E: draft lock → first publish notify → edit/hide/republish/dedupe", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userA,
      recipeId,
      authorName: "Hard A",
      body: "How spicy is this pasta when served family style?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const qid = created.data.id;

    assert.equal((await listPublishedRecipeQuestions({ recipeId })).length, 0);
    let profile = await listRecipeQuestionsForUser({ userId: userA });
    assert.equal(profile.find((q) => q.id === qid)?.answerBody, null);

    await setRecipeQuestionAnswer({
      questionId: qid,
      adminId,
      answerBody: "Mild heat — chili flakes are optional at the table.",
    });
    profile = await listRecipeQuestionsForUser({ userId: userA });
    assert.equal(profile.find((q) => q.id === qid)?.answerBody, null);
    const locked = await updatePendingRecipeQuestionForUser({
      userId: userA,
      questionId: qid,
      body: "Trying to rewrite under a drafted Mesa answer.",
    });
    assert.equal(locked.ok, false);
    if (!locked.ok) assert.equal(locked.error, "ANSWER_IN_PROGRESS");
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);

    const firstAnsweredAt = (
      await db.recipeQuestion.findUnique({
        where: { id: qid },
        select: { answeredAt: true },
      })
    )?.answeredAt;
    assert.ok(firstAnsweredAt);

    const pub = await publishRecipeQuestion({ questionId: qid });
    assert.equal(pub.ok, true);
    const notify = await createRecipeQuestionAnsweredNotification({
      userId: userA,
      questionId: qid,
      recipeId,
    });
    assert.equal(notify.outcome, "created");
    assert.equal(
      (
        await createRecipeQuestionAnsweredNotification({
          userId: userA,
          questionId: qid,
          recipeId,
        })
      ).outcome,
      "deduped",
    );

    assert.equal((await listPublishedRecipeQuestions({ recipeId })).length, 1);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);

    await setRecipeQuestionAnswer({
      questionId: qid,
      adminId,
      answerBody: "Mild heat — chili flakes optional; kids usually skip them.",
    });
    const afterEdit = await db.recipeQuestion.findUnique({
      where: { id: qid },
      select: { answeredAt: true, publishedAt: true },
    });
    assert.equal(afterEdit?.answeredAt?.getTime(), firstAnsweredAt.getTime());
    assert.equal(
      await db.memberNotification.count({
        where: {
          userId: userA,
          dedupeKey: buildRecipeQuestionAnsweredDedupeKey(qid),
        },
      }),
      1,
    );

    await hideRecipeQuestion({ questionId: qid });
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);
    assert.equal((await listMemberNotificationsForUser(userA)).length, 0);

    await publishRecipeQuestion({ questionId: qid });
    assert.equal(
      (
        await createRecipeQuestionAnsweredNotification({
          userId: userA,
          questionId: qid,
          recipeId,
        })
      ).outcome,
      "deduped",
    );
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);
    assert.equal(
      (await listMemberNotificationsForUser(userA)).filter(
        (n) => n.type === MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED,
      ).length,
      1,
    );
  });

  it("notification failure does not require publish rollback", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userA,
      recipeId,
      authorName: "Hard A",
      body: "Can leftovers keep overnight in the refrigerator safely?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await setRecipeQuestionAnswer({
      questionId: created.data.id,
      adminId,
      answerBody: "Yes — cool promptly and refrigerate within two hours.",
    });
    const pub = await publishRecipeQuestion({ questionId: created.data.id });
    assert.equal(pub.ok, true);

    // Simulate failed notification (no owner) after successful publish.
    const failed = await createRecipeQuestionAnsweredNotification({
      userId: null,
      questionId: created.data.id,
      recipeId,
    });
    assert.equal(failed.outcome, "skipped_no_owner");

    const row = await db.recipeQuestion.findUnique({
      where: { id: created.data.id },
      select: { status: true },
    });
    assert.equal(row?.status, "published");
    assert.ok(
      (await listPublishedRecipeQuestions({ recipeId })).some(
        (q) => q.id === created.data.id,
      ),
    );
  });

  it("public/profile visibility matrices + unknown notification type", async () => {
    const cases = [
      { status: "pending", answerBody: null as string | null, public: false },
      { status: "pending", answerBody: "Draft", public: false },
      { status: "published", answerBody: "Live answer text here.", public: true },
      { status: "published", answerBody: null, public: false },
      { status: "hidden", answerBody: "Was public", public: false },
      { status: "rejected", answerBody: "Nope", public: false },
    ];
    for (const c of cases) {
      assert.equal(
        isPubliclyVisibleRecipeQuestion({
          status: c.status,
          answerBody: c.answerBody,
        }),
        c.public,
      );
    }

    await db.memberNotification.create({
      data: {
        userId: userA,
        type: "UNKNOWN_FUTURE_TYPE",
        recipeId,
        dedupeKey: `unknown:${suffix}`,
      },
    });
    const list = await listMemberNotificationsForUser(userA);
    assert.ok(list.every((n) => n.type !== ("UNKNOWN_FUTURE_TYPE" as never)));
    // Unknown unread must not inflate count.
    const unread = await countUnreadMemberNotificationsForUser(userA);
    const visibleUnread = list.filter((n) => n.unread).length;
    assert.equal(unread, visibleUnread);
  });

  it("mixed #8 + Q&A unread count stays consistent with list", async () => {
    const followKey = buildRecipeFollowedPublishDedupeKey(`${recipeId}-extra`);
    // Reuse published recipe for follow-style notification.
    await db.memberNotification.create({
      data: {
        userId: userB,
        type: MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
        recipeId,
        dedupeKey: buildRecipeFollowedPublishDedupeKey(recipeId),
      },
    });

    const q = await createRecipeQuestionForUser({
      userId: userB,
      recipeId,
      authorName: "Hard B",
      body: "Does this freeze well after the sauce thickens fully?",
    });
    assert.equal(q.ok, true);
    if (!q.ok) return;
    await setRecipeQuestionAnswer({
      questionId: q.data.id,
      adminId,
      answerBody: "Yes — freeze in portions for up to two months.",
    });
    await publishRecipeQuestion({ questionId: q.data.id });
    await createRecipeQuestionAnsweredNotification({
      userId: userB,
      questionId: q.data.id,
      recipeId,
    });

    let list = await listMemberNotificationsForUser(userB);
    let unread = await countUnreadMemberNotificationsForUser(userB);
    assert.equal(list.filter((n) => n.unread).length, unread);
    assert.ok(unread >= 2);

    await hideRecipeQuestion({ questionId: q.data.id });
    list = await listMemberNotificationsForUser(userB);
    unread = await countUnreadMemberNotificationsForUser(userB);
    assert.equal(list.filter((n) => n.unread).length, unread);
    assert.equal(
      list.some((n) => n.type === MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED),
      false,
    );
    assert.ok(
      list.some((n) => n.type === MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH),
    );
    void followKey;
  });

  it("pending delete cooldown blocks spam loop; reject is terminal", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userA,
      recipeId,
      authorName: "Hard A",
      body: "Is a cast-iron skillet required for this method?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const early = await deletePendingRecipeQuestionForUser({
      userId: userA,
      questionId: created.data.id,
      now: new Date(),
    });
    assert.equal(early.ok, false);

    const later = await deletePendingRecipeQuestionForUser({
      userId: userA,
      questionId: created.data.id,
      now: new Date(Date.now() + 3 * 60 * 1000),
    });
    assert.equal(later.ok, true);

    const rejected = await createRecipeQuestionForUser({
      userId: userA,
      recipeId,
      authorName: "Hard A",
      body: "Should I toast the spices before adding liquids?",
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    await rejectRecipeQuestion({ questionId: rejected.data.id });
    const edit = await updatePendingRecipeQuestionForUser({
      userId: userA,
      questionId: rejected.data.id,
      body: "Cannot edit after rejection in MVP flows!!",
    });
    assert.equal(edit.ok, false);
    const pub = await publishRecipeQuestion({ questionId: rejected.data.id });
    assert.equal(pub.ok, false);
  });

  it("gate OFF hides Q&A surfaces in count/list; data retained", async () => {
    process.env.RECIPE_QA_ENABLED = "false";
    const list = await listMemberNotificationsForUser(userA);
    assert.ok(
      list.every((n) => n.type !== MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED),
    );
    const unread = await countUnreadMemberNotificationsForUser(userA);
    assert.equal(
      unread,
      list.filter((n) => n.unread).length,
    );
    assert.equal(
      (
        await createRecipeQuestionAnsweredNotification({
          userId: userA,
          questionId: "any",
          recipeId,
        })
      ).outcome,
      "skipped_gate",
    );
    const stillThere = await db.recipeQuestion.count({ where: { recipeId } });
    assert.ok(stillThere >= 1);
    process.env.RECIPE_QA_ENABLED = "true";
  });
});
