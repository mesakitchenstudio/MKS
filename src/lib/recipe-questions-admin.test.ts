/**
 * Phase 9D — Admin Recipe Q&A moderation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { humanizeAdminAuditAction } from "./admin-audit.ts";
import { buildAdminNavSections, flattenAdminNavItemLabels } from "./admin-nav.ts";
import { isRecipeQaEnabled } from "./flags.ts";
import {
  parseRecipeQuestionAdminFilter,
  RECIPE_QUESTION_ANSWER_MAX,
} from "./recipe-questions.ts";
import {
  createRecipeQuestionForUser,
  getRecipeQuestionForAdmin,
  hideRecipeQuestion,
  listPublishedRecipeQuestions,
  listRecipeQuestionsForAdmin,
  publishRecipeQuestion,
  rejectRecipeQuestion,
  setRecipeQuestionAnswer,
} from "./recipe-questions-server.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(rel: string) {
  return readFileSync(path.join(root, "..", "..", rel), "utf8");
}

describe("Phase 9D — Admin wiring contracts", () => {
  it("Community nav gates Questions behind RECIPE_QA_ENABLED", () => {
    const off = flattenAdminNavItemLabels(buildAdminNavSections("owner"));
    assert.equal(off.includes("Questions"), false);
    assert.equal(off.includes("Reviews"), true);

    const on = flattenAdminNavItemLabels(
      buildAdminNavSections("owner", { recipeQaEnabled: true }),
    );
    assert.equal(on.includes("Questions"), true);
    const community = buildAdminNavSections("owner", {
      recipeQaEnabled: true,
    }).find((s) => s.id === "community");
    const hrefs = community?.items.map((i) => i.href) || [];
    assert.ok(hrefs.indexOf("/admin/questions") > hrefs.indexOf("/admin/reviews"));

    const audience = flattenAdminNavItemLabels(
      buildAdminNavSections("members", { recipeQaEnabled: true }),
    );
    assert.equal(audience.includes("Questions"), false);

    const layout = readRepo("src/app/admin/(app)/layout.tsx");
    assert.match(layout, /isRecipeQaEnabled\(\)/);
    assert.match(layout, /recipeQaEnabled:\s*isRecipeQaEnabled\(\)/);
  });

  it("Admin routes and actions enforce gate + content access", () => {
    const list = readRepo("src/app/admin/(app)/questions/page.tsx");
    const detail = readRepo("src/app/admin/(app)/questions/[id]/page.tsx");
    const actions = readRepo("src/app/admin/question-actions.ts");
    assert.match(list, /isRecipeQaEnabled\(\)/);
    assert.match(list, /notFound\(\)/);
    assert.match(list, /requireAccess\("content"\)/);
    assert.match(detail, /isRecipeQaEnabled\(\)/);
    assert.match(detail, /requireAccess\("content"\)/);
    assert.match(actions, /isRecipeQaEnabled\(\)/);
    assert.match(actions, /requireAccess\("content"\)/);
    assert.doesNotMatch(actions, /MemberNotification|RECIPE_QUESTION_ANSWERED/);
    assert.doesNotMatch(actions, /adminId:\s*input/);
  });

  it("question body is read-only; answer editor is plain textarea", () => {
    const detail = readRepo("src/app/admin/(app)/questions/[id]/page.tsx");
    const form = readRepo("src/components/admin/AdminQuestionModerationForm.tsx");
    assert.match(detail, /Member question/);
    assert.doesNotMatch(detail, /name="body"|question body textarea/i);
    assert.match(form, /Official Mesa answer/);
    assert.match(form, /<textarea/);
    assert.match(form, /Save answer/);
    assert.match(form, /Save &amp; publish|Save & publish/);
    assert.match(form, /Hide/);
    assert.match(form, /Reject/);
  });

  it("audit humanization labels exist", () => {
    assert.equal(
      humanizeAdminAuditAction("recipe_question.answered"),
      "Answered recipe question",
    );
    assert.equal(
      humanizeAdminAuditAction("recipe_question.answer_updated"),
      "Updated recipe question answer",
    );
    assert.equal(
      humanizeAdminAuditAction("recipe_question.published"),
      "Published recipe question",
    );
    assert.equal(
      humanizeAdminAuditAction("recipe_question.hidden"),
      "Hid recipe question",
    );
    assert.equal(
      humanizeAdminAuditAction("recipe_question.rejected"),
      "Rejected recipe question",
    );
  });

  it("no profile questions / notifications / pending badge", () => {
    const accountMenu = readRepo("src/components/AccountMenu.tsx");
    assert.doesNotMatch(accountMenu, /profile\/questions/);
    const shell = readRepo("src/components/admin/AdminShell.tsx");
    assert.doesNotMatch(shell, /countPendingRecipeQuestions/);
    const actions = readRepo("src/app/admin/question-actions.ts");
    assert.doesNotMatch(actions, /createRecipeFollowedPublishNotification|memberNotification\.create/i);
  });

  it("admin filter parser defaults invalid to pending", () => {
    assert.equal(parseRecipeQuestionAdminFilter(undefined), "pending");
    assert.equal(parseRecipeQuestionAdminFilter("Published"), "published");
    assert.equal(parseRecipeQuestionAdminFilter("nope"), "pending");
    assert.equal(parseRecipeQuestionAdminFilter("all"), "all");
  });
});

describe("Phase 9D — moderation domain lifecycle", () => {
  const db = new PrismaClient();
  const suffix = `r9d-${Date.now()}`;
  let typeId = "";
  let userId = "";
  let adminId = "";
  let recipePubId = "";
  let recipeDraftId = "";

  before(async () => {
    const type = await db.recipeType.create({
      data: { slug: `t-${suffix}`, name: "T" },
    });
    typeId = type.id;
    const user = await db.user.create({
      data: { email: `u-${suffix}@example.com`, name: "Asker" },
    });
    userId = user.id;
    const admin = await db.admin.create({
      data: {
        email: `adm-${suffix}@example.com`,
        name: "Moderator",
        passwordHash: "x",
        role: "editor",
      },
    });
    adminId = admin.id;
    const [pub, draft] = await Promise.all([
      db.recipe.create({
        data: {
          slug: `pub-${suffix}`,
          title: `Pub ${suffix}`,
          status: "published",
          typeId,
          values: "{}",
        },
      }),
      db.recipe.create({
        data: {
          slug: `draft-${suffix}`,
          title: `Draft ${suffix}`,
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
    await db.adminAuditEvent.deleteMany({
      where: { entityPath: { contains: "/admin/questions" } },
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

  it("pending list oldest-first; answer/publish/hide/republish timestamps", async () => {
    const older = await createRecipeQuestionForUser({
      userId,
      recipeId: recipePubId,
      authorName: "Asker",
      body: "Older pending question for queue ordering?",
    });
    const newer = await createRecipeQuestionForUser({
      userId,
      recipeId: recipePubId,
      authorName: "Asker",
      body: "Newer pending question for queue ordering?",
    });
    assert.equal(older.ok && newer.ok, true);
    if (!older.ok || !newer.ok) return;

    await db.recipeQuestion.update({
      where: { id: older.data.id },
      data: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    await db.recipeQuestion.update({
      where: { id: newer.data.id },
      data: { createdAt: new Date("2026-06-01T00:00:00.000Z") },
    });

    const pending = await listRecipeQuestionsForAdmin({ status: "pending" });
    const ids = pending.map((q) => q.id);
    assert.ok(ids.indexOf(older.data.id) < ids.indexOf(newer.data.id));

    // Answer without publish — still not public
    const answered = await setRecipeQuestionAnswer({
      questionId: older.data.id,
      adminId,
      answerBody: "Official answer while still pending.",
    });
    assert.equal(answered.ok, true);
    if (!answered.ok) return;
    const firstAnsweredAt = answered.data.answeredAt;
    let publicList = await listPublishedRecipeQuestions({ recipeId: recipePubId });
    assert.ok(!publicList.some((q) => q.id === older.data.id));

    const published = await publishRecipeQuestion({ questionId: older.data.id });
    assert.equal(published.ok, true);
    if (!published.ok) return;
    const firstPublishedAt = published.data.publishedAt;
    publicList = await listPublishedRecipeQuestions({ recipeId: recipePubId });
    assert.ok(publicList.some((q) => q.id === older.data.id));

    await new Promise((r) => setTimeout(r, 15));
    const edited = await setRecipeQuestionAnswer({
      questionId: older.data.id,
      adminId,
      answerBody: "Updated official answer after publish.",
    });
    assert.equal(edited.ok, true);
    if (!edited.ok) return;
    assert.equal(edited.data.wasFirstAnswer, false);
    assert.equal(edited.data.answeredAt.getTime(), firstAnsweredAt.getTime());

    const afterEdit = await getRecipeQuestionForAdmin(older.data.id);
    assert.equal(afterEdit?.status, "published");
    assert.equal(afterEdit?.publishedAt?.getTime(), firstPublishedAt.getTime());

    const hidden = await hideRecipeQuestion({ questionId: older.data.id });
    assert.equal(hidden.ok, true);
    publicList = await listPublishedRecipeQuestions({ recipeId: recipePubId });
    assert.ok(!publicList.some((q) => q.id === older.data.id));

    // Hidden answer edit allowed; stays hidden
    const hiddenEdit = await setRecipeQuestionAnswer({
      questionId: older.data.id,
      adminId,
      answerBody: "Corrected while hidden before republish.",
    });
    assert.equal(hiddenEdit.ok, true);
    const stillHidden = await getRecipeQuestionForAdmin(older.data.id);
    assert.equal(stillHidden?.status, "hidden");

    const republished = await publishRecipeQuestion({ questionId: older.data.id });
    assert.equal(republished.ok, true);
    if (!republished.ok) return;
    assert.equal(republished.data.publishedAt.getTime(), firstPublishedAt.getTime());
    const afterRepub = await getRecipeQuestionForAdmin(older.data.id);
    assert.equal(afterRepub?.answeredAt?.getTime(), firstAnsweredAt.getTime());
  });

  it("reject pending is terminal; draft recipe cannot publish", async () => {
    const q = await createRecipeQuestionForUser({
      userId,
      recipeId: recipePubId,
      authorName: "Asker",
      body: "This spam question should be rejected!!",
    });
    assert.equal(q.ok, true);
    if (!q.ok) return;
    await rejectRecipeQuestion({ questionId: q.data.id });
    const answerRejected = await setRecipeQuestionAnswer({
      questionId: q.data.id,
      adminId,
      answerBody: "Should not work on rejected.",
    });
    assert.equal(answerRejected.ok, false);
    const publishRejected = await publishRecipeQuestion({ questionId: q.data.id });
    assert.equal(publishRejected.ok, false);

    const draftQ = await db.recipeQuestion.create({
      data: {
        recipeId: recipeDraftId,
        userId,
        authorName: "Asker",
        body: "Question attached to draft recipe for publish gate.",
        status: "pending",
        answerBody: "Official answer ready.",
        answeredAt: new Date(),
        answeredByAdminId: adminId,
      },
    });
    const publishDraft = await publishRecipeQuestion({ questionId: draftQ.id });
    assert.equal(publishDraft.ok, false);
    if (!publishDraft.ok) {
      assert.equal(publishDraft.error, "RECIPE_NOT_PUBLISHED");
    }
  });

  it("answer validation bounds + env admin id null actor", async () => {
    const q = await createRecipeQuestionForUser({
      userId,
      recipeId: recipePubId,
      authorName: "Asker",
      body: "Validation question for answer length bounds?",
    });
    assert.equal(q.ok, true);
    if (!q.ok) return;

    const empty = await setRecipeQuestionAnswer({
      questionId: q.data.id,
      adminId,
      answerBody: "   ",
    });
    assert.equal(empty.ok, false);

    const max = await setRecipeQuestionAnswer({
      questionId: q.data.id,
      adminId: "env",
      answerBody: "a".repeat(RECIPE_QUESTION_ANSWER_MAX),
    });
    assert.equal(max.ok, true);
    if (max.ok) {
      assert.equal(max.data.answerBody.length, RECIPE_QUESTION_ANSWER_MAX);
      assert.equal(max.data.answeredByAdminId, "");
    }
    const row = await db.recipeQuestion.findUnique({ where: { id: q.data.id } });
    assert.equal(row?.answeredByAdminId, null);
  });

  it("action source emits expected audits and revalidates recipe path", () => {
    const actions = readRepo("src/app/admin/question-actions.ts");
    assert.match(actions, /recipe_question\.answered/);
    assert.match(actions, /recipe_question\.answer_updated/);
    assert.match(actions, /recipe_question\.published/);
    assert.match(actions, /recipe_question\.hidden/);
    assert.match(actions, /recipe_question\.rejected/);
    assert.match(actions, /revalidatePath\(`\/recipes\/\$\{/);
    assert.match(actions, /previousStatus/);
    assert.doesNotMatch(actions, /answerBody:\s*existing|body:\s*existing\.body/);
  });

  it("gate helper still exact-true only", () => {
    const prev = process.env.RECIPE_QA_ENABLED;
    try {
      delete process.env.RECIPE_QA_ENABLED;
      assert.equal(isRecipeQaEnabled(), false);
      process.env.RECIPE_QA_ENABLED = "true";
      assert.equal(isRecipeQaEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.RECIPE_QA_ENABLED;
      else process.env.RECIPE_QA_ENABLED = prev;
    }
  });
});

describe("Phase 9D — allowlist coverage", () => {
  it("includes 9D test file without shrinking suite", () => {
    const allowlist: string[] = JSON.parse(
      readRepo("scripts/unit-test-files.json"),
    );
    assert.ok(allowlist.includes("src/lib/recipe-questions-admin.test.ts"));
    assert.ok(allowlist.includes("src/lib/recipe-questions-ui.test.ts"));
    assert.ok(allowlist.length >= 218);
  });
});
