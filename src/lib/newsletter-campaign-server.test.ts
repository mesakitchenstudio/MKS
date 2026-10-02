/**
 * Phase 12C — NewsletterCampaign persistence + Recipe resolver tests.
 * Local DB only. No Production. No Resend.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  getNewsletterCampaignSendReadiness,
  normalizeNewsletterCampaignContent,
  serializeNewsletterCampaignContent,
} from "./newsletter-campaign.ts";
import {
  createNewsletterCampaignDraft,
  getNewsletterCampaignById,
  resolveNewsletterCampaignRecipeImageUrl,
  resolveNewsletterCampaignRecipes,
  updateNewsletterCampaignDraftContent,
} from "./newsletter-campaign-server.ts";
import { subscribeNewsletterServer } from "./newsletter-subscribe.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const silentMailer = async () => ({ ok: true as const });

describe("newsletter campaign — persistence foundation", () => {
  const db = new PrismaClient();
  const suffix = `12c-${Date.now()}`;
  let typeId = "";
  let recipeA = "";
  let recipeB = "";
  let recipeDraft = "";
  let seriesId = "";
  let categoryId = "";
  let campaignId = "";

  before(async () => {
    await db.$connect();

    const type = await db.recipeType.create({
      data: {
        slug: `nl-type-${suffix}`,
        name: `NL Type ${suffix}`,
      },
    });
    typeId = type.id;

    const series = await db.series.create({
      data: {
        slug: `nl-series-${suffix}`,
        title: `NL Series ${suffix}`,
        isPublished: true,
      },
    });
    seriesId = series.id;

    const category = await db.category.create({
      data: {
        slug: `nl-cat-${suffix}`,
        name: `NL Cat ${suffix}`,
        group: "desserts",
      },
    });
    categoryId = category.id;

    const a = await db.recipe.create({
      data: {
        slug: `nl-a-${suffix}`,
        title: `Original Title ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date("2024-01-01T00:00:00.000Z"),
        values: JSON.stringify({
          dishName: `Dish A ${suffix}`,
          image: "https://cdn.example.com/a.jpg",
          imageAlt: "Alt A",
        }),
      },
    });
    recipeA = a.id;

    const b = await db.recipe.create({
      data: {
        slug: `nl-b-${suffix}`,
        title: `Recipe B ${suffix}`,
        typeId,
        status: "published",
        publishedAt: new Date("2024-02-01T00:00:00.000Z"),
        values: JSON.stringify({}),
      },
    });
    recipeB = b.id;

    const draft = await db.recipe.create({
      data: {
        slug: `nl-draft-${suffix}`,
        title: `Draft ${suffix}`,
        typeId,
        status: "draft",
        values: "{}",
      },
    });
    recipeDraft = draft.id;

    await db.recipeCategory.create({
      data: { recipeId: recipeA, categoryId },
    });
    await db.seriesItem.create({
      data: { seriesId, recipeId: recipeA, sortOrder: 0 },
    });
  });

  after(async () => {
    if (campaignId) {
      await db.newsletterCampaign.deleteMany({ where: { id: campaignId } });
    }
    await db.newsletterCampaign.deleteMany({
      where: { name: { contains: suffix } },
    });
    await db.seriesItem.deleteMany({ where: { seriesId } });
    await db.recipeCategory.deleteMany({
      where: { recipeId: { in: [recipeA, recipeB, recipeDraft].filter(Boolean) } },
    });
    await db.recipe.deleteMany({
      where: { id: { in: [recipeA, recipeB, recipeDraft].filter(Boolean) } },
    });
    if (seriesId) await db.series.deleteMany({ where: { id: seriesId } });
    if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
    if (typeId) await db.recipeType.deleteMany({ where: { id: typeId } });
    await db.$disconnect();
  });

  it("creates Draft campaign with defaults null sentAt/sendStartedAt", async () => {
    const created = await createNewsletterCampaignDraft({
      name: `Campaign ${suffix}`,
      content: {
        subject: "Hello Mesa",
        intro: "Intro copy",
        featuredRecipeId: recipeA,
        defaultRecipeIds: [recipeB],
        candidateRecipeIds: [recipeA, recipeB],
      },
    });
    campaignId = created.id;
    assert.equal(created.status, "draft");
    assert.equal(created.sentAt, null);
    assert.equal(created.sendStartedAt, null);
    assert.equal(created.content.featuredRecipeId, recipeA);
    assert.ok(created.content.candidateRecipeIds.includes(recipeB));

    const loaded = await getNewsletterCampaignById(created.id);
    assert.equal(loaded?.name, `Campaign ${suffix}`);
  });

  it("updates Draft content; rejects non-draft edit", async () => {
    assert.ok(campaignId);
    const updated = await updateNewsletterCampaignDraftContent({
      id: campaignId,
      content: {
        subject: "Updated subject",
        intro: "Updated intro",
        defaultRecipeIds: [recipeA],
        candidateRecipeIds: [recipeA, recipeB],
      },
    });
    assert.equal(updated?.content.subject, "Updated subject");

    await db.newsletterCampaign.update({
      where: { id: campaignId },
      data: { status: "sent", sentAt: new Date() },
    });
    await assert.rejects(
      () =>
        updateNewsletterCampaignDraftContent({
          id: campaignId,
          name: "Nope",
        }),
      /draft/i,
    );
    await db.newsletterCampaign.update({
      where: { id: campaignId },
      data: { status: "draft", sentAt: null },
    });
  });

  it("resolves current title/slug/status/memberships without N+1 pattern", async () => {
    await db.recipe.update({
      where: { id: recipeA },
      data: {
        slug: `nl-a-renamed-${suffix}`,
        title: `Renamed Title ${suffix}`,
        values: JSON.stringify({
          dishName: `New Dish ${suffix}`,
          image: "/uploads/test.jpg",
        }),
      },
    });

    const map = await resolveNewsletterCampaignRecipes([recipeA, recipeB, "missing-id"], {
      baseUrl: "https://www.mesakitchenstudio.com",
    });
    assert.equal(map.size, 2);
    const a = map.get(recipeA);
    assert.equal(a?.slug, `nl-a-renamed-${suffix}`);
    assert.equal(a?.title, `New Dish ${suffix}`);
    assert.ok(a?.seriesIds.includes(seriesId));
    assert.ok(a?.categoryIds.includes(categoryId));
    assert.equal(a?.imageUrl, "https://www.mesakitchenstudio.com/uploads/test.jpg");

    const server = readRepo("lib/newsletter-campaign-server.ts");
    assert.match(server, /findMany/);
    assert.match(server, /id: \{ in: ids \}/);
  });

  it("send readiness uses current status (Draft target not ready)", async () => {
    const map = await resolveNewsletterCampaignRecipes([recipeA, recipeDraft]);
    const ready = getNewsletterCampaignSendReadiness({
      name: "X",
      status: "draft",
      content: {
        subject: "Hi",
        defaultRecipeIds: [recipeDraft],
        candidateRecipeIds: [recipeDraft],
      },
      resolvedRecipes: map,
    });
    assert.equal(ready.ready, false);
    assert.ok(ready.issues.some((issue) => issue.code === "draft_default_recipe"));

    const ok = getNewsletterCampaignSendReadiness({
      name: "X",
      status: "draft",
      content: {
        subject: "Hi",
        defaultRecipeIds: [recipeA],
        candidateRecipeIds: [recipeA],
      },
      resolvedRecipes: map,
    });
    assert.equal(ok.ready, true);
  });

  it("image URL helper rejects javascript and accepts https/relative", () => {
    assert.equal(resolveNewsletterCampaignRecipeImageUrl("javascript:alert(1)"), null);
    assert.equal(
      resolveNewsletterCampaignRecipeImageUrl("https://cdn.example.com/x.jpg"),
      "https://cdn.example.com/x.jpg",
    );
    assert.equal(
      resolveNewsletterCampaignRecipeImageUrl("/img.jpg", "https://www.mesakitchenstudio.com"),
      "https://www.mesakitchenstudio.com/img.jpg",
    );
  });

  it("subscribe does not create NewsletterCampaign rows", async () => {
    const email = `nl-camp-sub-${suffix}@example.com`;
    const subscribeSrc = readFileSync(
      path.join(root, "newsletter-subscribe.ts"),
      "utf8",
    );
    assert.doesNotMatch(subscribeSrc, /newsletterCampaign|NewsletterCampaign/);
    await subscribeNewsletterServer(email, "site", { sendEmail: silentMailer });
    // Attribute by subscribe fixture marker — avoid global count races with parallel suites.
    const campaigns = await db.newsletterCampaign.findMany({
      where: {
        OR: [
          { name: { contains: email } },
          { name: { contains: `nl-camp-sub-${suffix}` } },
        ],
      },
    });
    assert.equal(campaigns.length, 0);
    await db.newsletterSubscriber.deleteMany({ where: { email } });
  });

  it("migration SQL is additive-only", () => {
    const sql = readFileSync(
      path.join(root, "..", "..", "prisma", "migrations", "20261002080000_newsletter_campaign_foundation", "migration.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TABLE "NewsletterCampaign"/);
    assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|ALTER TABLE "NewsletterSubscriber"|ALTER TABLE "User"|ALTER TABLE "Recipe"/i);
    assert.doesNotMatch(sql, /UPDATE "NewsletterSubscriber"|DELETE FROM/i);

    const schema = readRepo("../prisma/schema.prisma");
    assert.match(schema, /model NewsletterCampaign/);
    assert.match(schema, /sendStartedAt/);
  });

  it("content serialization stores IDs only", () => {
    const json = serializeNewsletterCampaignContent(
      normalizeNewsletterCampaignContent({
        subject: "S",
        defaultRecipeIds: [recipeA],
        candidateRecipeIds: [recipeA],
      }),
    );
    assert.doesNotMatch(json, /nl-a-renamed|New Dish|cdn\.example/);
    assert.match(json, new RegExp(recipeA));
  });
});
