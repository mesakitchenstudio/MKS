import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { validateNewsletterEmail } from "./newsletter";
import {
  buildNewsletterUnsubscribeUrl,
  createNewsletterUnsubscribeToken,
  hashNewsletterUnsubscribeToken,
  isActiveNewsletterStatus,
} from "./newsletter-unsubscribe";
import {
  NEWSLETTER_WELCOME_SUBJECT,
  buildNewsletterWelcomeEmail,
} from "./newsletter-welcome-email";
import {
  subscribeNewsletterServer,
  unsubscribeNewsletterByToken,
} from "./newsletter-subscribe";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("newsletter validation", () => {
  it("rejects empty email", () => {
    const result = validateNewsletterEmail("   ");
    assert.equal(result.ok, false);
  });

  it("rejects invalid email", () => {
    const result = validateNewsletterEmail("not-an-email");
    assert.equal(result.ok, false);
  });

  it("accepts valid email", () => {
    const result = validateNewsletterEmail("  Cook@Example.com ");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.email, "cook@example.com");
  });
});

describe("newsletter unsubscribe tokens", () => {
  it("hashes tokens and never equals the raw value", () => {
    const { token, tokenHash } = createNewsletterUnsubscribeToken();
    assert.equal(token.length, 64);
    assert.equal(tokenHash, hashNewsletterUnsubscribeToken(token));
    assert.notEqual(tokenHash, token);
    assert.match(buildNewsletterUnsubscribeUrl(token, "https://www.mesakitchenstudio.com"), /\/newsletter\/unsubscribe\?token=/);
    assert.doesNotMatch(buildNewsletterUnsubscribeUrl(token), /@/);
  });

  it("treats missing status as active for legacy rows", () => {
    assert.equal(isActiveNewsletterStatus(undefined), true);
    assert.equal(isActiveNewsletterStatus("active"), true);
    assert.equal(isActiveNewsletterStatus("unsubscribed"), false);
  });
});

describe("newsletter welcome email", () => {
  it("addresses the subscriber with recipes CTA and unsubscribe footer", () => {
    const email = buildNewsletterWelcomeEmail({
      unsubscribeUrl: "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=abc",
      recipesUrl: "https://www.mesakitchenstudio.com/recipes",
    });
    assert.equal(email.subject, NEWSLETTER_WELCOME_SUBJECT);
    assert.match(email.html, /Welcome to the Mesa table/);
    assert.match(email.html, /Explore Mesa recipes/);
    assert.match(email.html, /Unsubscribe/);
    assert.match(email.html, /newsletter\/unsubscribe\?token=abc/);
    assert.match(email.text, /Explore Mesa recipes:/);
    assert.match(email.text, /Unsubscribe:/);
    assert.doesNotMatch(email.html, /discount|urgency|subscribers|YouTube/i);
  });
});

describe("newsletter subscribe + unsubscribe persistence", () => {
  const db = new PrismaClient();
  const prefix = `nl-test-${Date.now()}-`;

  before(async () => {
    await db.$connect();
  });

  after(async () => {
    await db.newsletterSubscriber.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await db.$disconnect();
  });

  it("persists a new subscriber, sends welcome once, and keeps success if welcome fails", async () => {
    const email = `${prefix}new@example.com`;
    const sent: Array<{ to: string | string[]; subject: string; html: string; text?: string }> = [];

    const first = await subscribeNewsletterServer(email, "site", {
      sendEmail: async (input) => {
        sent.push(input);
        if (input.subject === NEWSLETTER_WELCOME_SUBJECT) {
          return { ok: false, reason: "provider_error" };
        }
        return { ok: true };
      },
    });
    assert.equal(first.ok, true);
    if (first.ok) assert.equal(first.duplicate, undefined);

    const row = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.ok(row);
    assert.equal(row?.status, "active");
    assert.ok(row?.unsubscribeTokenHash);

    const welcome = sent.filter((item) => item.subject === NEWSLETTER_WELCOME_SUBJECT);
    const notices = sent.filter((item) => String(item.subject).startsWith("Newsletter signup:"));
    assert.equal(welcome.length, 1);
    assert.equal(String(welcome[0]?.to), email);
    assert.match(welcome[0]?.html || "", /Unsubscribe/);
    assert.ok(welcome[0]?.text);
    assert.equal(notices.length, 1);
    assert.notEqual(String(notices[0]?.to), email);

    const duplicate = await subscribeNewsletterServer(email, "site", {
      sendEmail: async (input) => {
        sent.push(input);
        return { ok: true };
      },
    });
    assert.equal(duplicate.ok, true);
    if (duplicate.ok) assert.equal(duplicate.duplicate, true);
    assert.equal(
      sent.filter((item) => item.subject === NEWSLETTER_WELCOME_SUBJECT).length,
      1,
    );
  });

  it("unsubscribes by token idempotently without deleting the row", async () => {
    const email = `${prefix}unsub@example.com`;
    let rawToken = "";

    await subscribeNewsletterServer(email, "site", {
      sendEmail: async (input) => {
        if (input.subject === NEWSLETTER_WELCOME_SUBJECT) {
          const match = /[?&]token=([a-f0-9]+)/i.exec(input.html);
          rawToken = match?.[1] || "";
        }
        return { ok: true };
      },
    });
    assert.ok(rawToken);

    const first = await unsubscribeNewsletterByToken(rawToken);
    assert.deepEqual(first, { ok: true, alreadyUnsubscribed: false });

    const row = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.equal(row?.status, "unsubscribed");
    assert.ok(row?.unsubscribedAt);

    const second = await unsubscribeNewsletterByToken(rawToken);
    assert.deepEqual(second, { ok: true, alreadyUnsubscribed: true });

    const stillThere = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.ok(stillThere);
    assert.equal(stillThere?.status, "unsubscribed");

    assert.deepEqual(await unsubscribeNewsletterByToken("not-a-token"), {
      ok: false,
      reason: "invalid",
    });
  });

  it("reactivates an unsubscribed address and sends welcome once", async () => {
    const email = `${prefix}reactivate@example.com`;
    let rawToken = "";
    const welcomeSubjects: string[] = [];

    await subscribeNewsletterServer(email, "site", {
      sendEmail: async (input) => {
        if (input.subject === NEWSLETTER_WELCOME_SUBJECT) {
          welcomeSubjects.push(input.subject);
          const match = /[?&]token=([a-f0-9]+)/i.exec(input.html);
          rawToken = match?.[1] || "";
        }
        return { ok: true };
      },
    });
    await unsubscribeNewsletterByToken(rawToken);

    const reactivated = await subscribeNewsletterServer(email, "site", {
      sendEmail: async (input) => {
        if (input.subject === NEWSLETTER_WELCOME_SUBJECT) {
          welcomeSubjects.push(input.subject);
        }
        return { ok: true };
      },
    });
    assert.equal(reactivated.ok, true);
    if (reactivated.ok) assert.equal(reactivated.duplicate, undefined);

    const row = await db.newsletterSubscriber.findUnique({ where: { email } });
    assert.equal(row?.status, "active");
    assert.equal(row?.unsubscribedAt, null);
    assert.equal(welcomeSubjects.length, 2);
  });
});

describe("newsletter wiring contracts", () => {
  it("keeps API and privacy aligned with welcome + unsubscribe", () => {
    const api = read("app/api/newsletter/route.ts");
    assert.match(api, /subscribeNewsletterServer/);

    const form = read("components/NewsletterForm.tsx");
    assert.match(form, /You’re on the list/);
    assert.doesNotMatch(form, /Check your inbox/i);

    const privacy = read("app/privacy/page.tsx");
    assert.match(privacy, /welcome message/);
    assert.match(privacy, /unsubscribe at any time/i);

    const proxy = read("proxy.ts");
    assert.match(proxy, /\/newsletter\/unsubscribe/);

    const schema = readFileSync(path.join(root, "../../prisma/schema.prisma"), "utf8");
    assert.match(schema, /unsubscribeTokenHash/);
    assert.match(schema, /unsubscribedAt/);
    assert.match(schema, /status/);
  });
});
