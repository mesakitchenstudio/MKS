/**
 * Phase 12B — Batched interest-profile loader + consent separation tests.
 * READ-ONLY profile loading. No campaign persistence. No Resend sends in assertions
 * beyond silent mailer for subscribe fixtures.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  NEWSLETTER_INTEREST_PROFILE_BATCH_MAX,
  loadNewsletterInterestProfilesForEmails,
} from "./newsletter-interest-profile-server.ts";
import { isNewsletterRecipientEligible } from "./newsletter-personalization.ts";
import { subscribeNewsletterServer } from "./newsletter-subscribe.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const silentMailer = async () => ({ ok: true as const });

describe("newsletter interest profile loader", () => {
  const db = new PrismaClient();
  const suffix = `12b-${Date.now()}`;
  const prefix = `nl-prof-${suffix}-`;

  let seriesBreadId = "";
  let seriesOtherId = "";
  let catDessertId = "";
  let catCourseId = "";
  let userFollowsId = "";
  let userNoSignalId = "";
  let userUnsubId = "";
  let userNoSubId = "";

  const emailFollows = `${prefix}follows@example.com`;
  const emailNoSignal = `${prefix}nosignal@example.com`;
  const emailAnon = `${prefix}anon@example.com`;
  const emailUnsub = `${prefix}unsub@example.com`;
  const emailNoSub = `${prefix}nosub@example.com`;
  const emailNotifyOnly = `${prefix}notify-only@example.com`;

  before(async () => {
    await db.$connect();

    const seriesBread = await db.series.create({
      data: {
        slug: `breads-${suffix}`,
        title: `Breads ${suffix}`,
        isPublished: true,
      },
    });
    seriesBreadId = seriesBread.id;

    const seriesOther = await db.series.create({
      data: {
        slug: `other-${suffix}`,
        title: `Other ${suffix}`,
        isPublished: true,
      },
    });
    seriesOtherId = seriesOther.id;

    const catDessert = await db.category.create({
      data: {
        slug: `desserts-${suffix}`,
        name: `Desserts ${suffix}`,
        group: "desserts",
      },
    });
    catDessertId = catDessert.id;

    const catCourse = await db.category.create({
      data: {
        slug: `course-${suffix}`,
        name: `Course ${suffix}`,
        group: "course",
      },
    });
    catCourseId = catCourse.id;

    const userFollows = await db.user.create({
      data: {
        email: emailFollows,
        name: "Follows",
        notify: false,
      },
    });
    userFollowsId = userFollows.id;

    const userNoSignal = await db.user.create({
      data: {
        email: emailNoSignal,
        name: "NoSignal",
        notify: false,
      },
    });
    userNoSignalId = userNoSignal.id;

    const userUnsub = await db.user.create({
      data: {
        email: emailUnsub,
        name: "Unsub",
        notify: true,
      },
    });
    userUnsubId = userUnsub.id;

    const userNoSub = await db.user.create({
      data: {
        email: emailNoSub,
        name: "NoSub",
        notify: true,
      },
    });
    userNoSubId = userNoSub.id;

    await db.user.create({
      data: {
        email: emailNotifyOnly,
        name: "NotifyOnly",
        notify: true,
      },
    });

    // Insert follows in reverse alpha order — profile must canonicalize.
    await db.userSeriesFollow.create({
      data: { userId: userFollowsId, seriesId: seriesOtherId },
    });
    await db.userSeriesFollow.create({
      data: { userId: userFollowsId, seriesId: seriesBreadId },
    });
    await db.userCategoryFollow.create({
      data: { userId: userFollowsId, categoryId: catCourseId },
    });
    await db.userCategoryFollow.create({
      data: { userId: userFollowsId, categoryId: catDessertId },
    });

    await db.userSeriesFollow.create({
      data: { userId: userUnsubId, seriesId: seriesBreadId },
    });
    await db.userSeriesFollow.create({
      data: { userId: userNoSubId, seriesId: seriesBreadId },
    });

    await subscribeNewsletterServer(emailFollows, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailNoSignal, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailAnon, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailUnsub, "site", { sendEmail: silentMailer });
    await db.newsletterSubscriber.update({
      where: { email: emailUnsub },
      data: { status: "unsubscribed", unsubscribedAt: new Date() },
    });
  });

  after(async () => {
    await db.userSeriesFollow.deleteMany({
      where: { userId: { in: [userFollowsId, userUnsubId, userNoSubId].filter(Boolean) } },
    });
    await db.userCategoryFollow.deleteMany({
      where: { userId: { in: [userFollowsId].filter(Boolean) } },
    });
    await db.newsletterSubscriber.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.series.deleteMany({
      where: { id: { in: [seriesBreadId, seriesOtherId].filter(Boolean) } },
    });
    await db.category.deleteMany({
      where: { id: { in: [catDessertId, catCourseId].filter(Boolean) } },
    });
    await db.$disconnect();
  });

  it("anonymous active subscriber → empty profile, no userId", async () => {
    const { profiles } = await loadNewsletterInterestProfilesForEmails([emailAnon]);
    const profile = profiles.get(emailAnon);
    assert.ok(profile);
    assert.equal(profile?.userId ?? null, null);
    assert.deepEqual(profile?.followedSeriesIds, []);
    assert.deepEqual(profile?.followedCategoryIds, []);
  });

  it("linked no-signal member → userId, empty follows", async () => {
    const { profiles } = await loadNewsletterInterestProfilesForEmails([emailNoSignal]);
    const profile = profiles.get(emailNoSignal);
    assert.equal(profile?.userId, userNoSignalId);
    assert.deepEqual(profile?.followedSeriesIds, []);
    assert.deepEqual(profile?.followedCategoryIds, []);
  });

  it("Series + Category follows populate sorted stable IDs", async () => {
    const { profiles } = await loadNewsletterInterestProfilesForEmails([
      `  ${emailFollows.toUpperCase()}  `,
      emailFollows,
    ]);
    assert.equal(profiles.size, 1);
    const profile = profiles.get(emailFollows);
    assert.equal(profile?.userId, userFollowsId);
    assert.deepEqual(profile?.followedSeriesIds, [seriesBreadId, seriesOtherId].sort());
    assert.deepEqual(profile?.followedCategoryIds, [catCourseId, catDessertId].sort());
  });

  it("case-insensitive email + input dedupe", async () => {
    const { emails, profiles } = await loadNewsletterInterestProfilesForEmails([
      emailFollows,
      emailFollows.toUpperCase(),
      ` ${emailFollows} `,
    ]);
    assert.deepEqual(emails, [emailFollows]);
    assert.equal(profiles.size, 1);
  });

  it("batch bound truncates without N+1 contract issues", async () => {
    assert.equal(NEWSLETTER_INTEREST_PROFILE_BATCH_MAX, 500);
    const many = Array.from({ length: NEWSLETTER_INTEREST_PROFILE_BATCH_MAX + 3 }, (_, i) =>
      `${prefix}batch-${i}@example.com`,
    );
    const result = await loadNewsletterInterestProfilesForEmails(many);
    assert.equal(result.truncated, true);
    assert.equal(result.emails.length, NEWSLETTER_INTEREST_PROFILE_BATCH_MAX);
  });

  it("loader source uses ≤3 queries pattern (contract)", () => {
    const src = readRepo("lib/newsletter-interest-profile-server.ts");
    assert.match(src, /user\.findMany/);
    assert.match(src, /userSeriesFollow\.findMany/);
    assert.match(src, /userCategoryFollow\.findMany/);
    assert.match(src, /Promise\.all/);
    assert.doesNotMatch(src, /for \(.*userId[\s\S]*findUnique/);
    assert.doesNotMatch(src, /newsletterSubscriber\.(update|create|delete)/);
    assert.doesNotMatch(src, /user\.(update|create|delete)/);
    assert.doesNotMatch(src, /userSeriesFollow\.(create|update|delete)/);
    assert.doesNotMatch(src, /userCategoryFollow\.(create|update|delete)/);
    assert.doesNotMatch(src, /RecipeSave|SearchEvent|MealPlan|recently-viewed/i);
  });

  it("loading profiles does not write NewsletterSubscriber / follows", async () => {
    const beforeSub = await db.newsletterSubscriber.findUnique({
      where: { email: emailFollows },
    });
    const beforeSeries = await db.userSeriesFollow.count({
      where: { userId: userFollowsId },
    });
    const beforeCats = await db.userCategoryFollow.count({
      where: { userId: userFollowsId },
    });
    const beforeUpdatedAt = beforeSub?.updatedAt?.getTime();

    await loadNewsletterInterestProfilesForEmails([emailFollows, emailAnon, emailNoSignal]);

    const afterSub = await db.newsletterSubscriber.findUnique({
      where: { email: emailFollows },
    });
    assert.equal(afterSub?.status, beforeSub?.status);
    assert.equal(afterSub?.updatedAt?.getTime(), beforeUpdatedAt);
    assert.equal(
      await db.userSeriesFollow.count({ where: { userId: userFollowsId } }),
      beforeSeries,
    );
    assert.equal(
      await db.userCategoryFollow.count({ where: { userId: userFollowsId } }),
      beforeCats,
    );
  });
});

describe("newsletter personalization — consent ≠ interest", () => {
  const db = new PrismaClient();
  const suffix = `12b-consent-${Date.now()}`;
  const prefix = `nl-consent-${suffix}-`;
  const emailFollowsNoSub = `${prefix}follows-nosub@example.com`;
  const emailUnsubFollows = `${prefix}unsub-follows@example.com`;
  const emailActiveAnon = `${prefix}active-anon@example.com`;
  const emailActiveNotifyFalse = `${prefix}active-notify-false@example.com`;
  const emailNotifyTrueNoSub = `${prefix}notify-true-nosub@example.com`;

  let seriesId = "";
  let userFollowsNoSubId = "";
  let userUnsubId = "";

  before(async () => {
    await db.$connect();
    const series = await db.series.create({
      data: { slug: `consent-${suffix}`, title: `Consent ${suffix}`, isPublished: true },
    });
    seriesId = series.id;

    const userFollowsNoSub = await db.user.create({
      data: { email: emailFollowsNoSub, name: "F", notify: false },
    });
    userFollowsNoSubId = userFollowsNoSub.id;
    await db.userSeriesFollow.create({
      data: { userId: userFollowsNoSubId, seriesId },
    });

    const userUnsub = await db.user.create({
      data: { email: emailUnsubFollows, name: "U", notify: true },
    });
    userUnsubId = userUnsub.id;
    await db.userSeriesFollow.create({
      data: { userId: userUnsubId, seriesId },
    });
    await subscribeNewsletterServer(emailUnsubFollows, "site", { sendEmail: silentMailer });
    await db.newsletterSubscriber.update({
      where: { email: emailUnsubFollows },
      data: { status: "unsubscribed", unsubscribedAt: new Date() },
    });

    await subscribeNewsletterServer(emailActiveAnon, "site", { sendEmail: silentMailer });

    await db.user.create({
      data: { email: emailActiveNotifyFalse, name: "N", notify: false },
    });
    await subscribeNewsletterServer(emailActiveNotifyFalse, "site", {
      sendEmail: silentMailer,
    });

    await db.user.create({
      data: { email: emailNotifyTrueNoSub, name: "T", notify: true },
    });
  });

  after(async () => {
    await db.userSeriesFollow.deleteMany({
      where: { userId: { in: [userFollowsNoSubId, userUnsubId].filter(Boolean) } },
    });
    await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    if (seriesId) await db.series.deleteMany({ where: { id: seriesId } });
    await db.$disconnect();
  });

  it("User with follows but no NewsletterSubscriber is NOT a recipient", async () => {
    const row = await db.newsletterSubscriber.findUnique({
      where: { email: emailFollowsNoSub },
    });
    assert.equal(row, null);
    assert.equal(isNewsletterRecipientEligible(row), false);

    // Profile can still be built if orchestration mistakenly calls loader —
    // but missing NewsletterSubscriber means they are not a recipient (interest ≠ consent).
    const { profiles } = await loadNewsletterInterestProfilesForEmails([emailFollowsNoSub]);
    assert.ok((profiles.get(emailFollowsNoSub)?.followedSeriesIds.length ?? 0) > 0);
    assert.equal(await db.newsletterSubscriber.count({ where: { email: emailFollowsNoSub } }), 0);
  });

  it("unsubscribed follower is NOT eligible despite follows", async () => {
    const row = await db.newsletterSubscriber.findUnique({
      where: { email: emailUnsubFollows },
    });
    assert.equal(row?.status, "unsubscribed");
    assert.equal(isNewsletterRecipientEligible(row), false);
    const { profiles } = await loadNewsletterInterestProfilesForEmails([emailUnsubFollows]);
    assert.ok((profiles.get(emailUnsubFollows)?.followedSeriesIds.length ?? 0) > 0);
  });

  it("active anonymous subscriber IS eligible", async () => {
    const row = await db.newsletterSubscriber.findUnique({
      where: { email: emailActiveAnon },
    });
    assert.equal(row?.status, "active");
    assert.equal(isNewsletterRecipientEligible(row), true);
  });

  it("User.notify=false + active subscriber → newsletter eligible", async () => {
    const user = await db.user.findUnique({ where: { email: emailActiveNotifyFalse } });
    assert.equal(user?.notify, false);
    const row = await db.newsletterSubscriber.findUnique({
      where: { email: emailActiveNotifyFalse },
    });
    assert.equal(isNewsletterRecipientEligible(row), true);
  });

  it("User.notify=true + no subscriber → NOT newsletter eligible", async () => {
    const user = await db.user.findUnique({ where: { email: emailNotifyTrueNoSub } });
    assert.equal(user?.notify, true);
    const row = await db.newsletterSubscriber.findUnique({
      where: { email: emailNotifyTrueNoSub },
    });
    assert.equal(row, null);
    assert.equal(isNewsletterRecipientEligible(row), false);
  });
});
