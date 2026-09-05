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
  NEWSLETTER_WELCOME_PREHEADER,
  buildNewsletterWelcomeEmail,
  newsletterWelcomeListUnsubscribeHeaders,
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
  it("addresses the subscriber with recipes CTA, YouTube link, and unsubscribe footer", () => {
    const email = buildNewsletterWelcomeEmail({
      unsubscribeUrl: "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=abc",
      recipesUrl: "https://www.mesakitchenstudio.com/recipes",
      youtubeUrl: "https://youtube.com/@mesakitchenstudio",
    });
    assert.equal(email.subject, NEWSLETTER_WELCOME_SUBJECT);
    assert.match(email.html, /Welcome to the Mesa table/);
    assert.match(email.html, /You're on the Mesa list/);
    assert.match(email.html, /aria-hidden="true"/);
    assert.match(email.html, new RegExp(NEWSLETTER_WELCOME_PREHEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(email.html, /Kitchen Studio/);
    assert.match(email.html, /Explore Mesa recipes/);
    assert.match(email.html, /background-color:#ad4b31/);
    assert.match(email.html, /https:\/\/www\.mesakitchenstudio\.com\/recipes/);
    assert.match(email.html, /Prefer to cook along\?/);
    assert.match(email.html, /Watch Mesa on YouTube/);
    assert.match(email.html, /https:\/\/youtube\.com\/@mesakitchenstudio/);
    assert.match(email.html, /Recipes for the table\. Tested in the studio\./);
    assert.match(email.html, /border-top:1px solid #d9cbb6/);
    assert.match(email.html, /Unsubscribe/);
    assert.match(email.html, /newsletter\/unsubscribe\?token=abc/);
    // Footer order: YouTube → tagline → hairline Unsubscribe (Gmail may trim repeats of this region).
    const youtubeIdx = email.html.indexOf("Watch Mesa on YouTube");
    const taglineIdx = email.html.indexOf("Recipes for the table");
    const unsubIdx = email.html.lastIndexOf(">Unsubscribe<");
    assert.ok(youtubeIdx > 0 && taglineIdx > youtubeIdx && unsubIdx > taglineIdx);
    assert.match(email.text, /Explore Mesa recipes:/);
    assert.match(email.text, /Watch Mesa on YouTube:/);
    assert.match(email.text, /https:\/\/youtube\.com\/@mesakitchenstudio/);
    assert.match(email.text, /Unsubscribe:/);
    assert.match(email.text, /newsletter\/unsubscribe\?token=abc/);
    assert.doesNotMatch(email.html, /discount|urgency|exclusive|join thousands|special offers/i);
    assert.doesNotMatch(email.html, /instagram|pinterest|facebook/i);
  });

  it("defaults recipes and YouTube URLs from site helpers", () => {
    const email = buildNewsletterWelcomeEmail({
      unsubscribeUrl: "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=xyz",
    });
    assert.match(email.html, /\/recipes/);
    assert.match(email.html, /youtube\.com\/@mesakitchenstudio/);
    assert.match(email.text, /youtube\.com\/@mesakitchenstudio/);
  });

  it("attaches RFC 2369 List-Unsubscribe and deliberately omits one-click POST", () => {
    const unsubscribeUrl =
      "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=abc";
    const email = buildNewsletterWelcomeEmail({ unsubscribeUrl });
    assert.deepEqual(email.headers, {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
    });
    assert.equal(
      newsletterWelcomeListUnsubscribeHeaders(unsubscribeUrl)["List-Unsubscribe-Post"],
      undefined,
    );
    assert.doesNotMatch(JSON.stringify(email.headers), /List-Unsubscribe-Post/);
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
    const sent: Array<{
      to: string | string[];
      subject: string;
      html: string;
      text?: string;
      headers?: Record<string, string>;
    }> = [];

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
    assert.match(String(welcome[0]?.headers?.["List-Unsubscribe"] || ""), /<https?:\/\/.+\/newsletter\/unsubscribe\?token=/);
    assert.equal(welcome[0]?.headers?.["List-Unsubscribe-Post"], undefined);
    assert.equal(notices.length, 1);
    assert.notEqual(String(notices[0]?.to), email);
    assert.equal(notices[0]?.headers?.["List-Unsubscribe"], undefined);

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

  it("keeps the unsubscribe page calm, branded, and non-retention", () => {
    const page = read("app/newsletter/unsubscribe/page.tsx");
    const chrome = read("components/PublicChrome.tsx");

    assert.match(page, /title:\s*"Unsubscribe"/);
    assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
    assert.match(page, /You’ve been unsubscribed\./);
    assert.match(page, /We won’t send further newsletter emails to this address\./);
    assert.match(page, /You’re already unsubscribed\./);
    assert.match(page, /This address is no longer subscribed to Mesa newsletter emails\./);
    assert.match(page, /We couldn’t process that unsubscribe link\./);
    assert.match(page, /The link may be invalid or no longer available\./);
    assert.match(page, /Return to Mesa →/);
    assert.match(page, /Browse recipes →/);
    assert.match(page, /href="\/"/);
    assert.match(page, /href="\/recipes"/);
    assert.match(page, /Kitchen Studio/);
    assert.match(page, /bg-terracotta/);
    assert.match(page, /site\.tagline/);
    assert.doesNotMatch(page, /Resubscribe|sorry to see you go|Give us another chance|Stay with us/i);
    assert.doesNotMatch(page, /bg-red|text-red|alert-red/i);

    assert.match(chrome, /newsletter\/unsubscribe/);
    assert.match(chrome, /showPublicChrome/);
  });
});
