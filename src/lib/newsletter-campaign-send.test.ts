/**
 * Phase 12E — Newsletter campaign send orchestration tests.
 * Local DB + injected transport only. No Resend network. No Production.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { AdminAuditActor } from "./admin-audit.ts";
import {
  canSendNewsletterCampaigns,
} from "./admin-access.ts";
import {
  NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING,
  NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING,
} from "./newsletter-campaign-email.ts";
import {
  createNewsletterCampaignForAdmin,
  updateNewsletterCampaignForAdmin,
} from "./newsletter-campaign-admin-server.ts";
import {
  NEWSLETTER_CAMPAIGN_TEST_FOOTER,
  NEWSLETTER_SEND_PROVIDER_CONCURRENCY,
  NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE,
  claimNewsletterCampaignForSend,
  sendNewsletterCampaignTestEmail,
  sendNewsletterCampaignToAudience,
} from "./newsletter-campaign-send.ts";
import type { SendNewsletterMarketingEmailInput } from "./newsletter-marketing-email.ts";
import {
  NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV,
  NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH,
  createNewsletterUnsubscribeToken,
  hashNewsletterUnsubscribeToken,
  resolveNewsletterUnsubscribeToken,
  verifySignedNewsletterUnsubscribeToken,
} from "./newsletter-unsubscribe.ts";
import {
  subscribeNewsletterServer,
  unsubscribeNewsletterByToken,
} from "./newsletter-subscribe.ts";
import { POST as oneClickPost } from "../app/api/newsletter/unsubscribe/one-click/route.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const TEST_SECRET = "mesa-newsletter-send-test-secret-32b!!";
assert.ok(TEST_SECRET.length >= NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH);

const actor: AdminAuditActor = {
  actorType: "admin",
  id: "env",
  email: "owner@example.com",
  role: "owner",
  name: "Test Owner",
};

const silentSubscribeMailer = async () => ({ ok: true as const });

type CapturedMail = SendNewsletterMarketingEmailInput & { callIndex: number };

function createCapturingMailer(options?: {
  failEmails?: Set<string>;
  throwAfterSuccesses?: number;
}) {
  const calls: CapturedMail[] = [];
  let successes = 0;
  const mailer = async (input: SendNewsletterMarketingEmailInput) => {
    const to = Array.isArray(input.to) ? input.to[0]! : input.to;
    calls.push({ ...input, callIndex: calls.length, to });
    if (options?.throwAfterSuccesses !== undefined && successes >= options.throwAfterSuccesses) {
      throw new Error("simulated mid-send exception");
    }
    if (options?.failEmails?.has(String(to).toLowerCase())) {
      return { ok: false as const, reason: "provider_error" as const };
    }
    successes += 1;
    return { ok: true as const, id: `mock-${calls.length}` };
  };
  return { mailer, calls };
}

describe("newsletter campaign send — access + source contracts", () => {
  it("send is Owner only", () => {
    assert.equal(canSendNewsletterCampaigns("owner"), true);
    assert.equal(canSendNewsletterCampaigns("editor"), false);
    assert.equal(canSendNewsletterCampaigns("members"), false);
  });

  it("marketing transport + send modules avoid Resend network and schema changes", () => {
    const marketing = readRepo("lib/newsletter-marketing-email.ts");
    assert.match(marketing, /sendNewsletterMarketingEmailDetailed/);
    assert.match(marketing, /sendTransactionalEmailDetailed/);
    assert.doesNotMatch(marketing, /api\.resend\.com/i);

    const send = readRepo("lib/newsletter-campaign-send.ts");
    assert.match(send, /NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE/);
    assert.match(send, /NEWSLETTER_SEND_PROVIDER_CONCURRENCY/);
    assert.match(send, /claimNewsletterCampaignForSend/);
    assert.match(send, /updateMany/);
    assert.match(send, /List-Unsubscribe/);
    assert.match(send, /buildSignedNewsletterUnsubscribeToken/);
    assert.doesNotMatch(send, /api\.resend\.com/i);
    assert.doesNotMatch(send, /NewsletterDelivery|CampaignRecipient/);
    assert.doesNotMatch(send, /Retry failed/i);
    assert.doesNotMatch(send, /Send again/i);
    assert.doesNotMatch(send, /automatic whole-campaign retry/i);
    assert.ok(NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE <= 250);
    assert.ok(NEWSLETTER_SEND_PROVIDER_CONCURRENCY >= 3);
    assert.ok(NEWSLETTER_SEND_PROVIDER_CONCURRENCY <= 5);

    const schema = readRepo("../prisma/schema.prisma");
    assert.doesNotMatch(schema, /model NewsletterDelivery/);
    assert.doesNotMatch(schema, /model CampaignRecipient/);
  });

  it("actions derive Owner email and ignore client audience / personalization / tokens", () => {
    const actions = readRepo("app/admin/newsletter-campaign-actions.ts");
    assert.match(actions, /ownerEmail: admin\.email/);
    assert.match(actions, /canSendNewsletterCampaigns/);
    assert.doesNotMatch(actions, /subscriberIds/);
    assert.doesNotMatch(actions, /recipientEmails/);
    assert.doesNotMatch(actions, /unsubscribeToken/);
    assert.doesNotMatch(actions, /unsubscribeUrl/);
    assert.match(
      actions,
      /sendNewsletterCampaignToAudience\(\{\s*campaignId: input\.campaignId,\s*actor: auditActorFromSession\(admin\),\s*\}\)/,
    );
  });
});

describe("newsletter campaign send — orchestration", () => {
  const db = new PrismaClient();
  const suffix = `12e-${Date.now()}`;
  const prefix = `nl-12e-${suffix}-`;

  let typeId = "";
  let recipePub = "";
  let recipePub2 = "";
  let recipeDraft = "";
  let seriesId = "";
  let categoryId = "";
  let campaignId = "";
  let sendingId = "";
  let sentId = "";

  const emailAnon = `${prefix}anon@example.com`;
  const emailSeries = `${prefix}series@example.com`;
  const emailCat = `${prefix}cat@example.com`;
  const emailNoSignal = `${prefix}nosignal@example.com`;
  const emailUnsub = `${prefix}unsub@example.com`;
  const emailInvalid = `${prefix}not-an-email`;
  const emailNotifyOnly = `${prefix}notify-only@example.com`;
  const ownerEmail = `${prefix}owner@example.com`;

  const prevSecret = process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV];
  const prevPersonalization = process.env.NEWSLETTER_PERSONALIZATION_ENABLED;
  const prevResend = process.env.RESEND_API_KEY;

  before(async () => {
    process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV] = TEST_SECRET;
    delete process.env.NEWSLETTER_PERSONALIZATION_ENABLED;
    // Tests inject mailer — real key must not be required; keep unset to prove no network.
    delete process.env.RESEND_API_KEY;

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

    const userSeries = await db.user.create({
      data: { email: emailSeries, name: "Series", notify: false },
    });
    await db.userSeriesFollow.create({
      data: { userId: userSeries.id, seriesId },
    });

    const userCat = await db.user.create({
      data: { email: emailCat, name: "Cat", notify: true },
    });
    await db.userCategoryFollow.create({
      data: { userId: userCat.id, categoryId },
    });

    await db.user.create({
      data: { email: emailNoSignal, name: "NoSignal", notify: true },
    });

    const userUnsub = await db.user.create({
      data: { email: emailUnsub, name: "Unsub", notify: true },
    });
    await db.userSeriesFollow.create({
      data: { userId: userUnsub.id, seriesId },
    });

    await db.user.create({
      data: { email: emailNotifyOnly, name: "NotifyOnly", notify: true },
    });

    await subscribeNewsletterServer(emailAnon, "site", { sendEmail: silentSubscribeMailer });
    await subscribeNewsletterServer(emailSeries, "site", { sendEmail: silentSubscribeMailer });
    await subscribeNewsletterServer(emailCat, "site", { sendEmail: silentSubscribeMailer });
    await subscribeNewsletterServer(emailNoSignal, "site", { sendEmail: silentSubscribeMailer });
    await subscribeNewsletterServer(emailUnsub, "site", { sendEmail: silentSubscribeMailer });
    await db.newsletterSubscriber.update({
      where: { email: emailUnsub },
      data: { status: "unsubscribed" },
    });

    // Malformed active fixture (bypass subscribe validation).
    await db.newsletterSubscriber.create({
      data: {
        email: emailInvalid,
        status: "active",
        source: "test",
      },
    });

    const created = await createNewsletterCampaignForAdmin({
      name: `Send Campaign ${suffix}`,
      actor,
    });
    assert.equal(created.ok, true);
    if (!created.ok) throw new Error("create failed");
    campaignId = created.data.id;

    const ready = await updateNewsletterCampaignForAdmin({
      id: campaignId,
      name: `Send Campaign ${suffix}`,
      content: {
        subject: `Subject ${suffix}`,
        preheader: "Preheader",
        intro: "Intro body",
        featuredRecipeId: recipePub,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub, recipePub2],
      },
      actor,
    });
    assert.equal(ready.ok, true);

    const sending = await db.newsletterCampaign.create({
      data: {
        name: `Already Sending ${suffix}`,
        status: "sending",
        content: JSON.stringify({
          subject: "S",
          preheader: "",
          intro: "",
          featuredRecipeId: null,
          defaultRecipeIds: [recipePub2],
          candidateRecipeIds: [recipePub2],
        }),
        sendStartedAt: new Date(),
      },
    });
    sendingId = sending.id;

    const sent = await db.newsletterCampaign.create({
      data: {
        name: `Already Sent ${suffix}`,
        status: "sent",
        content: JSON.stringify({
          subject: "S",
          preheader: "",
          intro: "",
          featuredRecipeId: null,
          defaultRecipeIds: [recipePub2],
          candidateRecipeIds: [recipePub2],
        }),
        sentAt: new Date(),
        sendStartedAt: new Date(),
      },
    });
    sentId = sent.id;
  });

  after(async () => {
    if (prevSecret === undefined) delete process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV];
    else process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV] = prevSecret;
    if (prevPersonalization === undefined) delete process.env.NEWSLETTER_PERSONALIZATION_ENABLED;
    else process.env.NEWSLETTER_PERSONALIZATION_ENABLED = prevPersonalization;
    if (prevResend === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevResend;

    await db.adminAuditEvent
      .deleteMany({
        where: { entityId: { in: [campaignId, sendingId, sentId].filter(Boolean) } },
      })
      .catch(() => undefined);
    await db.newsletterCampaign.deleteMany({ where: { name: { contains: suffix } } }).catch(() => undefined);
    await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: prefix } } }).catch(() => undefined);
    await db.userSeriesFollow.deleteMany({ where: { user: { email: { startsWith: prefix } } } }).catch(() => undefined);
    await db.userCategoryFollow.deleteMany({ where: { user: { email: { startsWith: prefix } } } }).catch(() => undefined);
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } }).catch(() => undefined);
    await db.recipeCategory.deleteMany({ where: { recipeId: { in: [recipePub, recipePub2] } } }).catch(() => undefined);
    await db.seriesItem.deleteMany({ where: { recipeId: { in: [recipePub, recipePub2] } } }).catch(() => undefined);
    await db.recipe
      .deleteMany({ where: { id: { in: [recipePub, recipePub2, recipeDraft].filter(Boolean) } } })
      .catch(() => undefined);
    await db.category.deleteMany({ where: { id: categoryId } }).catch(() => undefined);
    await db.series.deleteMany({ where: { id: seriesId } }).catch(() => undefined);
    await db.recipeType.deleteMany({ where: { id: typeId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("Owner test send: one mocked call, [TEST] subject, no campaign mutation, no List-Unsubscribe", async () => {
    const before = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    const { mailer, calls } = createCapturingMailer();
    const result = await sendNewsletterCampaignTestEmail({
      campaignId,
      ownerEmail,
      actor,
      mode: "general",
      personalizationSimulation: false,
      mailer,
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.to, ownerEmail);
    assert.match(String(calls[0]!.subject), /^\[TEST\] /);
    assert.equal(calls[0]!.headers, undefined);
    assert.match(String(calls[0]!.html), new RegExp(NEWSLETTER_CAMPAIGN_TEST_FOOTER));
    assert.doesNotMatch(String(calls[0]!.html), /newsletter\/unsubscribe/i);
    assert.doesNotMatch(String(calls[0]!.html), /href=["'][^"']*unsubscribe/i);

    const after = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    assert.equal(after.status, before.status);
    assert.equal(after.sentAt, null);
    assert.equal(after.sendStartedAt, null);

    const audit = await db.adminAuditEvent.findFirst({
      where: { action: "newsletter_campaign.test_sent", entityId: campaignId },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(audit);
    assert.doesNotMatch(audit.metadata ?? "", /@example\.com/);
    assert.ok(!(audit.metadata ?? "").includes(ownerEmail));
  });

  it("not ready / missing provider / missing signing secret / zero recipients keep Draft", async () => {
    const empty = await createNewsletterCampaignForAdmin({
      name: `Empty ${suffix}`,
      actor,
    });
    assert.equal(empty.ok, true);
    if (!empty.ok) return;

    const { mailer, calls } = createCapturingMailer();
    const notReady = await sendNewsletterCampaignToAudience({
      campaignId: empty.data.id,
      actor,
      mailer,
      personalizationEnabled: false,
    });
    assert.equal(notReady.ok, false);
    assert.equal(calls.length, 0);
    const emptyRow = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: empty.data.id } });
    assert.equal(emptyRow.status, "draft");
    assert.equal(emptyRow.sendStartedAt, null);

    // Missing provider (no mailer, no RESEND_API_KEY).
    const noProvider = await sendNewsletterCampaignToAudience({
      campaignId,
      actor,
      personalizationEnabled: false,
    });
    assert.equal(noProvider.ok, false);
    assert.match(noProvider.message ?? "", /provider/i);
    const draftStill = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    assert.equal(draftStill.status, "draft");

    // Missing signing secret.
    delete process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV];
    const { mailer: mailer2, calls: calls2 } = createCapturingMailer();
    const noSecret = await sendNewsletterCampaignToAudience({
      campaignId,
      actor,
      mailer: mailer2,
      personalizationEnabled: false,
    });
    process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV] = TEST_SECRET;
    assert.equal(noSecret.ok, false);
    assert.equal(calls2.length, 0);
    assert.match(noSecret.message ?? "", /signing secret/i);

    // Zero eligible: inject recount so parallel suites cannot race this preflight.
    const zeroCamp = await createNewsletterCampaignForAdmin({
      name: `Zero ${suffix}`,
      actor,
    });
    assert.equal(zeroCamp.ok, true);
    if (!zeroCamp.ok) return;
    const zeroReady = await updateNewsletterCampaignForAdmin({
      id: zeroCamp.data.id,
      content: {
        subject: "Zero subject",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    assert.equal(zeroReady.ok, true);

    const { mailer: mailer3, calls: calls3 } = createCapturingMailer();
    const zero = await sendNewsletterCampaignToAudience({
      campaignId: zeroCamp.data.id,
      actor,
      mailer: mailer3,
      personalizationEnabled: false,
      countEligible: async () => 0,
    });
    assert.equal(zero.ok, false);
    assert.match(zero.message ?? "", /No eligible newsletter recipients/);
    assert.equal(calls3.length, 0);
    const zeroRow = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: zeroCamp.data.id } });
    assert.equal(zeroRow.status, "draft");
  });

  it("gate OFF: eligible fallback only; unsubscribed/invalid skipped; notify-only excluded", async () => {
    const { mailer, calls } = createCapturingMailer();
    // Use a dedicated campaign so we do not consume the main draft.
    const camp = await createNewsletterCampaignForAdmin({
      name: `GateOff ${suffix}`,
      actor,
    });
    assert.equal(camp.ok, true);
    if (!camp.ok) return;
    const ready = await updateNewsletterCampaignForAdmin({
      id: camp.data.id,
      content: {
        subject: `Gate off ${suffix}`,
        preheader: "",
        intro: "Intro",
        featuredRecipeId: recipePub,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub, recipePub2],
      },
      actor,
    });
    assert.equal(ready.ok, true);

    const result = await sendNewsletterCampaignToAudience({
      campaignId: camp.data.id,
      actor,
      mailer,
      personalizationEnabled: false,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.status, "sent");
    assert.equal(result.data.personalized, 0);
    assert.ok(result.data.eligible >= 4);
    assert.equal(result.data.succeeded, result.data.attempted);
    assert.ok(calls.every((c) => String(c.html).includes(NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING)));
    assert.ok(calls.every((c) => !String(c.to).includes(emailUnsub)));
    assert.ok(calls.every((c) => !String(c.to).includes(emailInvalid)));
    assert.ok(calls.every((c) => !String(c.to).includes(emailNotifyOnly)));
    assert.ok(calls.some((c) => c.to === emailSeries));
    assert.ok(calls.some((c) => c.to === emailAnon));
  });

  it("gate ON: series + category personalized; anonymous + no-signal fallback; featured dedupe", async () => {
    const { mailer, calls } = createCapturingMailer();
    const camp = await createNewsletterCampaignForAdmin({
      name: `GateOn ${suffix}`,
      actor,
    });
    assert.equal(camp.ok, true);
    if (!camp.ok) return;
    const ready = await updateNewsletterCampaignForAdmin({
      id: camp.data.id,
      content: {
        subject: `Gate on ${suffix}`,
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub, recipePub2],
      },
      actor,
    });
    assert.equal(ready.ok, true);

    const result = await sendNewsletterCampaignToAudience({
      campaignId: camp.data.id,
      actor,
      mailer,
      personalizationEnabled: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.data.personalized >= 2);
    assert.ok(result.data.fallback >= 2);

    const seriesMail = calls.find((c) => c.to === emailSeries);
    const catMail = calls.find((c) => c.to === emailCat);
    const anonMail = calls.find((c) => c.to === emailAnon);
    const noSignalMail = calls.find((c) => c.to === emailNoSignal);
    assert.ok(seriesMail);
    assert.ok(catMail);
    assert.ok(anonMail);
    assert.ok(noSignalMail);
    assert.match(String(seriesMail!.html), new RegExp(NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING));
    assert.match(String(catMail!.html), new RegExp(NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING));
    assert.doesNotMatch(String(seriesMail!.html), /series_follow|because you follow/i);
    assert.match(String(anonMail!.html), new RegExp(NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING));
    assert.match(String(noSignalMail!.html), new RegExp(NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING));

    // Featured recipePub must not repeat in the Recipe block when featured is set.
    // This case uses no featured — personalized heading present for followers.
    assert.ok(String(seriesMail!.html).includes(NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING));
  });

  it("signed unsubscribe headers + human URLs; legacy welcome token preserved; one-click works", async () => {
    const legacy = createNewsletterUnsubscribeToken();
    const sub = await subscribeNewsletterServer(`${prefix}legacy@example.com`, "site", {
      sendEmail: silentSubscribeMailer,
    });
    assert.equal(sub.ok, true);
    const subRow = await db.newsletterSubscriber.findUniqueOrThrow({
      where: { email: `${prefix}legacy@example.com` },
    });
    await db.newsletterSubscriber.update({
      where: { id: subRow.id },
      data: { unsubscribeTokenHash: legacy.tokenHash },
    });

    const { mailer, calls } = createCapturingMailer();
    const camp = await createNewsletterCampaignForAdmin({
      name: `Unsub ${suffix}`,
      actor,
    });
    assert.equal(camp.ok, true);
    if (!camp.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: camp.data.id,
      content: {
        subject: `Unsub ${suffix}`,
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });

    // Temporarily leave only this subscriber eligible among our prefix set for clearer capture —
    // keep others; just find the mail for legacy email.
    const result = await sendNewsletterCampaignToAudience({
      campaignId: camp.data.id,
      actor,
      mailer,
      personalizationEnabled: false,
    });
    assert.equal(result.ok, true);

    const mail = calls.find((c) => c.to === `${prefix}legacy@example.com`);
    assert.ok(mail);
    assert.ok(mail!.headers);
    assert.match(mail!.headers!["List-Unsubscribe"] ?? "", /one-click\?token=/);
    assert.equal(mail!.headers!["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(String(mail!.html), /\/newsletter\/unsubscribe\?token=/);
    assert.match(String(mail!.text), /\/newsletter\/unsubscribe\?token=/);
    assert.doesNotMatch(String(mail!.html), /one-click/);

    const humanMatch = String(mail!.text).match(/\/newsletter\/unsubscribe\?token=([^\s]+)/);
    assert.ok(humanMatch);
    const token = decodeURIComponent(humanMatch![1]!);
    const verified = verifySignedNewsletterUnsubscribeToken(token, TEST_SECRET);
    assert.equal(verified.valid, true);
    if (verified.valid) assert.equal(verified.subscriberId, subRow.id);

    // Multiple generations remain valid (deterministic).
    const again = verifySignedNewsletterUnsubscribeToken(token, TEST_SECRET);
    assert.equal(again.valid, true);

    // Legacy welcome token still resolves.
    const afterHash = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: subRow.id } });
    assert.equal(afterHash.unsubscribeTokenHash, legacy.tokenHash);
    const legacyResolve = resolveNewsletterUnsubscribeToken(legacy.token);
    assert.equal(legacyResolve.kind, "legacy");

    // One-click POST using captured List-Unsubscribe URL.
    const listUnsub = mail!.headers!["List-Unsubscribe"] ?? "";
    const urlMatch = listUnsub.match(/<([^>]+)>/);
    assert.ok(urlMatch);
    const oneClickUrl = urlMatch![1]!;
    const req = new Request(oneClickUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    const res1 = await oneClickPost(req);
    assert.equal(res1.status, 200);
    const res2 = await oneClickPost(
      new Request(oneClickUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );
    assert.equal(res2.status, 200);
    const unsubbed = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: subRow.id } });
    assert.equal(unsubbed.status, "unsubscribed");

    // Ensure hash helper still used for legacy path elsewhere.
    assert.equal(hashNewsletterUnsubscribeToken(legacy.token), legacy.tokenHash);
    void unsubscribeNewsletterByToken;
  });

  it("current Recipe slug/title used; draft/delete race blocks before claim", async () => {
    await db.recipe.update({
      where: { id: recipePub2 },
      data: {
        slug: `pub2-renamed-${suffix}`,
        title: `Renamed Bread ${suffix}`,
        values: JSON.stringify({ dishName: `Renamed Bread ${suffix}` }),
      },
    });

    const { mailer, calls } = createCapturingMailer();
    const camp = await createNewsletterCampaignForAdmin({
      name: `Current ${suffix}`,
      actor,
    });
    assert.equal(camp.ok, true);
    if (!camp.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: camp.data.id,
      content: {
        subject: `Current ${suffix}`,
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    const sent = await sendNewsletterCampaignToAudience({
      campaignId: camp.data.id,
      actor,
      mailer,
      personalizationEnabled: false,
    });
    assert.equal(sent.ok, true);
    assert.ok(calls.some((c) => String(c.html).includes(`Renamed Bread ${suffix}`)));
    assert.ok(calls.some((c) => String(c.html).includes(`pub2-renamed-${suffix}`)));

    // Draft race
    const race = await createNewsletterCampaignForAdmin({
      name: `RaceDraft ${suffix}`,
      actor,
    });
    assert.equal(race.ok, true);
    if (!race.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: race.data.id,
      content: {
        subject: "Race",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    await db.recipe.update({ where: { id: recipePub2 }, data: { status: "draft" } });
    const { mailer: m2, calls: c2 } = createCapturingMailer();
    const blocked = await sendNewsletterCampaignToAudience({
      campaignId: race.data.id,
      actor,
      mailer: m2,
      personalizationEnabled: false,
    });
    await db.recipe.update({
      where: { id: recipePub2 },
      data: { status: "published", publishedAt: new Date("2024-02-01T00:00:00.000Z") },
    });
    assert.equal(blocked.ok, false);
    assert.equal(c2.length, 0);
    const raceRow = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: race.data.id } });
    assert.equal(raceRow.status, "draft");
    assert.equal(raceRow.sendStartedAt, null);

    // Delete race
    const delCamp = await createNewsletterCampaignForAdmin({
      name: `RaceDel ${suffix}`,
      actor,
    });
    assert.equal(delCamp.ok, true);
    if (!delCamp.ok) return;
    const temp = await db.recipe.create({
      data: {
        slug: `temp-${suffix}`,
        title: `Temp ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date(),
        values: JSON.stringify({ dishName: `Temp ${suffix}` }),
      },
    });
    await updateNewsletterCampaignForAdmin({
      id: delCamp.data.id,
      content: {
        subject: "Del",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [temp.id],
        candidateRecipeIds: [temp.id],
      },
      actor,
    });
    await db.recipe.delete({ where: { id: temp.id } });
    const { mailer: m3, calls: c3 } = createCapturingMailer();
    const blockedDel = await sendNewsletterCampaignToAudience({
      campaignId: delCamp.data.id,
      actor,
      mailer: m3,
      personalizationEnabled: false,
    });
    assert.equal(blockedDel.ok, false);
    assert.equal(c3.length, 0);
  });

  it("partial provider failure → sent; all failures → sent; mid-send exception → sending", async () => {
    async function rowsForEmails(emails: string[]) {
      const rows = await db.newsletterSubscriber.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true, status: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return rows;
    }
    function pageLoader(emails: string[]) {
      let served = false;
      return async () => {
        if (served) return [];
        served = true;
        return rowsForEmails(emails);
      };
    }

    const emails = [
      `${prefix}p1@example.com`,
      `${prefix}p2@example.com`,
      `${prefix}p3@example.com`,
    ];
    for (const email of emails) {
      await subscribeNewsletterServer(email, "site", { sendEmail: silentSubscribeMailer });
    }

    const failSet = new Set([emails[1]!.toLowerCase()]);
    const { mailer, calls } = createCapturingMailer({ failEmails: failSet });
    const camp = await createNewsletterCampaignForAdmin({
      name: `Partial ${suffix}`,
      actor,
    });
    assert.equal(camp.ok, true);
    if (!camp.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: camp.data.id,
      content: {
        subject: "Partial",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    const partial = await sendNewsletterCampaignToAudience({
      campaignId: camp.data.id,
      actor,
      mailer,
      personalizationEnabled: false,
      countEligible: async () => 3,
      loadRecipientPage: pageLoader(emails),
    });
    assert.equal(partial.ok, true);
    if (!partial.ok) return;
    assert.equal(partial.data.status, "sent");
    assert.equal(partial.data.eligible, 3);
    assert.equal(partial.data.attempted, 3);
    assert.equal(partial.data.succeeded, 2);
    assert.equal(partial.data.failed, 1);
    assert.equal(calls.length, 3);
    assert.match(partial.data.message, /Provider accepted/i);
    assert.match(partial.data.message, /Immediate provider failures/i);
    assert.doesNotMatch(partial.data.message, /Sent successfully|Successful deliver|Delivered/i);

    const allFailEmails = [`${prefix}a1@example.com`, `${prefix}a2@example.com`];
    for (const email of allFailEmails) {
      await subscribeNewsletterServer(email, "site", { sendEmail: silentSubscribeMailer });
    }
    const { mailer: mailerAll, calls: callsAll } = createCapturingMailer({
      failEmails: new Set(allFailEmails),
    });
    const campAll = await createNewsletterCampaignForAdmin({
      name: `AllFail ${suffix}`,
      actor,
    });
    assert.equal(campAll.ok, true);
    if (!campAll.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: campAll.data.id,
      content: {
        subject: "AllFail",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    const allFail = await sendNewsletterCampaignToAudience({
      campaignId: campAll.data.id,
      actor,
      mailer: mailerAll,
      personalizationEnabled: false,
      countEligible: async () => 2,
      loadRecipientPage: pageLoader(allFailEmails),
    });
    assert.equal(allFail.ok, true);
    if (!allFail.ok) return;
    assert.equal(allFail.data.status, "sent");
    assert.equal(allFail.data.succeeded, 0);
    assert.equal(allFail.data.failed, 2);
    assert.equal(callsAll.length, 2);

    const midEmails = [`${prefix}m1@example.com`, `${prefix}m2@example.com`];
    for (const email of midEmails) {
      await subscribeNewsletterServer(email, "site", { sendEmail: silentSubscribeMailer });
    }
    const { mailer: mailerMid } = createCapturingMailer({ throwAfterSuccesses: 1 });
    const campMid = await createNewsletterCampaignForAdmin({
      name: `Mid ${suffix}`,
      actor,
    });
    assert.equal(campMid.ok, true);
    if (!campMid.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: campMid.data.id,
      content: {
        subject: "Mid",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    const mid = await sendNewsletterCampaignToAudience({
      campaignId: campMid.data.id,
      actor,
      mailer: mailerMid,
      personalizationEnabled: false,
      countEligible: async () => 2,
      loadRecipientPage: pageLoader(midEmails),
    });
    assert.equal(mid.ok, true);
    if (!mid.ok) return;
    assert.equal(mid.data.status, "sending");
    assert.ok(mid.data.attempted > 0);
    const midRow = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: campMid.data.id } });
    assert.equal(midRow.status, "sending");
    assert.ok(midRow.sendStartedAt);
    assert.equal(midRow.sentAt, null);

    const { mailer: mailerRetry, calls: callsRetry } = createCapturingMailer();
    const retry = await sendNewsletterCampaignToAudience({
      campaignId: campMid.data.id,
      actor,
      mailer: mailerRetry,
      personalizationEnabled: false,
    });
    assert.equal(retry.ok, false);
    assert.equal(callsRetry.length, 0);
  });

  it("pre-attempt failure releases claim to draft; concurrent claim is race-safe", async () => {
    const camp = await createNewsletterCampaignForAdmin({
      name: `PreAttempt ${suffix}`,
      actor,
    });
    assert.equal(camp.ok, true);
    if (!camp.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: camp.data.id,
      content: {
        subject: "Pre",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    const { mailer, calls } = createCapturingMailer();
    const result = await sendNewsletterCampaignToAudience({
      campaignId: camp.data.id,
      actor,
      mailer,
      personalizationEnabled: false,
      onAfterClaim: async () => {
        throw new Error("pre-attempt boom");
      },
    });
    assert.equal(result.ok, false);
    assert.equal(calls.length, 0);
    const row = await db.newsletterCampaign.findUniqueOrThrow({ where: { id: camp.data.id } });
    assert.equal(row.status, "draft");
    assert.equal(row.sendStartedAt, null);
    assert.equal(row.sentAt, null);

    // Concurrent claim
    const camp2 = await createNewsletterCampaignForAdmin({
      name: `Concurrent ${suffix}`,
      actor,
    });
    assert.equal(camp2.ok, true);
    if (!camp2.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: camp2.data.id,
      content: {
        subject: "Concurrent",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });

    // Slow mailer so second request races on claim
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let callCount = 0;
    const slowMailer = async () => {
      callCount += 1;
      await gate;
      return { ok: true as const, id: `slow-${callCount}` };
    };

    const p1 = sendNewsletterCampaignToAudience({
      campaignId: camp2.data.id,
      actor,
      mailer: slowMailer,
      personalizationEnabled: false,
      countEligible: async () => 1,
      loadRecipientPage: async (cursor) => {
        if (cursor) return [];
        const row = await db.newsletterSubscriber.findFirst({
          where: { email: emailAnon },
          select: { id: true, email: true, status: true },
        });
        return row ? [row] : [];
      },
    });
    // Give first claim a moment
    await new Promise((r) => setTimeout(r, 50));
    const p2 = sendNewsletterCampaignToAudience({
      campaignId: camp2.data.id,
      actor,
      mailer: createCapturingMailer().mailer,
      personalizationEnabled: false,
    });
    const second = await p2;
    release();
    const first = await p1;
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(second.code, "locked");

    // Sent / Sending reject
    const { mailer: mSent, calls: cSent } = createCapturingMailer();
    const sentReject = await sendNewsletterCampaignToAudience({
      campaignId: sentId,
      actor,
      mailer: mSent,
    });
    assert.equal(sentReject.ok, false);
    assert.equal(cSent.length, 0);

    const { mailer: mSending, calls: cSending } = createCapturingMailer();
    const sendingReject = await sendNewsletterCampaignToAudience({
      campaignId: sendingId,
      actor,
      mailer: mSending,
    });
    assert.equal(sendingReject.ok, false);
    assert.equal(cSending.length, 0);

    // Direct claim helper race
    const camp3 = await createNewsletterCampaignForAdmin({
      name: `ClaimRace ${suffix}`,
      actor,
    });
    assert.equal(camp3.ok, true);
    if (!camp3.ok) return;
    const [cA, cB] = await Promise.all([
      claimNewsletterCampaignForSend(camp3.data.id),
      claimNewsletterCampaignForSend(camp3.data.id),
    ]);
    const wins = [cA, cB].filter((c) => c.ok).length;
    assert.equal(wins, 1);
  });

  it("audit metadata stays aggregate-only (no PII / tokens / HTML)", async () => {
    const audits = await db.adminAuditEvent.findMany({
      where: {
        action: {
          in: [
            "newsletter_campaign.sent",
            "newsletter_campaign.send_failed",
            "newsletter_campaign.send_started",
            "newsletter_campaign.test_sent",
          ],
        },
        entityId: { contains: "" },
        OR: [{ entityLabel: { contains: suffix } }, { entityId: { in: [campaignId, sendingId, sentId] } }],
      },
      take: 50,
    });
    assert.ok(audits.length > 0);
    for (const row of audits) {
      const meta = row.metadata ?? "";
      assert.doesNotMatch(meta, /@example\.com/);
      assert.doesNotMatch(meta, /v1\./);
      assert.doesNotMatch(meta, /<html/i);
      assert.doesNotMatch(meta, /subscriberId|userId|followId/i);
      assert.doesNotMatch(meta, /List-Unsubscribe/);
    }
  });

  it("client personalization tampering ignored when env OFF (server injection only for tests)", async () => {
    // Production action path does not accept personalizationEnabled — covered by source contract.
    // Env OFF default: without injection, send uses isNewsletterPersonalizationEnabled() === false.
    delete process.env.NEWSLETTER_PERSONALIZATION_ENABLED;
    const camp = await createNewsletterCampaignForAdmin({
      name: `TamperGate ${suffix}`,
      actor,
    });
    assert.equal(camp.ok, true);
    if (!camp.ok) return;
    await updateNewsletterCampaignForAdmin({
      id: camp.data.id,
      content: {
        subject: "Tamper",
        preheader: "",
        intro: "Intro",
        featuredRecipeId: null,
        defaultRecipeIds: [recipePub2],
        candidateRecipeIds: [recipePub2],
      },
      actor,
    });
    const { mailer, calls } = createCapturingMailer();
    const result = await sendNewsletterCampaignToAudience({
      campaignId: camp.data.id,
      actor,
      mailer,
      // omit personalizationEnabled → env OFF
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.personalizationEnabled, false);
    assert.equal(result.data.personalized, 0);
    assert.ok(calls.every((c) => String(c.html).includes(NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING)));
  });
});
