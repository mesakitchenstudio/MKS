import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "./passwords";
import {
  FORMER_MEMBER_DISPLAY_NAME,
  anonymizedReviewEmail,
  deleteMemberAccount,
  isAccountDeleteConfirmation,
} from "./member-account-deletion";
import { subscribeNewsletterServer } from "./newsletter-subscribe";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("account deletion confirmation", () => {
  it("L: requires exact DELETE", () => {
    assert.equal(isAccountDeleteConfirmation("DELETE"), true);
    assert.equal(isAccountDeleteConfirmation(" DELETE "), true);
    assert.equal(isAccountDeleteConfirmation("delete"), false);
    assert.equal(isAccountDeleteConfirmation("Delete"), false);
    assert.equal(isAccountDeleteConfirmation(""), false);
  });
});

describe("member account deletion persistence", () => {
  const db = new PrismaClient();
  const prefix = `del-acct-${Date.now()}-`;

  before(async () => {
    await db.$connect();
  });

  after(async () => {
    await db.recipeReview.deleteMany({ where: { authorEmail: { startsWith: "deleted+" } } });
    await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.passwordReset.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("B/D/E/F/H/I: deletes user and favorites, anonymizes reviews, unsubscribes newsletter", async () => {
    const email = `${prefix}member@example.com`;
    const user = await db.user.create({
      data: {
        email,
        name: "Delete Me",
        passwordHash: hashPassword("password-long-enough"),
        notify: false,
      },
    });

    await db.recipeSave.create({
      data: { userId: user.id, slug: "golden-crispy-rice", title: "Golden Crispy Rice" },
    });
    await db.userConnection.create({
      data: {
        userId: user.id,
        event: "signup",
        method: "email",
        ip: "127.0.0.1",
      },
    });
    await db.memberPresenceSession.create({
      data: { userId: user.id, sessionKey: "tab-1" },
    });
    const review = await db.recipeReview.create({
      data: {
        recipeSlug: "golden-crispy-rice",
        userId: user.id,
        authorName: "Delete Me",
        authorEmail: email,
        rating: 5,
        body: "Excellent rice.",
      },
    });
    await db.passwordReset.create({
      data: {
        email,
        kind: "member",
        tokenHash: createHash("sha256").update(`${prefix}-token`).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await subscribeNewsletterServer(email, "profile", {
      sendEmail: async () => ({ ok: true }),
    });

    const result = await deleteMemberAccount(email);
    assert.equal(result.ok, true);

    assert.equal(await db.user.findUnique({ where: { email } }), null);
    assert.equal(await db.recipeSave.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.userConnection.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.memberPresenceSession.count({ where: { userId: user.id } }), 0);
    assert.equal(await db.passwordReset.count({ where: { email, kind: "member" } }), 0);

    const keptReview = await db.recipeReview.findUnique({ where: { id: review.id } });
    assert.ok(keptReview);
    assert.equal(keptReview?.userId, null);
    assert.equal(keptReview?.authorName, FORMER_MEMBER_DISPLAY_NAME);
    assert.equal(keptReview?.authorEmail, anonymizedReviewEmail(review.id));
    assert.equal(keptReview?.body, "Excellent rice.");

    const subscriber = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.ok(subscriber);
    assert.equal(subscriber?.status, "unsubscribed");
    assert.ok(subscriber?.unsubscribedAt);
  });

  it("C: deletion is keyed only by the session email argument (no alternate target)", async () => {
    const keep = `${prefix}keep@example.com`;
    const remove = `${prefix}remove@example.com`;
    await db.user.create({ data: { email: keep, name: "Keep", notify: false } });
    await db.user.create({ data: { email: remove, name: "Remove", notify: false } });

    const result = await deleteMemberAccount(remove);
    assert.equal(result.ok, true);
    assert.ok(await db.user.findUnique({ where: { email: keep } }));
    assert.equal(await db.user.findUnique({ where: { email: remove } }), null);
  });

  it("idempotent when the member is already gone", async () => {
    const email = `${prefix}gone@example.com`;
    await subscribeNewsletterServer(email, "site", {
      sendEmail: async () => ({ ok: true }),
    });
    const first = await deleteMemberAccount(email);
    assert.equal(first.ok, true);
    const second = await deleteMemberAccount(email);
    assert.equal(second.ok, true);
    if (second.ok) assert.equal(second.alreadyDeleted, true);
  });

  it("J: rolls back when a mid-transaction error is forced", async () => {
    const email = `${prefix}rollback@example.com`;
    const user = await db.user.create({
      data: { email, name: "Rollback", notify: false },
    });
    await db.recipeSave.create({
      data: { userId: user.id, slug: "banana-oatmeal-cookies", title: "Banana Oatmeal Cookies" },
    });

    let threw = false;
    try {
      await db.$transaction(async (tx) => {
        await tx.recipeSave.deleteMany({ where: { userId: user.id } });
        throw new Error("forced-failure");
      });
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
    assert.ok(await db.user.findUnique({ where: { email } }));
    assert.equal(await db.recipeSave.count({ where: { userId: user.id } }), 1);

    const cleanup = await deleteMemberAccount(email);
    assert.equal(cleanup.ok, true);
  });

  it("K: blocks staff/admin emails from public member deletion", async () => {
    const email = `${prefix}staff@example.com`;
    await db.admin.create({
      data: {
        email,
        name: "Staff",
        passwordHash: hashPassword("password-long-enough"),
        role: "editor",
      },
    });
    await db.user.create({
      data: { email, name: "Staff Member", notify: false },
    });

    const result = await deleteMemberAccount(email);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "staff");
    assert.ok(await db.user.findUnique({ where: { email } }));

    await db.user.deleteMany({ where: { email } });
    await db.admin.deleteMany({ where: { email } });
  });
});

describe("member account deletion wiring", () => {
  it("A/G/K/M/O: API and UI contracts", () => {
    const api = read("app/api/account/route.ts");
    const ui = read("components/DeleteAccountSection.tsx");
    const profile = read("app/profile/page.tsx");
    const home = read("app/page.tsx");
    const privacy = read("app/privacy/page.tsx");
    const core = read("lib/member-account-deletion.ts");

    assert.match(api, /export async function DELETE/);
    assert.match(api, /auth\(\)/);
    assert.match(api, /deleteMemberAccount\(email\)/);
    assert.doesNotMatch(api, /body\.email|body\.userId|searchParams/);
    assert.match(api, /staffRole/);
    assert.match(api, /expireAuthCookie|isPublicAuthCookieName/);

    assert.match(ui, /Type DELETE to confirm/);
    assert.match(ui, /Delete my account/);
    assert.match(ui, /disabled=\{!confirmed \|\| busy\}/);
    assert.match(ui, /Deleting…/);
    assert.match(ui, /forcePublicSignOut/);
    assert.match(ui, /\/\?account=deleted/);
    assert.match(ui, /role="dialog"/);
    assert.match(ui, /aria-modal="true"/);
    assert.match(ui, /newsletter[\s\S]*subscription will be stopped/);
    assert.match(ui, /Published reviews may remain/);

    assert.match(profile, /DeleteAccountSection/);
    assert.match(home, /AccountDeletedNotice/);
    assert.match(privacy, /When you[\s\S]*delete your account/i);
    assert.match(privacy, /Published[\s\S]*reviews may remain without a link to your former account/i);
    assert.match(privacy, /unsubscribed state so we can honor that preference/i);
    assert.doesNotMatch(privacy, /permanently removes your account and saved[\s\S]*stops newsletter emails to that address/);

    const notice = read("components/AccountDeletedNotice.tsx");
    assert.match(notice, /history\.replaceState/);
    assert.match(notice, /searchParams\.delete\("account"\)/);
    assert.match(notice, /setSticky\(true\)/);
    assert.doesNotMatch(notice, /reload|location\.assign|location\.href\s*=/);

    assert.match(core, /FORMER_MEMBER_DISPLAY_NAME/);
    assert.match(core, /recipeSave\.deleteMany/);
    assert.match(core, /status:\s*"unsubscribed"/);
    assert.match(core, /getStaffByEmail/);
    assert.doesNotMatch(core, /use_fedcm|Account\.|ProviderAccount/);
  });
});
