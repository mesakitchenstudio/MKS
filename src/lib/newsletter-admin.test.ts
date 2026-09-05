import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { canAccess } from "./admin-access";
import { adminWorkspaceWidthForPath, buildAdminNavSections, flattenAdminNavItemLabels } from "./admin-nav";
import { adminWorkspaceNewsletter } from "./admin-ui";
import {
  NEWSLETTER_ADMIN_PAGE_SIZE,
  emptyStateForNewsletterList,
  getNewsletterSubscriberCounts,
  listNewsletterSubscribersForAdmin,
  newsletterStatusLabel,
  parseNewsletterStatusFilter,
} from "./newsletter-admin";
import { createNewsletterUnsubscribeToken } from "./newsletter-unsubscribe";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("newsletter admin permissions and nav", () => {
  it("Owner and Audience can access members area; Editor cannot", () => {
    assert.equal(canAccess("owner", "members"), true);
    assert.equal(canAccess("members", "members"), true);
    assert.equal(canAccess("editor", "members"), false);
  });

  it("places Newsletter under Community after Members", () => {
    const owner = flattenAdminNavItemLabels(buildAdminNavSections("owner"));
    const membersIdx = owner.indexOf("Members");
    const newsletterIdx = owner.indexOf("Newsletter");
    assert.ok(membersIdx >= 0);
    assert.equal(newsletterIdx, membersIdx + 1);

    const community = buildAdminNavSections("owner").find((s) => s.id === "community");
    assert.deepEqual(
      community?.items.map((item) => item.label),
      ["Reviews", "Members", "Newsletter"],
    );
    assert.equal(
      community?.items.find((item) => item.label === "Newsletter")?.href,
      "/admin/newsletter",
    );
    assert.equal(
      community?.items.find((item) => item.label === "Newsletter")?.area,
      "members",
    );
  });

  it("shows Newsletter for Audience and hides it for Editor", () => {
    const audience = flattenAdminNavItemLabels(buildAdminNavSections("members"));
    assert.deepEqual(audience, ["Members", "Newsletter", "Visitors"]);

    const editor = flattenAdminNavItemLabels(buildAdminNavSections("editor"));
    assert.equal(editor.includes("Newsletter"), false);
    assert.equal(editor.includes("Members"), false);
  });

  it("gates the page with requireAccess members", () => {
    const page = read("app/admin/(app)/newsletter/page.tsx");
    assert.match(page, /requireAccess\("members"\)/);
    assert.match(page, /title:\s*"Newsletter"/);
    assert.doesNotMatch(page, /unsubscribeTokenHash/);
  });
});

describe("newsletter admin list helpers", () => {
  it("defaults status filter to active", () => {
    assert.equal(parseNewsletterStatusFilter(undefined), "active");
    assert.equal(parseNewsletterStatusFilter(""), "active");
    assert.equal(parseNewsletterStatusFilter("bogus"), "active");
    assert.equal(parseNewsletterStatusFilter("unsubscribed"), "unsubscribed");
    assert.equal(parseNewsletterStatusFilter("all"), "all");
  });

  it("labels statuses quietly", () => {
    assert.equal(newsletterStatusLabel("active"), "Active");
    assert.equal(newsletterStatusLabel("unsubscribed"), "Unsubscribed");
    assert.equal(newsletterStatusLabel(undefined), "Active");
  });

  it("picks calm empty-state copy", () => {
    assert.equal(
      emptyStateForNewsletterList({ status: "active", q: "", total: 0 }),
      "No active subscribers yet.",
    );
    assert.equal(
      emptyStateForNewsletterList({ status: "all", q: "", total: 0 }),
      "No newsletter subscribers yet.",
    );
    assert.equal(
      emptyStateForNewsletterList({ status: "active", q: "mesa", total: 0 }),
      "No subscribers match this search.",
    );
    assert.equal(emptyStateForNewsletterList({ status: "all", q: "", total: 3 }), null);
  });

  it("uses 50 as the admin page size", () => {
    assert.equal(NEWSLETTER_ADMIN_PAGE_SIZE, 50);
  });

  it("uses Members-list workspace width", () => {
    assert.equal(adminWorkspaceNewsletter, "max-w-5xl");
    assert.equal(adminWorkspaceWidthForPath("/admin/newsletter"), adminWorkspaceNewsletter);
  });
});

describe("newsletter admin query + security contracts", () => {
  const db = new PrismaClient();
  const prefix = `nl-admin-${Date.now()}-`;

  before(async () => {
    await db.$connect();
  });

  after(async () => {
    await db.newsletterSubscriber.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await db.$disconnect();
  });

  it("lists newest first, filters by status, searches email, and never returns token hash", async () => {
    const older = `${prefix}older@example.com`;
    const newer = `${prefix}Newer@example.com`;
    const gone = `${prefix}gone@example.com`;
    const { tokenHash } = createNewsletterUnsubscribeToken();

    await db.newsletterSubscriber.create({
      data: {
        email: older,
        source: "site",
        status: "active",
        createdAt: new Date("2026-08-01T12:00:00.000Z"),
      },
    });
    await db.newsletterSubscriber.create({
      data: {
        email: newer.toLowerCase(),
        source: "footer",
        status: "active",
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    });
    await db.newsletterSubscriber.create({
      data: {
        email: gone,
        source: "site",
        status: "unsubscribed",
        unsubscribeTokenHash: tokenHash,
        createdAt: new Date("2026-08-20T12:00:00.000Z"),
        unsubscribedAt: new Date("2026-09-05T12:00:00.000Z"),
      },
    });

    const active = await listNewsletterSubscribersForAdmin({
      status: "active",
      q: prefix,
    });
    assert.equal(active.rows.length, 2);
    assert.equal(active.rows[0]?.email, newer.toLowerCase());
    assert.equal(active.rows[1]?.email, older);
    assert.equal(active.rows[0]?.source, "footer");
    for (const row of active.rows) {
      assert.equal("unsubscribeTokenHash" in row, false);
      assert.equal("id" in row, false);
    }

    const unsubscribed = await listNewsletterSubscribersForAdmin({
      status: "unsubscribed",
      q: prefix,
    });
    assert.equal(unsubscribed.rows.length, 1);
    assert.equal(unsubscribed.rows[0]?.email, gone);
    assert.ok(unsubscribed.rows[0]?.unsubscribedAt);
    assert.equal("unsubscribeTokenHash" in unsubscribed.rows[0]!, false);

    const all = await listNewsletterSubscribersForAdmin({ status: "all", q: prefix });
    assert.equal(all.total, 3);

    const exact = await listNewsletterSubscribersForAdmin({
      status: "all",
      q: older,
    });
    assert.equal(exact.total, 1);
    assert.equal(exact.rows[0]?.email, older);

    const partialCase = await listNewsletterSubscribersForAdmin({
      status: "all",
      q: "NeWeR@ExAmPlE",
    });
    assert.equal(partialCase.total, 1);
    assert.equal(partialCase.rows[0]?.email, newer.toLowerCase());

    const noMatch = await listNewsletterSubscribersForAdmin({
      status: "all",
      q: `${prefix}missing`,
    });
    assert.equal(noMatch.total, 0);
    assert.equal(
      emptyStateForNewsletterList({ status: "all", q: `${prefix}missing`, total: 0 }),
      "No subscribers match this search.",
    );

    const counts = await getNewsletterSubscriberCounts(new Date("2026-09-06T00:00:00.000Z"));
    assert.ok(counts.total >= 3);
    assert.ok(counts.active >= 2);
    assert.ok(counts.unsubscribed >= 1);
    assert.ok(counts.newLast30Days >= 2);

    const page = await listNewsletterSubscribersForAdmin({
      status: "all",
      q: prefix,
      page: 1,
      pageSize: 2,
    });
    assert.equal(page.pageSize, 2);
    assert.equal(page.rows.length, 2);
    assert.equal(page.total, 3);
    assert.equal(page.totalPages, 2);

    const page2 = await listNewsletterSubscribersForAdmin({
      status: "all",
      q: prefix,
      page: 2,
      pageSize: 2,
    });
    assert.equal(page2.page, 2);
    assert.equal(page2.rows.length, 1);
  });
});

describe("newsletter admin UI contracts", () => {
  it("is read-only and clarifies welcome email is separate", () => {
    const page = read("app/admin/(app)/newsletter/page.tsx");
    const ui = read("components/admin/NewsletterSubscribersIndex.tsx");
    const lib = read("lib/newsletter-admin.ts");

    assert.match(page, /Subscribers collected from Mesa newsletter signup forms/);
    assert.match(
      ui,
      /Active means the address is saved and subscribed\. Welcome-email delivery is separate\./,
    );
    assert.doesNotMatch(ui, /Send newsletter|Compose|CSV|Resend welcome|Welcome:\s*Delivered/i);
    assert.doesNotMatch(page, /delete|createSubscriber|manual unsubscribe/i);
    assert.match(ui, /Search subscribers…/);
    assert.match(ui, /md:hidden/);
    assert.match(ui, /hidden md:block/);
    assert.match(lib, /newsletterAdminSelect/);
    assert.doesNotMatch(lib, /unsubscribeTokenHash:\s*true/);
    assert.match(lib, /orderBy:\s*\{\s*createdAt:\s*"desc"/);
  });

  it("keeps a DB default on updatedAt so production db push can backfill existing rows", () => {
    const schema = readFileSync(path.join(root, "../../prisma/schema.prisma"), "utf8");
    assert.match(
      schema,
      /model NewsletterSubscriber[\s\S]*?updatedAt\s+DateTime\s+@default\(now\(\)\)\s+@updatedAt/,
    );
  });
});
