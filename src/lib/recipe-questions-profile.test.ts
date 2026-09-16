/**
 * Phase 9E — Profile Questions + RECIPE_QUESTION_ANSWERED notifications.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
  MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED,
  buildRecipeFollowedPublishDedupeKey,
  formatRecipeQuestionAnsweredNotificationTitle,
} from "./member-notifications.ts";
import {
  countUnreadMemberNotificationsForUser,
  createRecipeQuestionAnsweredNotification,
  listMemberNotificationsForUser,
  markAllMemberNotificationsReadForUser,
  markMemberNotificationReadForUser,
} from "./member-notifications-server.ts";
import { isRecipeQaEnabled } from "./flags.ts";
import {
  buildRecipeQuestionAnsweredDedupeKey,
  canMemberMutatePendingRecipeQuestion,
  formatRecipeQuestionMemberStatusLabel,
  shouldRevealRecipeQuestionAnswerToOwner,
} from "./recipe-questions.ts";
import {
  createRecipeQuestionForUser,
  deletePendingRecipeQuestionForUser,
  hideRecipeQuestion,
  listRecipeQuestionsForUser,
  publishRecipeQuestion,
  setRecipeQuestionAnswer,
  updatePendingRecipeQuestionForUser,
} from "./recipe-questions-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

describe("Phase 9E — wiring contracts", () => {
  it("Profile Questions route is private, gated, dynamic, noindex", () => {
    const page = readRepo("src/app/profile/questions/page.tsx");
    assert.match(page, /force-dynamic/);
    assert.match(page, /isRecipeQaEnabled\(\)/);
    assert.match(page, /notFound\(\)/);
    assert.match(page, /redirect\("\/profile"\)/);
    assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
    assert.match(page, /listRecipeQuestionsForUser/);
    assert.match(page, /Questions are temporarily unavailable/);
    assert.match(page, /Browse recipes/);
    assert.doesNotMatch(page, /answeredByAdminId/);
  });

  it("AccountMenu My Questions gated; order Profile → My Questions → Notifications", () => {
    const menu = readRepo("src/components/AccountMenu.tsx");
    assert.match(menu, /recipeQaEnabled/);
    assert.match(menu, /My Questions/);
    assert.match(menu, /\/profile\/questions/);
    const profileIdx = menu.indexOf('href="/profile"');
    const questionsIdx = menu.indexOf('href="/profile/questions"');
    const notificationsIdx = menu.indexOf('href="/profile/notifications"');
    assert.ok(profileIdx > 0 && questionsIdx > profileIdx);
    assert.ok(notificationsIdx > questionsIdx);
    assert.match(readRepo("src/app/layout.tsx"), /recipeQaEnabled=\{isRecipeQaEnabled\(\)\}/);
  });

  it("member actions are owner-scoped; no client userId; no Recipe revalidation", () => {
    const actions = readRepo("src/app/profile/question-actions.ts");
    assert.match(actions, /"use server"/);
    assert.match(actions, /isRecipeQaEnabled\(\)/);
    assert.match(actions, /findActiveMemberByEmail/);
    assert.match(actions, /updateMyRecipeQuestionAction/);
    assert.match(actions, /deleteMyRecipeQuestionAction/);
    assert.doesNotMatch(actions, /userId:\s*input/);
    assert.doesNotMatch(actions, /revalidatePath/);
    assert.doesNotMatch(actions, /recordAdminAuditEvent/);
    assert.doesNotMatch(actions, /createRecipeQuestionAnsweredNotification/);
  });

  it("publish action notifies only after first public publish", () => {
    const actions = readRepo("src/app/admin/question-actions.ts");
    assert.match(actions, /wasFirstPublicPublication/);
    assert.match(actions, /createRecipeQuestionAnsweredNotification/);
    assert.match(actions, /publishedAt == null/);
    // Save answer path must not notify.
    const saveBlock = actions.slice(
      actions.indexOf("saveRecipeQuestionAnswerAction"),
      actions.indexOf("publishRecipeQuestionAction"),
    );
    assert.doesNotMatch(saveBlock, /createRecipeQuestionAnsweredNotification/);
  });

  it("Notification Center renders Q&A copy and #questions deep link", () => {
    const view = readRepo("src/components/ProfileNotificationsView.tsx");
    assert.match(view, /formatRecipeQuestionAnsweredNotificationTitle/);
    assert.match(view, /#questions/);
    assert.match(view, /MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED/);
    assert.match(
      readRepo("src/lib/member-notifications.ts"),
      /RECIPE_QUESTION_ANSWERED/,
    );
  });

  it("no Member Home Q&A shelf / email / structured data", () => {
    const home = readRepo("src/app/profile/page.tsx");
    assert.doesNotMatch(home, /listRecipeQuestionsForUser|ProfileQuestions/);
    const actions = readRepo("src/app/admin/question-actions.ts");
    assert.doesNotMatch(actions, /Resend|NewsletterSubscriber|EmailUpdatesPreference/);
    const schema = readRepo("src/lib/schema.ts");
    assert.doesNotMatch(schema, /FAQPage|QAPage/);
  });
});

describe("Phase 9E — presentation helpers", () => {
  it("member status labels and draft-answer privacy helpers", () => {
    assert.equal(formatRecipeQuestionMemberStatusLabel("pending"), "Pending review");
    assert.equal(formatRecipeQuestionMemberStatusLabel("published"), "Answered");
    assert.equal(formatRecipeQuestionMemberStatusLabel("hidden"), "Not currently public");
    assert.equal(formatRecipeQuestionMemberStatusLabel("rejected"), "Not published");

    assert.equal(
      shouldRevealRecipeQuestionAnswerToOwner({
        status: "pending",
        publishedAt: null,
        answerBody: "Draft answer",
      }),
      false,
    );
    assert.equal(
      shouldRevealRecipeQuestionAnswerToOwner({
        status: "published",
        publishedAt: new Date(),
        answerBody: "Live",
      }),
      true,
    );
    assert.equal(
      shouldRevealRecipeQuestionAnswerToOwner({
        status: "hidden",
        publishedAt: new Date(),
        answerBody: "Was public",
      }),
      true,
    );
    assert.equal(
      canMemberMutatePendingRecipeQuestion({
        status: "pending",
        answerBody: null,
      }),
      true,
    );
    assert.equal(
      canMemberMutatePendingRecipeQuestion({
        status: "pending",
        answerBody: "Staff draft",
      }),
      false,
    );
    assert.equal(
      formatRecipeQuestionAnsweredNotificationTitle("Lemon Pasta"),
      "Mesa answered your question on Lemon Pasta",
    );
    assert.equal(
      buildRecipeQuestionAnsweredDedupeKey("q1"),
      "recipe_question.answered:q1",
    );
  });
});

describe("Phase 9E — profile + notification lifecycle", () => {
  const db = new PrismaClient();
  const suffix = `r9e-${Date.now()}`;
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
        data: { email: `a-${suffix}@example.com`, name: "Asker A" },
      }),
      db.user.create({
        data: { email: `b-${suffix}@example.com`, name: "Asker B" },
      }),
      db.admin.create({
        data: {
          email: `admin-${suffix}@example.com`,
          name: "QA Admin",
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
        slug: `qa-${suffix}`,
        title: `Lemon Pasta ${suffix}`,
        status: "published",
        typeId,
        values: "{}",
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

  it("pending edit/delete, draft-answer lock, and profile answer privacy", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userA,
      recipeId,
      authorName: "Asker A",
      body: "How long should I simmer the sauce for best texture?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    let profile = await listRecipeQuestionsForUser({ userId: userA });
    const row = profile.find((q) => q.id === created.data.id);
    assert.ok(row);
    assert.equal(row?.status, "pending");
    assert.equal(row?.answerBody, null);
    assert.equal(row?.canEdit, true);

    const edited = await updatePendingRecipeQuestionForUser({
      userId: userA,
      questionId: created.data.id,
      body: "How long should I simmer the sauce before serving?",
    });
    assert.equal(edited.ok, true);

    const cross = await updatePendingRecipeQuestionForUser({
      userId: userB,
      questionId: created.data.id,
      body: "Cross-user edit should fail with not found.",
    });
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.error, "NOT_FOUND");

    await setRecipeQuestionAnswer({
      questionId: created.data.id,
      adminId,
      answerBody: "Simmer gently for about 12 minutes until slightly thickened.",
    });

    profile = await listRecipeQuestionsForUser({ userId: userA });
    const pendingAnswered = profile.find((q) => q.id === created.data.id);
    assert.equal(pendingAnswered?.status, "pending");
    assert.equal(pendingAnswered?.answerBody, null);
    assert.equal(pendingAnswered?.canEdit, false);
    assert.equal(pendingAnswered?.canDelete, false);

    const lockedEdit = await updatePendingRecipeQuestionForUser({
      userId: userA,
      questionId: created.data.id,
      body: "Trying to change meaning under a drafted answer.",
    });
    assert.equal(lockedEdit.ok, false);
    if (!lockedEdit.ok) assert.equal(lockedEdit.error, "ANSWER_IN_PROGRESS");

    const lockedDelete = await deletePendingRecipeQuestionForUser({
      userId: userA,
      questionId: created.data.id,
      now: new Date(Date.now() + 10 * 60 * 1000),
    });
    assert.equal(lockedDelete.ok, false);
    if (!lockedDelete.ok) assert.equal(lockedDelete.error, "ANSWER_IN_PROGRESS");

    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);

    const publishedAtBefore = (
      await db.recipeQuestion.findUnique({
        where: { id: created.data.id },
        select: { publishedAt: true },
      })
    )?.publishedAt;
    assert.equal(publishedAtBefore, null);

    const pub = await publishRecipeQuestion({ questionId: created.data.id });
    assert.equal(pub.ok, true);

    // Direct publish helper does not notify — action layer owns that.
    // Simulate first-publish notification eligibility here.
    const notify = await createRecipeQuestionAnsweredNotification({
      userId: userA,
      questionId: created.data.id,
      recipeId,
    });
    assert.equal(notify.outcome, "created");

    const notifyAgain = await createRecipeQuestionAnsweredNotification({
      userId: userA,
      questionId: created.data.id,
      recipeId,
    });
    assert.equal(notifyAgain.outcome, "deduped");

    profile = await listRecipeQuestionsForUser({ userId: userA });
    const answered = profile.find((q) => q.id === created.data.id);
    assert.equal(answered?.status, "published");
    assert.ok(answered?.answerBody?.includes("12 minutes"));

    let list = await listMemberNotificationsForUser(userA);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.type, MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);

    // Answer edit: no new notification.
    const answeredAt = (
      await db.recipeQuestion.findUnique({
        where: { id: created.data.id },
        select: { answeredAt: true, publishedAt: true },
      })
    )!;
    await setRecipeQuestionAnswer({
      questionId: created.data.id,
      adminId,
      answerBody: "Simmer gently for about 15 minutes until slightly thickened.",
    });
    const afterEdit = await db.recipeQuestion.findUnique({
      where: { id: created.data.id },
      select: { answeredAt: true, publishedAt: true },
    });
    assert.equal(afterEdit?.answeredAt?.getTime(), answeredAt.answeredAt?.getTime());
    assert.equal(afterEdit?.publishedAt?.getTime(), answeredAt.publishedAt?.getTime());
    assert.equal(
      await db.memberNotification.count({
        where: {
          userId: userA,
          type: MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED,
        },
      }),
      1,
    );

    await hideRecipeQuestion({ questionId: created.data.id });
    list = await listMemberNotificationsForUser(userA);
    assert.equal(list.length, 0);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);

    profile = await listRecipeQuestionsForUser({ userId: userA });
    const hidden = profile.find((q) => q.id === created.data.id);
    assert.equal(hidden?.status, "hidden");
    assert.ok(hidden?.answerBody);

    await publishRecipeQuestion({ questionId: created.data.id });
    const republishNotify = await createRecipeQuestionAnsweredNotification({
      userId: userA,
      questionId: created.data.id,
      recipeId,
    });
    assert.equal(republishNotify.outcome, "deduped");

    list = await listMemberNotificationsForUser(userA);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.unread, true);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);

    // Gate OFF hides Q&A notifications but keeps #8.
    await db.memberNotification.create({
      data: {
        userId: userA,
        type: MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH,
        recipeId,
        dedupeKey: buildRecipeFollowedPublishDedupeKey(recipeId),
      },
    });
    process.env.RECIPE_QA_ENABLED = "false";
    assert.equal(isRecipeQaEnabled(), false);
    list = await listMemberNotificationsForUser(userA);
    assert.equal(list.length, 1);
    assert.equal(list[0]?.type, MEMBER_NOTIFICATION_TYPE_RECIPE_FOLLOWED_PUBLISH);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);

    process.env.RECIPE_QA_ENABLED = "true";
    list = await listMemberNotificationsForUser(userA);
    assert.equal(list.length, 2);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 2);

    const qaId = list.find(
      (n) => n.type === MEMBER_NOTIFICATION_TYPE_RECIPE_QUESTION_ANSWERED,
    )!.id;
    await markMemberNotificationReadForUser(userA, qaId);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 1);

    await markAllMemberNotificationsReadForUser(userA);
    assert.equal(await countUnreadMemberNotificationsForUser(userA), 0);

    // B never receives A's notification.
    assert.equal(await countUnreadMemberNotificationsForUser(userB), 0);
    const listB = await listMemberNotificationsForUser(userB);
    assert.equal(listB.length, 0);
  });

  it("pending delete without answer works after cooldown; reject stays private", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userB,
      recipeId,
      authorName: "Asker B",
      body: "Can I swap olive oil for butter in this recipe?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const earlyDelete = await deletePendingRecipeQuestionForUser({
      userId: userB,
      questionId: created.data.id,
      now: new Date(),
    });
    assert.equal(earlyDelete.ok, false);

    const deleted = await deletePendingRecipeQuestionForUser({
      userId: userB,
      questionId: created.data.id,
      now: new Date(Date.now() + 3 * 60 * 1000),
    });
    assert.equal(deleted.ok, true);

    const again = await createRecipeQuestionForUser({
      userId: userB,
      recipeId,
      authorName: "Asker B",
      body: "Is this freezer-friendly after cooking?",
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;

    await db.recipeQuestion.update({
      where: { id: again.data.id },
      data: { status: "rejected" },
    });
    const profile = await listRecipeQuestionsForUser({ userId: userB });
    const rejected = profile.find((q) => q.id === again.data.id);
    assert.equal(rejected?.status, "rejected");
    assert.equal(rejected?.answerBody, null);
    assert.equal(rejected?.canEdit, false);
    assert.equal(rejected?.canDelete, false);

    const notify = await createRecipeQuestionAnsweredNotification({
      userId: null,
      questionId: again.data.id,
      recipeId,
    });
    assert.equal(notify.outcome, "skipped_no_owner");

    process.env.RECIPE_QA_ENABLED = "false";
    const gated = await createRecipeQuestionAnsweredNotification({
      userId: userB,
      questionId: again.data.id,
      recipeId,
    });
    assert.equal(gated.outcome, "skipped_gate");
    process.env.RECIPE_QA_ENABLED = "true";
  });

  it("Recipe Draft hides Q&A notification; read state preserved when republished", async () => {
    const created = await createRecipeQuestionForUser({
      userId: userA,
      recipeId,
      authorName: "Asker A",
      body: "What side dish pairs best with this pasta?",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await setRecipeQuestionAnswer({
      questionId: created.data.id,
      adminId,
      answerBody: "A simple green salad with lemon vinaigrette works beautifully.",
    });
    await publishRecipeQuestion({ questionId: created.data.id });
    const createdNotify = await createRecipeQuestionAnsweredNotification({
      userId: userA,
      questionId: created.data.id,
      recipeId,
    });
    // May dedupe if prior test left a row for same question — use unique question.
    assert.ok(
      createdNotify.outcome === "created" || createdNotify.outcome === "deduped",
    );

    const notifId = createdNotify.id!;
    await markMemberNotificationReadForUser(userA, notifId);

    await db.recipe.update({
      where: { id: recipeId },
      data: { status: "draft" },
    });
    let list = await listMemberNotificationsForUser(userA);
    assert.ok(
      !list.some((n) => n.recipeQuestionId === created.data.id),
    );

    await db.recipe.update({
      where: { id: recipeId },
      data: { status: "published" },
    });
    list = await listMemberNotificationsForUser(userA);
    const restored = list.find((n) => n.recipeQuestionId === created.data.id);
    assert.ok(restored);
    assert.equal(restored?.unread, false);
  });
});
