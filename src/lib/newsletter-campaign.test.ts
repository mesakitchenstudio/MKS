/**
 * Phase 12C — Newsletter campaign domain + email renderer tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX,
  NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX,
  NEWSLETTER_CAMPAIGN_INTRO_MAX,
  NEWSLETTER_CAMPAIGN_NAME_MAX,
  NEWSLETTER_CAMPAIGN_PREHEADER_MAX,
  NEWSLETTER_CAMPAIGN_SUBJECT_MAX,
  buildNewsletterCampaignEmailRecipeCards,
  getNewsletterCampaignSendReadiness,
  isNewsletterCampaignEditable,
  normalizeNewsletterCampaignContent,
  normalizeNewsletterCampaignStatus,
  selectNewsletterCampaignRecipeSelection,
  serializeNewsletterCampaignContent,
  type ResolvedNewsletterCampaignRecipe,
} from "./newsletter-campaign.ts";
import {
  NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING,
  NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING,
  buildNewsletterCampaignEmail,
  escapeNewsletterEmailText,
} from "./newsletter-campaign-email.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

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

describe("newsletter campaign — normalization", () => {
  it("normalizes Draft content safely including malformed JSON", () => {
    assert.deepEqual(normalizeNewsletterCampaignContent(null).defaultRecipeIds, []);
    assert.deepEqual(normalizeNewsletterCampaignContent("not-json").subject, "");
    const normalized = normalizeNewsletterCampaignContent({
      subject: "  Hello  ",
      preheader: "  Pre  ",
      intro: " Intro ",
      featuredRecipeId: " feat-1 ",
      defaultRecipeIds: ["a", "a", "", "b"],
      candidateRecipeIds: ["c", "a"],
      unknown: true,
    });
    assert.equal(normalized.subject, "Hello");
    assert.equal(normalized.featuredRecipeId, "feat-1");
    assert.deepEqual(normalized.defaultRecipeIds, ["a", "b"]);
    assert.ok(normalized.candidateRecipeIds.includes("a"));
    assert.ok(normalized.candidateRecipeIds.includes("b"));
    assert.ok(normalized.candidateRecipeIds.includes("c"));
  });

  it("merges defaults into candidate pool and clamps limits", () => {
    const defaults = Array.from({ length: 6 }, (_, i) => `d${i}`);
    const candidates = Array.from({ length: 25 }, (_, i) => `c${i}`);
    const normalized = normalizeNewsletterCampaignContent({
      defaultRecipeIds: defaults,
      candidateRecipeIds: candidates,
    });
    assert.ok(normalized.defaultRecipeIds.length <= NEWSLETTER_CAMPAIGN_DEFAULT_RECIPE_MAX);
    assert.ok(normalized.candidateRecipeIds.length <= NEWSLETTER_CAMPAIGN_CANDIDATE_RECIPE_MAX);
    for (const id of normalized.defaultRecipeIds) {
      assert.ok(normalized.candidateRecipeIds.includes(id));
    }
  });

  it("serializes round-trip without presentation fields", () => {
    const raw = serializeNewsletterCampaignContent({
      subject: "S",
      preheader: "P",
      intro: "I",
      featuredRecipeId: "f1",
      defaultRecipeIds: ["a"],
      candidateRecipeIds: ["a", "b"],
    });
    assert.doesNotMatch(raw, /slug|imageUrl|https:/);
    const again = normalizeNewsletterCampaignContent(raw);
    assert.equal(again.subject, "S");
    assert.deepEqual(again.defaultRecipeIds, ["a"]);
  });
});

describe("newsletter campaign — status / editability", () => {
  it("normalizes known statuses and treats unknown as not editable", () => {
    assert.equal(normalizeNewsletterCampaignStatus("draft"), "draft");
    assert.equal(normalizeNewsletterCampaignStatus("SENT"), "sent");
    assert.equal(normalizeNewsletterCampaignStatus("weird"), "unknown");
    assert.equal(isNewsletterCampaignEditable("draft"), true);
    assert.equal(isNewsletterCampaignEditable("sending"), false);
    assert.equal(isNewsletterCampaignEditable("sent"), false);
    assert.equal(isNewsletterCampaignEditable("weird"), false);
  });
});

describe("newsletter campaign — send readiness", () => {
  const published = [
    recipe({ id: "a", slug: "a" }),
    recipe({ id: "b", slug: "b" }),
    recipe({ id: "feat", slug: "feat" }),
  ];

  it("ready when draft with subject + published defaults", () => {
    const result = getNewsletterCampaignSendReadiness({
      name: "Spring",
      status: "draft",
      content: {
        subject: "New from Mesa",
        intro: "Hello",
        defaultRecipeIds: ["a"],
        candidateRecipeIds: ["a", "b"],
      },
      resolvedRecipes: published,
    });
    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
  });

  it("missing subject / missing fallback / locked status", () => {
    assert.ok(
      getNewsletterCampaignSendReadiness({
        name: "X",
        status: "draft",
        content: { defaultRecipeIds: ["a"], candidateRecipeIds: ["a"] },
        resolvedRecipes: published,
      }).issues.some((issue) => issue.code === "missing_subject"),
    );
    assert.ok(
      getNewsletterCampaignSendReadiness({
        name: "X",
        status: "draft",
        content: { subject: "Hi", defaultRecipeIds: [], candidateRecipeIds: [] },
        resolvedRecipes: published,
      }).issues.some((issue) => issue.code === "missing_defaults"),
    );
    assert.ok(
      getNewsletterCampaignSendReadiness({
        name: "X",
        status: "sent",
        content: { subject: "Hi", defaultRecipeIds: ["a"], candidateRecipeIds: ["a"] },
        resolvedRecipes: published,
      }).issues.some((issue) => issue.code === "locked_status"),
    );
  });

  it("Draft / missing / featured targets fail readiness", () => {
    const withDraft = [
      ...published,
      recipe({ id: "drafty", status: "draft", slug: "drafty" }),
    ];
    assert.ok(
      getNewsletterCampaignSendReadiness({
        name: "X",
        status: "draft",
        content: {
          subject: "Hi",
          defaultRecipeIds: ["drafty"],
          candidateRecipeIds: ["drafty"],
        },
        resolvedRecipes: withDraft,
      }).issues.some((issue) => issue.code === "draft_default_recipe"),
    );
    assert.ok(
      getNewsletterCampaignSendReadiness({
        name: "X",
        status: "draft",
        content: {
          subject: "Hi",
          featuredRecipeId: "gone",
          defaultRecipeIds: ["a"],
          candidateRecipeIds: ["a"],
        },
        resolvedRecipes: published,
      }).issues.some((issue) => issue.code === "missing_featured_recipe"),
    );
  });

  it("duplicate raw IDs produce readiness issue; gate OFF does not affect readiness", () => {
    const result = getNewsletterCampaignSendReadiness({
      name: "X",
      status: "draft",
      content: {
        subject: "Hi",
        defaultRecipeIds: ["a", "a"],
        candidateRecipeIds: ["a"],
      },
      resolvedRecipes: published,
    });
    assert.ok(result.issues.some((issue) => issue.code === "duplicate_recipe"));
  });

  it("enforces named content limits", () => {
    assert.equal(NEWSLETTER_CAMPAIGN_NAME_MAX, 120);
    assert.equal(NEWSLETTER_CAMPAIGN_SUBJECT_MAX, 140);
    assert.equal(NEWSLETTER_CAMPAIGN_PREHEADER_MAX, 200);
    assert.equal(NEWSLETTER_CAMPAIGN_INTRO_MAX, 3000);
    const longSubject = "x".repeat(NEWSLETTER_CAMPAIGN_SUBJECT_MAX + 1);
    assert.ok(
      getNewsletterCampaignSendReadiness({
        name: "X",
        status: "draft",
        content: {
          subject: longSubject,
          defaultRecipeIds: ["a"],
          candidateRecipeIds: ["a"],
        },
        resolvedRecipes: published,
      }).issues.some((issue) => issue.code === "subject_too_long"),
    );
  });
});

describe("newsletter campaign — selection orchestration", () => {
  const resolved = [
    recipe({ id: "feat", seriesIds: ["breads"] }),
    recipe({ id: "bread-a", seriesIds: ["breads"], publishedAt: "2025-01-01T00:00:00.000Z" }),
    recipe({ id: "dessert-a", categoryIds: ["desserts"], publishedAt: "2025-02-01T00:00:00.000Z" }),
    recipe({ id: "A" }),
    recipe({ id: "B" }),
    recipe({ id: "C" }),
  ];
  const content = {
    subject: "Hi",
    preheader: "",
    intro: "Intro",
    featuredRecipeId: "feat",
    defaultRecipeIds: ["A", "B", "C"],
    candidateRecipeIds: ["feat", "bread-a", "dessert-a", "A", "B", "C"],
  };

  it("anonymous / no-signal / gate OFF → fallback defaults; featured excluded", () => {
    const anon = selectNewsletterCampaignRecipeSelection({
      content,
      resolvedRecipes: resolved,
      personalizationEnabled: true,
      profile: { followedSeriesIds: [], followedCategoryIds: [] },
    });
    assert.equal(anon.featured?.id, "feat");
    assert.equal(anon.block.mode, "fallback");
    assert.deepEqual(
      anon.block.items.map((item) => item.recipeId),
      ["A", "B", "C"],
    );
    assert.ok(!anon.block.items.some((item) => item.recipeId === "feat"));

    const gateOff = selectNewsletterCampaignRecipeSelection({
      content,
      resolvedRecipes: resolved,
      personalizationEnabled: false,
      profile: {
        userId: "u1",
        followedSeriesIds: ["breads"],
        followedCategoryIds: ["desserts"],
      },
    });
    assert.equal(gateOff.block.mode, "fallback");
    assert.ok(!gateOff.block.items.some((item) => item.source === "personalized"));
  });

  it("Series / Category personalization with featured exclusion", () => {
    const series = selectNewsletterCampaignRecipeSelection({
      content,
      resolvedRecipes: resolved,
      personalizationEnabled: true,
      profile: {
        userId: "u1",
        followedSeriesIds: ["breads"],
        followedCategoryIds: [],
      },
    });
    assert.equal(series.block.mode, "personalized");
    assert.equal(series.block.items[0]?.recipeId, "bread-a");
    assert.equal(series.block.items[0]?.source, "personalized");
    assert.ok(!series.block.items.some((item) => item.recipeId === "feat"));

    const category = selectNewsletterCampaignRecipeSelection({
      content,
      resolvedRecipes: resolved,
      personalizationEnabled: true,
      profile: {
        userId: "u1",
        followedSeriesIds: [],
        followedCategoryIds: ["desserts"],
      },
    });
    assert.equal(category.block.items[0]?.recipeId, "dessert-a");
  });
});

describe("newsletter campaign — email renderer", () => {
  it("escapes XSS in subject/intro/title and keeps plain text readable", () => {
    const rendered = buildNewsletterCampaignEmail({
      subject: `<script>alert(1)</script>`,
      preheader: `<img onerror=alert(1)>`,
      intro: `Hello <b>there</b> & friends`,
      featured: {
        id: "f1",
        title: `Cookies <img src=x onerror=alert(1)>`,
        href: "https://www.mesakitchenstudio.com/recipes/cookies",
      },
      blockRecipes: [
        {
          id: "r1",
          title: `Bread & Butter`,
          href: "https://www.mesakitchenstudio.com/recipes/bread",
        },
      ],
      blockMode: "personalized",
      unsubscribeUrl: "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=fake",
    });

    assert.match(rendered.html, /&lt;script&gt;/);
    assert.doesNotMatch(rendered.html, /<script>alert/);
    assert.match(rendered.html, /Bread &amp; Butter/);
    assert.match(rendered.html, new RegExp(NEWSLETTER_CAMPAIGN_EMAIL_PERSONALIZED_HEADING));
    assert.match(rendered.text, /Bread & Butter/);
    // Plain text may include literal angle brackets from subject; they are not HTML markup.
    assert.match(rendered.text, /<script>alert\(1\)<\/script>/);
    assert.match(rendered.html, /Unsubscribe/);
    assert.match(
      rendered.text,
      /https:\/\/www\.mesakitchenstudio\.com\/newsletter\/unsubscribe\?token=fake/,
    );
  });

  it("uses absolute Recipe URLs, omits unsafe images, and excludes PII/reasons", () => {
    const cards = buildNewsletterCampaignEmailRecipeCards({
      baseUrl: "https://www.mesakitchenstudio.com",
      recipes: [
        recipe({
          id: "r1",
          slug: "test-recipe",
          title: "Test",
          imageUrl: "https://cdn.example.com/a.jpg",
        }),
        recipe({
          id: "r2",
          slug: "no-image",
          title: "No Image",
          imageUrl: "javascript:alert(1)",
        }),
      ],
    });
    assert.equal(cards[0]?.href, "https://www.mesakitchenstudio.com/recipes/test-recipe");
    const rendered = buildNewsletterCampaignEmail({
      subject: "Subject",
      intro: "Intro",
      blockRecipes: cards,
      blockMode: "fallback",
      unsubscribeUrl: "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=x",
    });
    assert.match(rendered.html, /cdn\.example\.com\/a\.jpg/);
    assert.doesNotMatch(rendered.html, /javascript:/);
    assert.match(rendered.html, new RegExp(NEWSLETTER_CAMPAIGN_EMAIL_FALLBACK_HEADING));
    assert.doesNotMatch(rendered.html, /userId|series_follow|category_follow/);
    assert.doesNotMatch(rendered.text, /userId|series_follow/);
    assert.doesNotMatch(rendered.html, /@example\.com/);
  });

  it("rejects non-http Recipe hrefs", () => {
    const rendered = buildNewsletterCampaignEmail({
      subject: "S",
      intro: "I",
      blockRecipes: [
        { id: "x", title: "Bad", href: "javascript:alert(1)" },
        { id: "y", title: "Ok", href: "https://www.mesakitchenstudio.com/recipes/ok" },
      ],
      blockMode: "fallback",
      unsubscribeUrl: "https://www.mesakitchenstudio.com/newsletter/unsubscribe?token=x",
    });
    assert.doesNotMatch(rendered.html, /javascript:/);
    assert.match(rendered.html, /\/recipes\/ok/);
  });

  it("escape helper encodes ampersands", () => {
    assert.equal(escapeNewsletterEmailText(`a & b < c`), `a &amp; b &lt; c`);
  });
});

describe("newsletter campaign — scope contracts", () => {
  it("domain/email modules do not call Resend or mutate consent", () => {
    const domain = readRepo("lib/newsletter-campaign.ts");
    const email = readRepo("lib/newsletter-campaign-email.ts");
    const server = readRepo("lib/newsletter-campaign-server.ts");

    assert.doesNotMatch(domain, /api\.resend\.com/);
    assert.doesNotMatch(email, /api\.resend\.com/);
    assert.doesNotMatch(server, /api\.resend\.com/);
    assert.doesNotMatch(domain, /sendTransactionalEmail/);
    assert.doesNotMatch(email, /sendTransactionalEmail/);
    assert.doesNotMatch(server, /sendTransactionalEmail/);
    assert.doesNotMatch(domain, /getDb\(/);
    assert.doesNotMatch(email, /getDb\(/);
    assert.doesNotMatch(email, /List-Unsubscribe/);
    assert.doesNotMatch(server, /subscribeNewsletterServer/);
    assert.match(server, /resolveNewsletterCampaignRecipes/);
    assert.match(domain, /Consent remains NewsletterSubscriber/);
    assert.doesNotMatch(domain + email + server, /NEXT_PUBLIC_NEWSLETTER/);
  });
});
