/**
 * Phase 12D — Newsletter campaign Admin pure validation tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNewsletterCampaignEditableStatus,
  collectNewsletterCampaignRecipeIds,
  newsletterCampaignReadinessLabel,
  validateNewsletterCampaignContentUpdate,
  validateNewsletterCampaignName,
  NEWSLETTER_CAMPAIGN_PREVIEW_UNSUBSCRIBE_URL,
} from "./newsletter-campaign-admin.ts";
import {
  NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX,
  NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX,
  type ResolvedNewsletterCampaignRecipe,
} from "./newsletter-campaign.ts";
import {
  canComposeNewsletterCampaigns,
  canDryRunNewsletterCampaigns,
  canSendNewsletterCampaigns,
  canViewNewsletterCampaigns,
} from "./admin-access.ts";

function recipe(
  partial: Partial<ResolvedNewsletterCampaignRecipe> & Pick<ResolvedNewsletterCampaignRecipe, "id">,
): ResolvedNewsletterCampaignRecipe {
  return {
    id: partial.id,
    status: partial.status ?? "published",
    slug: partial.slug ?? partial.id,
    title: partial.title ?? partial.id,
    publishedAt: partial.publishedAt ?? "2024-06-01T00:00:00.000Z",
    seriesIds: partial.seriesIds ?? [],
    categoryIds: partial.categoryIds ?? [],
    imageUrl: partial.imageUrl ?? null,
    imageAlt: partial.imageAlt ?? null,
  };
}

describe("newsletter campaign admin — access", () => {
  it("compose Owner+Editor; dry-run Owner+Audience; send Owner; view union", () => {
    assert.equal(canComposeNewsletterCampaigns("owner"), true);
    assert.equal(canComposeNewsletterCampaigns("editor"), true);
    assert.equal(canComposeNewsletterCampaigns("members"), false);

    assert.equal(canDryRunNewsletterCampaigns("owner"), true);
    assert.equal(canDryRunNewsletterCampaigns("members"), true);
    assert.equal(canDryRunNewsletterCampaigns("editor"), false);

    assert.equal(canSendNewsletterCampaigns("owner"), true);
    assert.equal(canSendNewsletterCampaigns("editor"), false);
    assert.equal(canSendNewsletterCampaigns("members"), false);

    assert.equal(canViewNewsletterCampaigns("owner"), true);
    assert.equal(canViewNewsletterCampaigns("editor"), true);
    assert.equal(canViewNewsletterCampaigns("members"), true);
  });
});

describe("newsletter campaign admin — validation", () => {
  it("validates internal name", () => {
    assert.equal(validateNewsletterCampaignName("").ok, false);
    assert.equal(validateNewsletterCampaignName("   ").ok, false);
    assert.equal(validateNewsletterCampaignName("x".repeat(121)).ok, false);
    const ok = validateNewsletterCampaignName("  Spring breads  ");
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.data, "Spring breads");
  });

  it("locks sending/sent campaigns", () => {
    assert.equal(assertNewsletterCampaignEditableStatus("draft").ok, true);
    assert.equal(assertNewsletterCampaignEditableStatus("sending").ok, false);
    assert.equal(assertNewsletterCampaignEditableStatus("sent").ok, false);
  });

  it("rejects too many defaults and candidates", () => {
    const previous = {
      subject: "",
      preheader: "",
      intro: "",
      featuredRecipeId: null,
      defaultRecipeIds: [],
      candidateRecipeIds: [],
    };
    const resolved = new Map(
      Array.from({ length: 25 }, (_, i) => {
        const id = `r${i}`;
        return [id, recipe({ id })] as const;
      }),
    );
    const tooManyDefaults = validateNewsletterCampaignContentUpdate({
      previous,
      nextRaw: {
        defaultRecipeIds: Array.from(
          { length: NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX + 1 },
          (_, i) => `r${i}`,
        ),
        candidateRecipeIds: [],
      },
      resolved,
    });
    assert.equal(tooManyDefaults.ok, false);
    if (!tooManyDefaults.ok) assert.equal(tooManyDefaults.code, "too_many_defaults");

    const tooManyCandidates = validateNewsletterCampaignContentUpdate({
      previous,
      nextRaw: {
        defaultRecipeIds: [],
        candidateRecipeIds: Array.from(
          { length: NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX + 1 },
          (_, i) => `r${i}`,
        ),
      },
      resolved,
    });
    assert.equal(tooManyCandidates.ok, false);
    if (!tooManyCandidates.ok) assert.equal(tooManyCandidates.code, "too_many_candidates");
  });

  it("rejects new Draft/missing Recipe IDs but retains previous unavailable", () => {
    const previous = {
      subject: "Hi",
      preheader: "",
      intro: "",
      featuredRecipeId: null,
      defaultRecipeIds: ["keep-draft"],
      candidateRecipeIds: ["keep-draft"],
    };
    const resolved = new Map([
      ["keep-draft", recipe({ id: "keep-draft", status: "draft" })],
      ["new-pub", recipe({ id: "new-pub", status: "published" })],
      ["new-draft", recipe({ id: "new-draft", status: "draft" })],
    ]);

    const retain = validateNewsletterCampaignContentUpdate({
      previous,
      nextRaw: {
        subject: "Updated",
        defaultRecipeIds: ["keep-draft"],
        candidateRecipeIds: ["keep-draft"],
      },
      resolved,
    });
    assert.equal(retain.ok, true);
    if (retain.ok) {
      assert.deepEqual(retain.data.defaultRecipeIds, ["keep-draft"]);
      assert.equal(retain.data.subject, "Updated");
    }

    const rejectDraft = validateNewsletterCampaignContentUpdate({
      previous,
      nextRaw: {
        defaultRecipeIds: ["keep-draft", "new-draft"],
        candidateRecipeIds: ["keep-draft", "new-draft"],
      },
      resolved,
    });
    assert.equal(rejectDraft.ok, false);
    if (!rejectDraft.ok) assert.equal(rejectDraft.code, "invalid_recipe");

    const rejectMissing = validateNewsletterCampaignContentUpdate({
      previous,
      nextRaw: {
        defaultRecipeIds: ["keep-draft", "missing"],
        candidateRecipeIds: ["keep-draft", "missing"],
      },
      resolved,
    });
    assert.equal(rejectMissing.ok, false);
  });

  it("merges defaults into candidate pool on validate", () => {
    const previous = {
      subject: "",
      preheader: "",
      intro: "",
      featuredRecipeId: null,
      defaultRecipeIds: [],
      candidateRecipeIds: [],
    };
    const resolved = new Map([["a", recipe({ id: "a" })]]);
    const result = validateNewsletterCampaignContentUpdate({
      previous,
      nextRaw: {
        defaultRecipeIds: ["a"],
        candidateRecipeIds: [],
      },
      resolved,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.data.candidateRecipeIds.includes("a"));
    }
  });

  it("collects recipe IDs and readiness labels", () => {
    assert.deepEqual(
      collectNewsletterCampaignRecipeIds({
        subject: "",
        preheader: "",
        intro: "",
        featuredRecipeId: "f",
        defaultRecipeIds: ["a"],
        candidateRecipeIds: ["b", "a"],
      }).sort(),
      ["a", "b", "f"],
    );
    assert.equal(newsletterCampaignReadinessLabel(true), "Ready");
    assert.equal(newsletterCampaignReadinessLabel(false), "Not ready");
  });

  it("uses preview unsubscribe placeholder without real token mint", () => {
    assert.match(NEWSLETTER_CAMPAIGN_PREVIEW_UNSUBSCRIBE_URL, /token=preview/);
    assert.doesNotMatch(NEWSLETTER_CAMPAIGN_PREVIEW_UNSUBSCRIBE_URL, /localhost/i);
  });
});
