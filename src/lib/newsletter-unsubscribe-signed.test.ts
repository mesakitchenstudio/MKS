/**
 * Phase 12E-PRE — Recurring-safe signed newsletter unsubscribe tokens.
 * No campaign send. No Resend. No schema change.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  NEWSLETTER_UNSUBSCRIBE_PURPOSE,
  NEWSLETTER_UNSUBSCRIBE_SIGNED_VERSION,
  NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV,
  NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH,
  buildNewsletterOneClickUnsubscribeUrl,
  buildNewsletterUnsubscribeHeaders,
  buildNewsletterUnsubscribeUrl,
  buildSignedNewsletterUnsubscribeToken,
  createNewsletterUnsubscribeToken,
  getNewsletterUnsubscribeSigningSecret,
  looksLikeSignedNewsletterUnsubscribeToken,
  resolveNewsletterUnsubscribeToken,
  verifySignedNewsletterUnsubscribeToken,
} from "./newsletter-unsubscribe.ts";
import {
  subscribeNewsletterServer,
  unsubscribeNewsletterByEmail,
  unsubscribeNewsletterByToken,
} from "./newsletter-subscribe.ts";
import { setMemberNewsletterPreference } from "./member-newsletter.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

const TEST_SECRET = "mesa-newsletter-unsub-test-secret-32b!";
assert.ok(TEST_SECRET.length >= NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_MIN_LENGTH);

const silentMailer = async () => ({ ok: true as const });

describe("newsletter signed unsubscribe — pure crypto", () => {
  it("builds deterministic signed tokens without email or DB", () => {
    const a = buildSignedNewsletterUnsubscribeToken({
      subscriberId: "cltestsubscriber0001",
      secret: TEST_SECRET,
    });
    const b = buildSignedNewsletterUnsubscribeToken({
      subscriberId: "cltestsubscriber0001",
      secret: TEST_SECRET,
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.equal(a.token, b.token);
    assert.match(a.token, /^v1\./);
    assert.doesNotMatch(a.token, /@/);
    assert.equal(looksLikeSignedNewsletterUnsubscribeToken(a.token), true);
  });

  it("verifies signed tokens and rejects wrong secret / tampering", () => {
    const built = buildSignedNewsletterUnsubscribeToken({
      subscriberId: "cltestsubscriber0002",
      secret: TEST_SECRET,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const ok = verifySignedNewsletterUnsubscribeToken(built.token, TEST_SECRET);
    assert.equal(ok.valid, true);
    if (ok.valid) assert.equal(ok.subscriberId, "cltestsubscriber0002");

    assert.equal(
      verifySignedNewsletterUnsubscribeToken(built.token, "different-secret-also-32-chars!!").valid,
      false,
    );

    const parts = built.token.split(".");
    const tamperedId = Buffer.from("cltestsubscriberXXXX").toString("base64url");
    assert.equal(
      verifySignedNewsletterUnsubscribeToken(`${parts[0]}.${tamperedId}.${parts[2]}`, TEST_SECRET)
        .valid,
      false,
    );
    assert.equal(
      verifySignedNewsletterUnsubscribeToken(`${parts[0]}.${parts[1]}.AAAA`, TEST_SECRET).valid,
      false,
    );
    assert.equal(verifySignedNewsletterUnsubscribeToken("v2.abc.def", TEST_SECRET).valid, false);
    assert.equal(verifySignedNewsletterUnsubscribeToken("v1.", TEST_SECRET).valid, false);
    assert.equal(verifySignedNewsletterUnsubscribeToken("v1.onlyone", TEST_SECRET).valid, false);
    assert.equal(
      verifySignedNewsletterUnsubscribeToken(`v1.${parts[1]}.${parts[2]}.extra`, TEST_SECRET).valid,
      false,
    );
  });

  it("fails closed when secret missing or too short; no AUTH_SECRET fallback", () => {
    assert.equal(getNewsletterUnsubscribeSigningSecret({}), null);
    assert.equal(
      getNewsletterUnsubscribeSigningSecret({
        [NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV]: "short",
      }),
      null,
    );
    assert.equal(
      getNewsletterUnsubscribeSigningSecret({
        AUTH_SECRET: "x".repeat(40),
        ADMIN_SECRET: "y".repeat(40),
      }),
      null,
    );
    assert.equal(
      buildSignedNewsletterUnsubscribeToken({
        subscriberId: "clx",
        secret: null,
      }).ok,
      false,
    );
    assert.equal(verifySignedNewsletterUnsubscribeToken("v1.a.b", null).valid, false);
  });

  it("uses timingSafeEqual for MAC comparison (source contract)", () => {
    const src = readRepo("lib/newsletter-unsubscribe.ts");
    assert.match(src, /timingSafeEqual/);
    assert.doesNotMatch(src, /signature\s*===\s*expected/);
    assert.match(src, /createHmac\("sha256"/);
    assert.match(src, new RegExp(NEWSLETTER_UNSUBSCRIBE_PURPOSE));
  });

  it("domain-separates purpose in the signed payload", () => {
    const id = "cltestsubscriber0003";
    const built = buildSignedNewsletterUnsubscribeToken({
      subscriberId: id,
      secret: TEST_SECRET,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const wrongPurpose = createHmac("sha256", TEST_SECRET)
      .update(`password-reset:${NEWSLETTER_UNSUBSCRIBE_SIGNED_VERSION}:${id}`, "utf8")
      .digest("base64url");
    const parts = built.token.split(".");
    assert.equal(
      verifySignedNewsletterUnsubscribeToken(`${parts[0]}.${parts[1]}.${wrongPurpose}`, TEST_SECRET)
        .valid,
      false,
    );
  });

  it("survives URL encode/decode round-trip", () => {
    const built = buildSignedNewsletterUnsubscribeToken({
      subscriberId: "clurlencodedtoken0001",
      secret: TEST_SECRET,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const url = buildNewsletterUnsubscribeUrl(
      built.token,
      "https://www.mesakitchenstudio.com",
    );
    const parsed = new URL(url);
    const roundTripped = parsed.searchParams.get("token") ?? "";
    assert.equal(roundTripped, built.token);
    assert.equal(verifySignedNewsletterUnsubscribeToken(roundTripped, TEST_SECRET).valid, true);
  });

  it("builds future List-Unsubscribe headers only with one-click URL when provided", () => {
    const human = "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=v1.x.y";
    const oneClick = buildNewsletterOneClickUnsubscribeUrl(
      "v1.x.y",
      "https://www.mesakitchenstudio.com",
    );
    const withOneClick = buildNewsletterUnsubscribeHeaders({
      humanUnsubscribeUrl: human,
      oneClickUnsubscribeUrl: oneClick,
    });
    assert.equal(withOneClick["List-Unsubscribe"], `<${oneClick}>`);
    assert.equal(withOneClick["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

    const humanOnly = buildNewsletterUnsubscribeHeaders({ humanUnsubscribeUrl: human });
    assert.equal(humanOnly["List-Unsubscribe"], `<${human}>`);
    assert.equal(humanOnly["List-Unsubscribe-Post"], undefined);
  });

  it("does not treat invalid signed-looking tokens as legacy", () => {
    const resolved = resolveNewsletterUnsubscribeToken("v1.not-a-real.signature", TEST_SECRET);
    assert.equal(resolved.kind, "invalid");
  });
});

describe("newsletter signed unsubscribe — lifecycle", () => {
  const db = new PrismaClient();
  const suffix = `12epre-${Date.now()}`;
  const prefix = `nl-12epre-${suffix}-`;

  const emailLegacy = `${prefix}legacy@example.com`;
  const emailSigned = `${prefix}signed@example.com`;
  const emailAnon = `${prefix}anon@example.com`;
  const emailResub = `${prefix}resub@example.com`;
  const emailProfile = `${prefix}profile@example.com`;
  const emailDelete = `${prefix}delete@example.com`;

  let legacyPlain = "";
  let legacyHash = "";
  let legacyId = "";
  let signedId = "";
  let anonId = "";
  let resubId = "";
  let profileId = "";
  let deleteId = "";
  let previousSecret: string | undefined;

  before(async () => {
    await db.$connect();
    previousSecret = process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV];
    process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV] = TEST_SECRET;

    await subscribeNewsletterServer(emailLegacy, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailSigned, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailAnon, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailResub, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailProfile, "site", { sendEmail: silentMailer });
    await subscribeNewsletterServer(emailDelete, "site", { sendEmail: silentMailer });

    // Capture legacy welcome token by re-issuing a controlled hash (welcome path already
    // rotated once). Store a known legacy pair without going through welcome again.
    const issued = createNewsletterUnsubscribeToken();
    legacyPlain = issued.token;
    legacyHash = issued.tokenHash;
    const legacyRow = await db.newsletterSubscriber.findUniqueOrThrow({
      where: { email: emailLegacy },
    });
    legacyId = legacyRow.id;
    await db.newsletterSubscriber.update({
      where: { id: legacyId },
      data: { unsubscribeTokenHash: legacyHash },
    });

    signedId = (
      await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: emailSigned } })
    ).id;
    anonId = (await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: emailAnon } })).id;
    resubId = (await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: emailResub } })).id;
    profileId = (
      await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: emailProfile } })
    ).id;
    deleteId = (
      await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: emailDelete } })
    ).id;
  });

  after(async () => {
    if (previousSecret === undefined) {
      delete process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV];
    } else {
      process.env[NEWSLETTER_UNSUBSCRIBE_SIGNING_SECRET_ENV] = previousSecret;
    }
    await db.newsletterSubscriber
      .deleteMany({ where: { email: { startsWith: prefix } } })
      .catch(() => undefined);
    await db.$disconnect();
  });

  it("legacy token still unsubscribes", async () => {
    const result = await unsubscribeNewsletterByToken(legacyPlain);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyUnsubscribed, false);
    const row = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: legacyId } });
    assert.equal(row.status, "unsubscribed");
  });

  it("signed token generation does not mutate hash or updatedAt", async () => {
    const before = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: signedId } });
    const a = buildSignedNewsletterUnsubscribeToken({
      subscriberId: signedId,
      secret: TEST_SECRET,
    });
    const b = buildSignedNewsletterUnsubscribeToken({
      subscriberId: signedId,
      secret: TEST_SECRET,
    });
    assert.equal(a.ok && b.ok, true);
    const after = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: signedId } });
    assert.equal(after.unsubscribeTokenHash, before.unsubscribeTokenHash);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    assert.equal(after.status, "active");
  });

  it("legacy welcome hash remains valid after signed token generation", async () => {
    // Fresh active legacy fixture
    await db.newsletterSubscriber.update({
      where: { id: legacyId },
      data: {
        status: "active",
        unsubscribedAt: null,
        unsubscribeTokenHash: legacyHash,
      },
    });
    const signed = buildSignedNewsletterUnsubscribeToken({
      subscriberId: legacyId,
      secret: TEST_SECRET,
    });
    assert.equal(signed.ok, true);
    const afterBuild = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: legacyId } });
    assert.equal(afterBuild.unsubscribeTokenHash, legacyHash);

    const legacyResult = await unsubscribeNewsletterByToken(legacyPlain);
    assert.equal(legacyResult.ok, true);
  });

  it("signed A and signed B coexist; both unsubscribe", async () => {
    await db.newsletterSubscriber.update({
      where: { id: signedId },
      data: { status: "active", unsubscribedAt: null },
    });
    const beforeHash = (
      await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: signedId } })
    ).unsubscribeTokenHash;

    const a = buildSignedNewsletterUnsubscribeToken({
      subscriberId: signedId,
      secret: TEST_SECRET,
    });
    const b = buildSignedNewsletterUnsubscribeToken({
      subscriberId: signedId,
      secret: TEST_SECRET,
    });
    assert.equal(a.ok && b.ok, true);
    if (!a.ok || !b.ok) return;
    // Deterministic → same token is fine; both still valid.
    assert.equal(a.token, b.token);
    const after = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: signedId } });
    assert.equal(after.unsubscribeTokenHash, beforeHash);

    const result = await unsubscribeNewsletterByToken(a.token);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyUnsubscribed, false);

    const again = await unsubscribeNewsletterByToken(b.token);
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.alreadyUnsubscribed, true);
  });

  it("anonymous email-only subscriber unsubscribes via signed token", async () => {
    await db.newsletterSubscriber.update({
      where: { id: anonId },
      data: { status: "active", unsubscribedAt: null },
    });
    const built = buildSignedNewsletterUnsubscribeToken({
      subscriberId: anonId,
      secret: TEST_SECRET,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const result = await unsubscribeNewsletterByToken(built.token);
    assert.equal(result.ok, true);
    const row = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: anonId } });
    assert.equal(row.status, "unsubscribed");
  });

  it("old signed token still unsubscribes after resubscribe", async () => {
    await db.newsletterSubscriber.update({
      where: { id: resubId },
      data: { status: "active", unsubscribedAt: null },
    });
    const built = buildSignedNewsletterUnsubscribeToken({
      subscriberId: resubId,
      secret: TEST_SECRET,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;

    await unsubscribeNewsletterByToken(built.token);
    await subscribeNewsletterServer(emailResub, "site", { sendEmail: silentMailer });
    const reactivated = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: resubId } });
    assert.equal(reactivated.status, "active");

    const again = await unsubscribeNewsletterByToken(built.token);
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.alreadyUnsubscribed, false);
    const final = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: resubId } });
    assert.equal(final.status, "unsubscribed");
  });

  it("signed token is idempotent after profile unsubscribe", async () => {
    await db.newsletterSubscriber.update({
      where: { id: profileId },
      data: { status: "active", unsubscribedAt: null },
    });
    const built = buildSignedNewsletterUnsubscribeToken({
      subscriberId: profileId,
      secret: TEST_SECRET,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;

    await setMemberNewsletterPreference(emailProfile, false);
    const afterProfile = await db.newsletterSubscriber.findUniqueOrThrow({
      where: { id: profileId },
    });
    assert.equal(afterProfile.status, "unsubscribed");

    const result = await unsubscribeNewsletterByToken(built.token);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyUnsubscribed, true);
  });

  it("signed token is idempotent after account-deletion-style unsubscribe", async () => {
    await db.newsletterSubscriber.update({
      where: { id: deleteId },
      data: { status: "active", unsubscribedAt: null },
    });
    const built = buildSignedNewsletterUnsubscribeToken({
      subscriberId: deleteId,
      secret: TEST_SECRET,
    });
    assert.equal(built.ok, true);
    if (!built.ok) return;

    await unsubscribeNewsletterByEmail(emailDelete);
    const result = await unsubscribeNewsletterByToken(built.token);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.alreadyUnsubscribed, true);
  });

  it("one-click route contracts: signed only + One-Click body", () => {
    const route = readRepo("app/api/newsletter/unsubscribe/one-click/route.ts");
    assert.match(route, /looksLikeSignedNewsletterUnsubscribeToken/);
    assert.match(route, /List-Unsubscribe/);
    assert.match(route, /One-Click/);
    assert.match(route, /unsubscribeNewsletterByToken/);
    assert.doesNotMatch(route, /email/);
    assert.match(route, /status: 400/);
    assert.match(route, /status: 200/);
  });

  it("GET unsubscribe page still uses shared unsubscribeNewsletterByToken", () => {
    const page = readRepo("app/newsletter/unsubscribe/page.tsx");
    assert.match(page, /unsubscribeNewsletterByToken/);
  });

  it("welcome subscribe path still issues legacy hash tokens", () => {
    const subscribe = readRepo("lib/newsletter-subscribe.ts");
    assert.match(subscribe, /createNewsletterUnsubscribeToken/);
    assert.match(subscribe, /issueUnsubscribeToken/);
    assert.doesNotMatch(subscribe, /buildSignedNewsletterUnsubscribeToken/);
  });

  it("no schema / migration change in 12E-PRE foundation", () => {
    const schema = readRepo("../prisma/schema.prisma");
    assert.match(schema, /unsubscribeTokenHash/);
    assert.doesNotMatch(schema, /signedUnsubscribe|unsubscribePlaintext|unsubscribeSecret/i);
  });
});
