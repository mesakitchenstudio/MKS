import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  isMemberNewsletterSubscribed,
  setMemberNewsletterPreference,
} from "./member-newsletter";
import {
  subscribeNewsletterServer,
  unsubscribeNewsletterByEmail,
  unsubscribeNewsletterByToken,
} from "./newsletter-subscribe";
import { NEWSLETTER_WELCOME_SUBJECT } from "./newsletter-welcome-email";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const silentMailer = async () => ({ ok: true as const });

describe("member newsletter preference source of truth", () => {
  const db = new PrismaClient();
  const prefix = `mbr-nl-${Date.now()}-`;

  before(async () => {
    await db.$connect();
  });

  after(async () => {
    await db.newsletterSubscriber.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await db.$disconnect();
  });

  it("A–C: active / unsubscribed / missing row drive checkbox state", async () => {
    const activeEmail = `${prefix}active@example.com`;
    const goneEmail = `${prefix}gone@example.com`;
    const missingEmail = `${prefix}missing@example.com`;

    await subscribeNewsletterServer(activeEmail, "site", { sendEmail: silentMailer });
    assert.equal(await isMemberNewsletterSubscribed(activeEmail), true);
    assert.equal(await isMemberNewsletterSubscribed(`  ${activeEmail.toUpperCase()}  `), true);

    await subscribeNewsletterServer(goneEmail, "site", { sendEmail: silentMailer });
    await unsubscribeNewsletterByEmail(goneEmail);
    assert.equal(await isMemberNewsletterSubscribed(goneEmail), false);

    assert.equal(await isMemberNewsletterSubscribed(missingEmail), false);
  });

  it("D: profile opt-in creates active NewsletterSubscriber with source profile", async () => {
    const email = `${prefix}optin@example.com`;
    let sourceInNotice = "";

    const result = await setMemberNewsletterPreference(email, true, {
      sendEmail: async (input) => {
        if (String(input.subject).startsWith("Newsletter signup:")) {
          sourceInNotice = String(input.html);
        }
        return { ok: true };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.subscribed, true);

    const row = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.ok(row);
    assert.equal(row?.status, "active");
    assert.equal(row?.source, "profile");
    assert.match(sourceInNotice, /Source: profile/);
    assert.equal(await isMemberNewsletterSubscribed(email), true);
  });

  it("E: profile opt-out sets unsubscribed and keeps the row", async () => {
    const email = `${prefix}optout@example.com`;
    await setMemberNewsletterPreference(email, true, { sendEmail: silentMailer });

    const result = await setMemberNewsletterPreference(email, false);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.subscribed, false);

    const row = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.ok(row);
    assert.equal(row?.status, "unsubscribed");
    assert.ok(row?.unsubscribedAt);
    assert.equal(await isMemberNewsletterSubscribed(email), false);
  });

  it("F: email-token unsubscribe leaves profile preference unchecked", async () => {
    const email = `${prefix}token@example.com`;
    let rawToken = "";

    await setMemberNewsletterPreference(email, true, {
      sendEmail: async (input) => {
        if (input.subject === NEWSLETTER_WELCOME_SUBJECT) {
          const match = /[?&]token=([a-f0-9]+)/i.exec(input.html);
          rawToken = match?.[1] || "";
        }
        return { ok: true };
      },
    });
    assert.equal(await isMemberNewsletterSubscribed(email), true);
    assert.ok(rawToken);

    const unsub = await unsubscribeNewsletterByToken(rawToken);
    assert.deepEqual(unsub, { ok: true, alreadyUnsubscribed: false });
    assert.equal(await isMemberNewsletterSubscribed(email), false);
  });

  it("G: re-subscribe reactivates and preserves welcome lifecycle", async () => {
    const email = `${prefix}reactivate@example.com`;
    const welcomes: string[] = [];

    await setMemberNewsletterPreference(email, true, {
      sendEmail: async (input) => {
        if (input.subject === NEWSLETTER_WELCOME_SUBJECT) welcomes.push(input.subject);
        return { ok: true };
      },
    });
    await setMemberNewsletterPreference(email, false);

    const again = await setMemberNewsletterPreference(email, true, {
      sendEmail: async (input) => {
        if (input.subject === NEWSLETTER_WELCOME_SUBJECT) welcomes.push(input.subject);
        return { ok: true };
      },
    });
    assert.equal(again.ok, true);

    const row = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.equal(row?.status, "active");
    assert.equal(row?.unsubscribedAt, null);
    assert.equal(row?.source, "profile");
    assert.equal(welcomes.length, 2);
    assert.equal(await isMemberNewsletterSubscribed(email), true);
  });

  it("H: active duplicate stays one row and subscribed", async () => {
    const email = `${prefix}dup@example.com`;
    await setMemberNewsletterPreference(email, true, { sendEmail: silentMailer });

    const duplicate = await setMemberNewsletterPreference(email, true, {
      sendEmail: async () => {
        throw new Error("should not send mail on active duplicate");
      },
    });
    assert.equal(duplicate.ok, true);
    if (duplicate.ok) assert.equal(duplicate.subscribed, true);

    const count = await db.newsletterSubscriber.count({ where: { email } });
    assert.equal(count, 1);
    assert.equal(await isMemberNewsletterSubscribed(email), true);
  });

  it("I: preference helpers only affect the supplied email", async () => {
    const a = `${prefix}alice@example.com`;
    const b = `${prefix}bob@example.com`;
    await setMemberNewsletterPreference(a, true, { sendEmail: silentMailer });
    await setMemberNewsletterPreference(b, true, { sendEmail: silentMailer });

    await setMemberNewsletterPreference(a, false);
    assert.equal(await isMemberNewsletterSubscribed(a), false);
    assert.equal(await isMemberNewsletterSubscribed(b), true);
  });
});

describe("member newsletter wiring contracts", () => {
  it("J: profile and notify API use NewsletterSubscriber, not User.notify", () => {
    const profile = read("app/profile/page.tsx");
    const notifyApi = read("app/api/account/notify/route.ts");
    const preference = read("components/EmailUpdatesPreference.tsx");
    const register = read("app/api/account/register/route.ts");
    const accounts = read("lib/accounts.ts");
    const memberNl = read("lib/member-newsletter.ts");

    assert.match(profile, /isMemberNewsletterSubscribed/);
    assert.match(profile, /initialNotify=\{newsletterSubscribed\}/);
    assert.doesNotMatch(profile, /initialNotify=\{user\.notify\}/);

    assert.match(notifyApi, /setMemberNewsletterPreference/);
    assert.doesNotMatch(notifyApi, /updateMemberNotifyPreference|user\.notify|body\.email/);

    assert.match(preference, /You’re subscribed to Mesa email updates\./);
    assert.match(preference, /You’re unsubscribed from Mesa email updates\./);

    assert.match(register, /subscribeNewsletterServer/);
    assert.match(register, /"signup"/);
    assert.match(accounts, /notify:\s*false/);
    assert.doesNotMatch(accounts, /updateMemberNotifyPreference/);
    assert.doesNotMatch(accounts, /notify:\s*input\.notify/);

    assert.match(memberNl, /subscribeNewsletterServer/);
    assert.match(memberNl, /"profile"/);
    assert.match(memberNl, /unsubscribeNewsletterByEmail/);
  });
});
