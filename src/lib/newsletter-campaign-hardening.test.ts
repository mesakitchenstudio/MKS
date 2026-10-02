/**
 * Phase 12F — Newsletter campaign delivery hardening contracts.
 * Terminology, dirty-editor safety, stuck-Sending UI, pagination, no misleading delivery claims.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NEWSLETTER_CAMPAIGN_IMMEDIATE_FAILURE_LABEL,
  NEWSLETTER_CAMPAIGN_PROVIDER_ACCEPTED_LABEL,
  NEWSLETTER_CAMPAIGN_STUCK_SENDING_GUIDANCE,
  formatNewsletterCampaignSendResultMessage,
} from "./newsletter-campaign-admin.ts";
import {
  NEWSLETTER_SEND_PROVIDER_CONCURRENCY,
  NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE,
} from "./newsletter-campaign-send.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("newsletter campaign hardening — terminology", () => {
  it("exposes truthful provider-acceptance labels (not inbox delivery)", () => {
    assert.equal(NEWSLETTER_CAMPAIGN_PROVIDER_ACCEPTED_LABEL, "Provider accepted");
    assert.equal(NEWSLETTER_CAMPAIGN_IMMEDIATE_FAILURE_LABEL, "Immediate provider failures");
    const msg = formatNewsletterCampaignSendResultMessage({ succeeded: 2, failed: 1 });
    assert.match(msg, /Send processing completed/);
    assert.match(msg, /Provider accepted: 2/);
    assert.match(msg, /Immediate provider failures: 1/);
    assert.doesNotMatch(msg, /Successful deliver/i);
    assert.doesNotMatch(msg, /Sent successfully/i);
    assert.doesNotMatch(msg, /\bDelivered\b/i);
  });

  it("editor and send core avoid misleading delivery wording", () => {
    const editor = read("components/admin/NewsletterCampaignEditor.tsx");
    assert.match(editor, /NEWSLETTER_CAMPAIGN_PROVIDER_ACCEPTED_LABEL/);
    assert.match(editor, /NEWSLETTER_CAMPAIGN_IMMEDIATE_FAILURE_LABEL/);
    assert.doesNotMatch(editor, />Succeeded</);
    assert.doesNotMatch(editor, /Successful deliveries/i);
    assert.match(editor, /does not prove inbox/i);

    const send = read("lib/newsletter-campaign-send.ts");
    assert.match(send, /formatNewsletterCampaignSendResultMessage/);
    assert.match(send, /NOT inbox delivery proof/i);
    assert.doesNotMatch(send, /Sent successfully/);
    assert.doesNotMatch(send, /Successful deliveries/);
  });
});

describe("newsletter campaign hardening — dirty editor + stuck Sending", () => {
  it("blocks Dry Run / Test Send / Audience Send while dirty", () => {
    const editor = read("components/admin/NewsletterCampaignEditor.tsx");
    assert.match(editor, /NEWSLETTER_CAMPAIGN_DIRTY_SAVE_HINT/);
    assert.match(editor, /disabled=\{pending \|\| dirty\}/);
    assert.match(editor, /disabled=\{pending \|\| dirty \|\| !readiness\.ready\}/);
    assert.match(editor, /if \(!canDryRun \|\| dirty\) return/);
    assert.match(editor, /if \(!canSend \|\| locked \|\| dirty\) return/);
    assert.doesNotMatch(editor, /Retry failed/i);
    assert.doesNotMatch(editor, /Reset to Draft/i);
    assert.doesNotMatch(editor, /Send again/i);
  });

  it("shows fail-closed stuck Sending guidance without retry controls", () => {
    const editor = read("components/admin/NewsletterCampaignEditor.tsx");
    assert.match(editor, /NEWSLETTER_CAMPAIGN_STUCK_SENDING_GUIDANCE/);
    assert.match(editor, /NEWSLETTER_CAMPAIGN_STUCK_SENDING_GUIDANCE/);
    assert.ok(NEWSLETTER_CAMPAIGN_STUCK_SENDING_GUIDANCE.includes("Do not resend"));
    assert.doesNotMatch(editor, /Resume Sending/i);
    assert.doesNotMatch(editor, /Reset to draft/i);
  });
});

describe("newsletter campaign hardening — pagination + concurrency", () => {
  it("uses stable id ASC cursor paging and bounded concurrency", () => {
    assert.equal(NEWSLETTER_SEND_RECIPIENT_PAGE_SIZE, 250);
    assert.equal(NEWSLETTER_SEND_PROVIDER_CONCURRENCY, 3);
    const send = read("lib/newsletter-campaign-send.ts");
    assert.match(send, /orderBy:\s*\[\s*\{\s*id:\s*"asc"\s*\}\s*\]/);
    assert.doesNotMatch(send, /orderBy:\s*\[\s*\{\s*createdAt:\s*"asc"/);
    assert.match(send, /NEWSLETTER_SEND_PROVIDER_CONCURRENCY/);
    assert.doesNotMatch(send, /Promise\.all\(\s*eligible/);
  });

  it("dry-run shares id ASC paging", () => {
    const dry = read("lib/newsletter-campaign-dry-run.ts");
    assert.match(dry, /orderBy:\s*\[\s*\{\s*id:\s*"asc"\s*\}\s*\]/);
  });
});

describe("newsletter campaign hardening — migration + public surface", () => {
  it("keeps additive-only NewsletterCampaign migration", () => {
    const sql = readFileSync(
      path.join(root, "..", "..", "prisma", "migrations", "20261002080000_newsletter_campaign_foundation", "migration.sql"),
      "utf8",
    );
    assert.match(sql, /CREATE TABLE "NewsletterCampaign"/);
    assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|ALTER TABLE "NewsletterSubscriber"|ALTER TABLE "User"/i);
  });

  it("has no public campaign routes and defers specific-member preview", () => {
    const admin = read("lib/newsletter-campaign-admin.ts");
    assert.match(admin, /"general" \| "series" \| "category"/);
    assert.doesNotMatch(admin, /"member"/);
    const actions = read("app/admin/newsletter-campaign-actions.ts");
    assert.doesNotMatch(actions, /specific.?member/i);
  });
});
