/**
 * Phase 12D — Newsletter campaign Admin server CRUD / preview / dry-run tests.
 * Local DB only. No Production. No Resend.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { AdminAuditActor } from "./admin-audit.ts";
import {
  buildNewsletterCampaignAdminPreview,
  createNewsletterCampaignForAdmin,
  deleteNewsletterCampaignForAdmin,
  updateNewsletterCampaignForAdmin,
} from "./newsletter-campaign-admin-server.ts";
import { runNewsletterCampaignDryRun } from "./newsletter-campaign-dry-run.ts";
import { NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING, NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING } from "./newsletter-campaign-email.ts";
import { subscribeNewsletterServer } from "./newsletter-subscribe.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const silentMailer = async () => ({ ok: true as const });

const actor: AdminAuditActor = {
  actorType: "admin",
  id: "env",
  email: "owner@example.com",
  role: "owner",
  name: "Test Owner",
};

describe("newsletter campaign admin — server workflow", () => {
  const db = new PrismaClient();
  const suffix = `12d-${Date.now()}`;
  const prefix = `nl-12d-${suffix}-`;

  let typeId = "";
  let recipePub = "";
  let recipePub2 = "";
  let recipeDraft = "";
  let seriesId = "";
  let categoryId = "";
  let campaignId = "";
  let lockedSendingId = "";
  let lockedSentId = "";

  const emailAnon = `${prefix}anon@example.com`;
  const emailFollows = `${prefix}follows@example.com`;
  const emailCat = `${prefix}cat@example.com`;
  const emailUnsub = `${prefix}unsub@example.com`;
  const emailNotifyOnly = `${prefix}notify-only@example.com`;
  const emailNoSub = `${prefix}nosub@example.com`;

  before(async () => {
    await db.$connect();

    const type = await db.recipeType.create({
      data: { slug: `nl-type-${suffix}`, name: `NL Type ${suffix}` },
    });
    typeId = type.id;

    const series = await db.series.create({
      data: {
        slug: `breads-${suffix}`,
        title: `Breads ${suffix}`,
        isPublished: true,
      },
    });
    seriesId = series.id;

    const category = await db.category.create({
      data: {
        slug: `desserts-${suffix}`,
        name: `Desserts ${suffix}`,
        group: "desserts",
      },
    });
    categoryId = category.id;

    const pub = await db.recipe.create({
      data: {
        slug: `pub-${suffix}`,
        title: `Published Cake ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date("2024-01-01T00:00:00.000Z"),
        values: JSON.stringify({ dishName: `Published Cake ${suffix}` }),
      },
    });
    recipePub = pub.id;

    const pub2 = await db.recipe.create({
      data: {
        slug: `pub2-${suffix}`,
        title: `Published Bread ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date("2024-02-01T00:00:00.000Z"),
        values: JSON.stringify({ dishName: `Published Bread ${suffix}` }),
      },
    });
    recipePub2 = pub2.id;

    const draft = await db.recipe.create({
      data: {
        slug: `draft-${suffix}`,
        title: `Draft ${suffix}`,
        typeId,
        status: "draft",
        values: JSON.stringify({}),
      },
    });
    recipeDraft = draft.id;

    await db.seriesItem.create({
      data: { recipeId: recipePub2, seriesId, sortOrder: 0 },
    });
    await db.recipeCategory.create({
      data: { recipeId: recipePub, categoryId },
    });

    const userFollows = await db.user.create({
      data: { email: emailFollows, name: "Follows", notify: false },
    });
    await db.userSeriesFollow.create({
      data: { userId: userFollows.id, seriesId },
    });

    const userCat = await db.user.create({
      data: { email: emailCat, name: "Cat", notify: true },
    });
    await db.userCategoryFollow.create({
      data: { userId: userCat.id, categoryId },
    });

    const userUnsub = await db.user.create({
      data: { email: emailUnsub, name: "Unsub", notify: true },
    });
    await db.userSeriesFollow.create({
      data: { userId: userUnsub.id, seriesId },
    });

    await db.user.create({
      data: { email: emailNoSub, name: "NoSub", notify: true },
    });
    await db.userSeriesFollow.create({
      data: {
        userId: (await db.user.findUniqueOrThrow({ where: { email: emailNoSub } })).id,
        seriesId,
      },
    });

    await db.user.create({
      data: { email: emailNotifyOnly, name: "NotifyOnly", notify: true },
    });

    await subscribeNewsletterServer(emailAnon, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailFollows, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailCat, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailUnsub, "site", { sendEmail: silentMailer });
    await db.newsletterSubscriber.update({
      where: { email: emailUnsub },
      data: { status: "unsubscribed" },
    });

    const created = await createNewsletterCampaignForAdmin({
      name: `Campaign ${suffix}`,
      actor,
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("create failed");
    campaignId = created.data.id;

    const sending = await db.newsletterCampaign.create({
      data: {
        name: `Sending ${suffix}`,
        status: "sending",
        content: JSON.stringify({
          subject: "S",
          preheader: "",
          intro: "",
          featuredRecipeId: null,
          defaultRecipeIds: [recipePub],
          candidateRecipeIds: [recipePub],
        }),
        sendStartedAt: new Date(),
      },
    });
    lockedSendingId = sending.id;

    const sent = await db.newsletterCampaign.create({
      data: {
        name: `Sent ${suffix}`,
        status: "sent",
        content: JSON.stringify({
          subject: "S",
          preheader: "",
          intro: "",
          featuredRecipeId: null,
          defaultRecipeIds: [recipePub],
          candidateRecipeIds: [recipePub],
        }),
        sentAt: new Date(),
      },
    });
    lockedSentId = sent.id;
  });

  after(async () => {
    await db.adminAuditEvent.deleteMany({
      where: { entityId: { in: [campaignId, lockedSendingId, lockedSentId].filter(Boolean) } },
    }).catch(() => undefined);
    await db.newsletterCampaign.deleteMany({
      where: { name: { contains: suffix } },
    }).catch(() => undefined);
    await db.newsletterSubscriber.deleteMany({
      where: { email: { startsWith: prefix } },
    }).catch(() => undefined);
    await db.userSeriesFollow.deleteMany({
      where: { user: { email: { startsWith: prefix } } },
    }).catch(() => undefined);
    await db.userCategoryFollow.deleteMany({
      where: { user: { email: { startsWith: prefix } } },
    }).catch(() => undefined);
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } }).catch(() => undefined);
    await db.recipeCategory.deleteMany({ where: { recipeId: { in: [recipePub, recipePub2] } } }).catch(() => undefined);
    await db.seriesItem.deleteMany({ where: { recipeId: { in: [recipePub, recipePub2] } } }).catch(() => undefined);
    await db.recipe.deleteMany({ where: { id: { in: [recipePub, recipePub2, recipeDraft].filter(Boolean) } } }).catch(() => undefined);
    await db.category.deleteMany({ where: { id: categoryId } }).catch(() => undefined);
    await db.series.deleteMany({ where: { id: seriesId } }).catch(() => undefined);
    await db.recipeType.deleteMany({ where: { id: typeId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("create Draft with null send timestamps + audit", async () => {
    const row = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    assert.equal(row.status, "draft");
    assert.equal(row.sentAt, null);
    assert.equal(row.sendStartedAt, null);
    const audit = await db.adminAuditEvent.findFirst({
      where: { action: "newsletter_campaign.created", entityId: campaignId },
    });
    assert.ok(audit);
    assert.doesNotMatch(String(audit.metadata ?? ""), /@example\.com/);
  });

  it("update Draft content, normalize defaults into pool, keep status/timestamps", async () => {
    const before = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    const result = await updateNewsletterCampaignForAdmin({
      id: campaignId,
      name: `Campaign ${suffix} edited`,
      content: {
        subject: "Hello kitchen",
        preheader: "Pre",
        intro: "Intro <script>alert(1)</script>",
        featuredRecipeId: recipePub,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [],
      },
      actor,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.status, "draft");
    assert.equal(result.data.sentAt, null);
    assert.equal(result.data.sendStartedAt, null);
    assert.ok(result.data.content.candidateRecipeIds.includes(recipePub2));
    assert.equal(result.data.content.featuredRecipeId, recipePub);
    const after = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    assert.equal(after.status, "draft");
    assert.equal(after.sentAt?.getTime() ?? null, before.sentAt?.getTime() ?? null);
    assert.equal(after.sendStartedAt?.getTime() ?? null, before.sendStartedAt?.getTime() ?? null);
    const audit = await db.adminAuditEvent.findFirst({
      where: { action: "newsletter_campaign.updated", entityId: campaignId },
    });
    assert.ok(audit);
  });

  it("rejects new Draft Recipe selection", async () => {
    const result = await updateNewsletterCampaignForAdmin({
      id: campaignId,
      content: {
        subject: "Hello kitchen",
        preheader: "Pre",
        intro: "Intro",
        featuredRecipeId: recipePub,
        defaultRecipeIds: [recipePub2, recipeDraft],
        candidateRecipeIds: [recipePub2, recipeDraft],
      },
      actor,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "invalid_recipe");
  });

  it("retains existing unavailable Recipe on unrelated edit", async () => {
    // Seed campaign with recipePub2, then unpublish it, then edit subject.
    await updateNewsletterCampaignForAdmin({
      id: campaignId,
      content: {
        subject: "Before unpublish",
        preheader: "",
        intro: "",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2, recipePub],
      },
      actor,
    });
    await db.recipe.update({ where: { id: recipePub2 }, data: { status: "draft" } });
    const result = await updateNewsletterCampaignForAdmin({
      id: campaignId,
      content: {
        subject: "After unpublish",
        preheader: "",
        intro: "",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2, recipePub],
      },
      actor,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.data.content.defaultRecipeIds.includes(recipePub2));
    // Restore published for later personalization tests
    await db.recipe.update({
      where: { id: recipePub2 },
      data: { status: "published", publishedAt: new Date("2024-02-01T00:00:00.000Z") },
    });
    await updateNewsletterCampaignForAdmin({
      id: campaignId,
      content: {
        subject: "Hello kitchen",
        preheader: "Pre",
        intro: "Intro <script>alert(1)</script>",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2, recipePub],
      },
      actor,
    });
  });

  it("rejects locked sending/sent mutations", async () => {
    const sending = await updateNewsletterCampaignForAdmin({
      id: lockedSendingId,
      name: "Nope",
      actor,
    });
    assert.equal(sending.ok, false);
    if (!sending.ok) assert.equal(sending.code, "locked");

    const sent = await deleteNewsletterCampaignForAdmin({ id: lockedSentId, actor });
    assert.equal(sent.ok, false);
    if (!sent.ok) assert.equal(sent.code, "locked");
  });

  it("general preview escapes content and does not send", async () => {
    const preview = await buildNewsletterCampaignAdminPreview({
      campaignId,
      mode: "general",
      personalizationEnabled: true,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.data.blockMode, "fallback");
    assert.equal(preview.data.blockHeading, NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING);
    assert.match(preview.data.html, /&lt;script&gt;/);
    assert.doesNotMatch(preview.data.html, /<script>alert/);
    assert.match(preview.data.html, /token=preview/);
    assert.doesNotMatch(preview.data.html, /because you follow/i);
  });

  it("series synthetic preview personalizes when enabled", async () => {
    const preview = await buildNewsletterCampaignAdminPreview({
      campaignId,
      mode: "series",
      seriesId,
      personalizationEnabled: true,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.data.blockMode, "personalized");
    assert.equal(preview.data.blockHeading, NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING);
    assert.ok(preview.data.explanation.some((line) => /Series/i.test(line)));
    assert.doesNotMatch(preview.data.html, /because you follow/i);
  });

  it("category synthetic preview personalizes when enabled", async () => {
    const preview = await buildNewsletterCampaignAdminPreview({
      campaignId,
      mode: "category",
      categoryId,
      personalizationEnabled: true,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.data.blockMode, "personalized");
    assert.ok(preview.data.explanation.some((line) => /Category/i.test(line)));
  });

  it("gate-off preview falls back even with strong synthetic profile", async () => {
    const preview = await buildNewsletterCampaignAdminPreview({
      campaignId,
      mode: "series",
      seriesId,
      personalizationEnabled: false,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.data.blockMode, "fallback");
  });

  it("preview uses current slug/title after Recipe rename", async () => {
    await db.recipe.update({
      where: { id: recipePub2 },
      data: {
        slug: `pub2-renamed-${suffix}`,
        title: `Renamed Bread ${suffix}`,
        values: JSON.stringify({ dishName: `Renamed Bread ${suffix}` }),
      },
    });
    const preview = await buildNewsletterCampaignAdminPreview({
      campaignId,
      mode: "general",
      personalizationEnabled: false,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.match(preview.data.html, new RegExp(`pub2-renamed-${suffix}`));
    assert.match(preview.data.html, new RegExp(`Renamed Bread ${suffix}`));
  });

  it("dry run aggregates without PII and without persistence", async () => {
    const before = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    const subBefore = await db.newsletterSubscriber.count({
      where: { email: { startsWith: prefix } },
    });

    const zeroish = await runNewsletterCampaignDryRun({
      campaignId,
      personalizationEnabled: true,
    });
    assert.equal(zeroish.ok, true);
    if (!zeroish.ok) return;

    // eligible: anon + follows + cat (unsub excluded; notify-only and nosub excluded)
    assert.equal(zeroish.data.eligibleRecipients >= 3, true);
    assert.equal(zeroish.data.personalizedRecipients >= 1, true);
    assert.equal(
      zeroish.data.eligibleRecipients,
      zeroish.data.personalizedRecipients + zeroish.data.fallbackRecipients,
    );
    assert.equal(JSON.stringify(zeroish.data).includes("@example.com"), false);
    assert.equal(JSON.stringify(zeroish.data).includes(emailFollows), false);

    const gateOff = await runNewsletterCampaignDryRun({
      campaignId,
      personalizationEnabled: false,
    });
    assert.equal(gateOff.ok, true);
    if (!gateOff.ok) return;
    assert.equal(gateOff.data.personalizedRecipients, 0);
    assert.equal(gateOff.data.fallbackRecipients, gateOff.data.eligibleRecipients);

    const after = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    assert.equal(after.status, before.status);
    assert.equal(after.sentAt?.getTime() ?? null, before.sentAt?.getTime() ?? null);
    assert.equal(after.sendStartedAt?.getTime() ?? null, before.sendStartedAt?.getTime() ?? null);
    assert.equal(after.content, before.content);
    const subAfter = await db.newsletterSubscriber.count({
      where: { email: { startsWith: prefix } },
    });
    assert.equal(subAfter, subBefore);
  });

  it("dry run excludes unsubscribed followers and User.notify-only", async () => {
    const result = await runNewsletterCampaignDryRun({
      campaignId,
      personalizationEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const activePrefix = await db.newsletterSubscriber.count({
      where: { email: { startsWith: prefix }, status: "active" },
    });
    const unsubPrefix = await db.newsletterSubscriber.count({
      where: { email: { startsWith: prefix }, status: "unsubscribed" },
    });
    // Fixture actives are included; unsubscribed fixture contributes to skipped rows.
    assert.ok(result.data.eligibleRecipients >= activePrefix);
    assert.ok(result.data.ineligibleRowsSkipped >= unsubPrefix);
    // User without NewsletterSubscriber never appears as a named row — aggregate only.
    assert.equal(JSON.stringify(result.data).includes(emailNoSub), false);
    assert.equal(JSON.stringify(result.data).includes(emailNotifyOnly), false);
    assert.equal(JSON.stringify(result.data).includes(emailUnsub), false);
  });

  it("delete Draft writes audit and removes row", async () => {
    const doomed = await createNewsletterCampaignForAdmin({
      name: `Doomed ${suffix}`,
      actor,
    });
    assert.equal(doomed.ok, true);
    if (!doomed.ok) return;
    const deleted = await deleteNewsletterCampaignForAdmin({
      id: doomed.data.id,
      actor,
    });
    assert.equal(deleted.ok, true);
    const row = await db.newsletterCampaign.findUnique({ where: { id: doomed.data.id } });
    assert.equal(row, null);
    const audit = await db.adminAuditEvent.findFirst({
      where: { action: "newsletter_campaign.deleted", entityId: doomed.data.id },
    });
    assert.ok(audit);
  });

  it("source contracts: no send paths / no Resend in 12D modules", () => {
    const files = [
      "lib/newsletter-campaign-admin.ts",
      "lib/newsletter-campaign-admin-server.ts",
      "lib/newsletter-campaign-dry-run.ts",
      "app/admin/newsletter-campaign-actions.ts",
      "components/admin/NewsletterCampaignEditor.tsx",
    ];
    for (const rel of files) {
      const src = readRepo(rel);
      assert.doesNotMatch(src, /sendTransactionalEmailDetailed/);
      assert.doesNotMatch(src, /api\.resend\.com/i);
      assert.doesNotMatch(src, /status:\s*["']sending["']/);
      assert.doesNotMatch(src, /status:\s*["']sent["']/);
      assert.doesNotMatch(src, /sentAt:\s*new Date/);
      assert.doesNotMatch(src, /sendStartedAt:\s*new Date/);
    }
    const editor = readRepo("components/admin/NewsletterCampaignEditor.tsx");
    assert.doesNotMatch(editor, />\s*Send(\s+campaign)?\s*</i);
    assert.doesNotMatch(editor, /Send to audience/i);
    assert.doesNotMatch(editor, /Test send/i);
    assert.match(editor, /Run preview/);
    assert.match(editor, /Run dry run/);
    assert.match(editor, /sandbox=""/);
    assert.match(editor, /title="Newsletter email preview"/);
  });
});
