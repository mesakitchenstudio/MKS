/**
 * Phase 12D — Newsletter campaign Admin UI / route / nav contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildAdminNavSections } from "./admin-nav.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function read(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

describe("newsletter campaign admin — UI contracts", () => {
  it("keeps subscriber ledger and adds campaign routes", () => {
    const ledger = read("app/admin/(app)/newsletter/page.tsx");
    assert.match(ledger, /NewsletterSubscribersIndex/);
    assert.match(ledger, /NewsletterAdminSubnav/);
    assert.match(ledger, /showCampaigns/);

    assert.ok(read("app/admin/(app)/newsletter/campaigns/page.tsx").includes("NewsletterCampaignList"));
    assert.ok(read("app/admin/(app)/newsletter/campaigns/new/page.tsx").includes("createNewsletterCampaignAction"));
    assert.ok(
      read("app/admin/(app)/newsletter/campaigns/[id]/page.tsx").includes("NewsletterCampaignEditor"),
    );
  });

  it("nav separates Newsletter subscribers from campaigns", () => {
    const owner = buildAdminNavSections("owner");
    const labels = owner.flatMap((s) => s.items.map((i) => i.label));
    assert.ok(labels.includes("Newsletter"));
    assert.ok(labels.includes("Newsletter campaigns"));

    const editor = buildAdminNavSections("editor");
    const editorLabels = editor.flatMap((s) => s.items.map((i) => i.label));
    assert.ok(editorLabels.includes("Newsletter campaigns"));
    assert.ok(!editorLabels.includes("Newsletter"));

    const audience = buildAdminNavSections("members");
    const audienceLabels = audience.flatMap((s) => s.items.map((i) => i.label));
    assert.ok(audienceLabels.includes("Newsletter"));
    assert.ok(!audienceLabels.includes("Newsletter campaigns"));
  });

  it("editor exposes a11y labels and Owner send controls", () => {
    const editor = read("components/admin/NewsletterCampaignEditor.tsx");
    assert.match(editor, /Internal name/);
    assert.match(editor, /aria-label=\{`Move \$\{info\.title\} up`\}/);
    assert.match(editor, /aria-label=\{`Remove \$\{info\.title\} from personalization pool`\}/);
    assert.match(editor, /newsletterCampaignReadinessLabel/);
    assert.match(editor, /Ready/);
    assert.match(editor, /Not ready/);
    assert.match(editor, /Send test email/);
    assert.match(editor, /Send campaign/);
    assert.match(editor, /Confirm send/);
    assert.match(editor, /role="dialog"/);
    assert.match(editor, /Subscribers are not contacted/);
    assert.match(editor, /whole-campaign retry/);
    assert.doesNotMatch(editor, /Broadcast/i);
    assert.doesNotMatch(editor, /Schedule/);
    assert.doesNotMatch(editor, /Retry failed/i);
    assert.doesNotMatch(editor, /Send again/i);
    assert.match(editor, /Specific-member|synthetic|Series follower/i);
  });

  it("actions keep audience send Owner-only and ignore client audience fields", () => {
    const actions = read("app/admin/newsletter-campaign-actions.ts");
    assert.match(actions, /canSendNewsletterCampaigns/);
    assert.match(actions, /testSendNewsletterCampaignAction/);
    assert.match(actions, /sendNewsletterCampaignAction/);
    assert.match(actions, /ownerEmail: admin\.email/);
    assert.doesNotMatch(actions, /subscriberIds/);
    assert.doesNotMatch(actions, /recipientEmails/);
    assert.match(
      actions,
      /sendNewsletterCampaignToAudience\(\{\s*campaignId: input\.campaignId,\s*actor: auditActorFromSession\(admin\),\s*\}\)/,
    );
  });

  it("defers specific-member preview", () => {
    const admin = read("lib/newsletter-campaign-admin.ts");
    assert.match(admin, /"general" \| "series" \| "category"/);
    assert.doesNotMatch(admin, /"member"/);
    const actions = read("app/admin/newsletter-campaign-actions.ts");
    assert.doesNotMatch(actions, /specific.?member/i);
  });

  it("dry-run page size is bounded", () => {
    const dry = read("lib/newsletter-campaign-dry-run.ts");
    assert.match(dry, /NEWSLETTER_CAMPAIGN_DRY_RUN_PAGE_SIZE/);
    assert.match(dry, /NEWSLETTER_INTEREST_PROFILE_BATCH_MAX/);
    assert.doesNotMatch(dry, /findMany\(\{\s*where:\s*\{\s*status:\s*"active"\s*\}\s*\}\)/);
  });
});
