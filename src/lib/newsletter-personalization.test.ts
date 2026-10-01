/**
 * Phase 12B — Pure newsletter personalization domain tests.
 * No DB writes. No Resend. No campaign model.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isNewsletterPersonalizationEnabled } from "./flags.ts";
import {
  NEWSLETTER_DIVERSITY_MAX_PER_INTEREST,
  NEWSLETTER_PERSONALIZATION_MIN_SCORE,
  NEWSLETTER_RECIPE_BLOCK_HARD_MAX,
  NEWSLETTER_RECIPE_BLOCK_LIMIT,
  NEWSLETTER_SCORE_CATEGORY_FOLLOW,
  NEWSLETTER_SCORE_CATEGORY_FOLLOW_CAP,
  NEWSLETTER_SCORE_SERIES_FOLLOW,
  canonicalizeNewsletterIdList,
  emptyNewsletterInterestProfile,
  isNewsletterRecipientEligible,
  normalizeNewsletterCandidates,
  normalizeNewsletterInterestProfile,
  recommendNewsletterRecipes,
  scoreNewsletterRecipeForProfile,
  selectNewsletterRecipeBlock,
  type NewsletterInterestProfile,
  type NewsletterRecipeCandidate,
} from "./newsletter-personalization.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

function readRepo(relFromSrc: string) {
  return readFileSync(path.join(root, "..", relFromSrc), "utf8");
}

function candidate(
  partial: Partial<NewsletterRecipeCandidate> & Pick<NewsletterRecipeCandidate, "id">,
): NewsletterRecipeCandidate {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    publishedAt: partial.publishedAt ?? "2024-06-01T00:00:00.000Z",
    status: partial.status ?? "published",
    seriesIds: partial.seriesIds ?? [],
    categoryIds: partial.categoryIds ?? [],
  };
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  // Deterministic pseudo-shuffle (no Math.random) for reproducibility of the test itself.
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = (i * 17 + 3) % (i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

describe("newsletter personalization — feature gate", () => {
  it("enables only exact lowercase true; never NEXT_PUBLIC", () => {
    const prev = process.env.NEWSLETTER_PERSONALIZATION_ENABLED;
    try {
      delete process.env.NEWSLETTER_PERSONALIZATION_ENABLED;
      assert.equal(isNewsletterPersonalizationEnabled(), false);

      process.env.NEWSLETTER_PERSONALIZATION_ENABLED = "false";
      assert.equal(isNewsletterPersonalizationEnabled(), false);

      process.env.NEWSLETTER_PERSONALIZATION_ENABLED = "TRUE";
      assert.equal(isNewsletterPersonalizationEnabled(), false);

      process.env.NEWSLETTER_PERSONALIZATION_ENABLED = "1";
      assert.equal(isNewsletterPersonalizationEnabled(), false);

      process.env.NEWSLETTER_PERSONALIZATION_ENABLED = "yes";
      assert.equal(isNewsletterPersonalizationEnabled(), false);

      process.env.NEWSLETTER_PERSONALIZATION_ENABLED = "true";
      assert.equal(isNewsletterPersonalizationEnabled(), true);
    } finally {
      if (prev === undefined) delete process.env.NEWSLETTER_PERSONALIZATION_ENABLED;
      else process.env.NEWSLETTER_PERSONALIZATION_ENABLED = prev;
    }

    const flags = readRepo("lib/flags.ts");
    assert.match(flags, /NEWSLETTER_PERSONALIZATION_ENABLED === "true"/);
    assert.doesNotMatch(flags, /NEXT_PUBLIC_NEWSLETTER_PERSONALIZATION/);
  });

  it("gate helper does not mutate NewsletterSubscriber or User.notify (contract)", () => {
    const flags = readRepo("lib/flags.ts");
    assert.doesNotMatch(flags, /newsletterSubscriber|User\.notify|subscribeNewsletter/);
  });
});

describe("newsletter personalization — recipient eligibility", () => {
  it("active + valid email → eligible", () => {
    assert.equal(
      isNewsletterRecipientEligible({ email: "Cook@Example.com", status: "active" }),
      true,
    );
  });

  it("unsubscribed → not eligible", () => {
    assert.equal(
      isNewsletterRecipientEligible({ email: "cook@example.com", status: "unsubscribed" }),
      false,
    );
  });

  it("active + invalid email → not eligible", () => {
    assert.equal(
      isNewsletterRecipientEligible({ email: "not-an-email", status: "active" }),
      false,
    );
    assert.equal(isNewsletterRecipientEligible({ email: "   ", status: "active" }), false);
  });

  it("null / missing subscriber → not eligible", () => {
    assert.equal(isNewsletterRecipientEligible(null), false);
    assert.equal(isNewsletterRecipientEligible(undefined), false);
  });

  it("anonymous active remains eligible (no User required)", () => {
    assert.equal(
      isNewsletterRecipientEligible({ email: "anon@example.com", status: "active" }),
      true,
    );
  });

  it("does not use User.notify — eligibility ignores notify entirely", () => {
    // Eligibility API has no notify field; source contract uses NewsletterSubscriber only.
    const domain = readRepo("lib/newsletter-personalization.ts");
    assert.match(domain, /isNewsletterRecipientEligible/);
    assert.doesNotMatch(domain, /subscriber\.notify|user\.notify|User\.notify/);
    assert.match(domain, /legacy member notify flags/);
  });

  it("normalizes Example@Email.com consistently for validation path", () => {
    assert.equal(
      isNewsletterRecipientEligible({ email: "Example@Email.com", status: "active" }),
      true,
    );
    assert.equal(
      isNewsletterRecipientEligible({ email: "example@email.com", status: "active" }),
      true,
    );
  });
});

describe("newsletter personalization — scoring", () => {
  const seriesId = "series-breads";
  const categoryId = "cat-desserts";

  it("Series follow scores +200 once; non-match scores 0", () => {
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: [seriesId],
      followedCategoryIds: [],
    };
    const hit = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r1", seriesIds: [seriesId, "series-other"] }),
    );
    assert.equal(hit.score, NEWSLETTER_SCORE_SERIES_FOLLOW);
    assert.equal(hit.reasons.length, 1);
    assert.deepEqual(hit.reasons[0], { kind: "series_follow", seriesId });

    const miss = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r2", seriesIds: ["series-other"] }),
    );
    assert.equal(miss.score, 0);
    assert.deepEqual(miss.reasons, []);
  });

  it("Category follow scores +100 and passes min; unfollowed is 0", () => {
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: [],
      followedCategoryIds: [categoryId],
    };
    const hit = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r1", categoryIds: [categoryId] }),
    );
    assert.equal(hit.score, NEWSLETTER_SCORE_CATEGORY_FOLLOW);
    assert.ok(hit.score >= NEWSLETTER_PERSONALIZATION_MIN_SCORE);
    assert.deepEqual(hit.reasons, [{ kind: "category_follow", categoryId }]);

    const miss = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r2", categoryIds: ["cat-other"] }),
    );
    assert.equal(miss.score, 0);
  });

  it("multiple Category matches are capped", () => {
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: [],
      followedCategoryIds: ["c1", "c2", "c3"],
    };
    const hit = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r1", categoryIds: ["c1", "c2", "c3"] }),
    );
    assert.equal(hit.score, NEWSLETTER_SCORE_CATEGORY_FOLLOW_CAP);
    assert.equal(hit.reasons.length, 3);
  });

  it("Series + Category ranks above Series-only; reasons include both", () => {
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: [seriesId],
      followedCategoryIds: [categoryId],
    };
    const both = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r-both", seriesIds: [seriesId], categoryIds: [categoryId] }),
    );
    const seriesOnly = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r-series", seriesIds: [seriesId] }),
    );
    const categoryOnly = scoreNewsletterRecipeForProfile(
      profile,
      candidate({ id: "r-cat", categoryIds: [categoryId] }),
    );

    assert.ok(both.score > seriesOnly.score);
    assert.ok(seriesOnly.score > categoryOnly.score);
    assert.equal(both.reasons[0]?.kind, "series_follow");
    assert.equal(both.reasons[1]?.kind, "category_follow");
  });

  it("empty profile yields score 0 and empty personalized recommendations", () => {
    const profile = emptyNewsletterInterestProfile("u1");
    const candidates = [
      candidate({ id: "r1", seriesIds: [seriesId] }),
      candidate({ id: "r2", categoryIds: [categoryId] }),
    ];
    for (const row of candidates) {
      assert.equal(scoreNewsletterRecipeForProfile(profile, row).score, 0);
    }
    assert.deepEqual(recommendNewsletterRecipes({ profile, candidates }), []);
  });

  it("Draft with perfect interest match is excluded", () => {
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: [seriesId],
      followedCategoryIds: [],
    };
    const ranked = recommendNewsletterRecipes({
      profile,
      candidates: [
        candidate({ id: "draft", status: "draft", seriesIds: [seriesId] }),
        candidate({ id: "pub", status: "published", seriesIds: [seriesId] }),
      ],
    });
    assert.deepEqual(
      ranked.map((row) => row.recipeId),
      ["pub"],
    );
  });

  it("excludedRecipeIds remove even perfect matches", () => {
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: [seriesId],
      followedCategoryIds: [],
    };
    const ranked = recommendNewsletterRecipes({
      profile,
      candidates: [
        candidate({ id: "hero", seriesIds: [seriesId] }),
        candidate({ id: "ok", seriesIds: [seriesId] }),
      ],
      excludedRecipeIds: ["hero"],
    });
    assert.deepEqual(
      ranked.map((row) => row.recipeId),
      ["ok"],
    );
  });

  it("determinism: shuffled profile IDs and candidates yield identical output", () => {
    const profile: NewsletterInterestProfile = normalizeNewsletterInterestProfile({
      userId: "u1",
      followedSeriesIds: shuffle(["series-b", "series-a"]),
      followedCategoryIds: shuffle(["cat-b", "cat-a"]),
    });
    const candidates = [
      candidate({
        id: "r-a",
        publishedAt: "2024-01-01T00:00:00.000Z",
        seriesIds: ["series-a"],
        categoryIds: ["cat-a"],
      }),
      candidate({
        id: "r-b",
        publishedAt: "2024-02-01T00:00:00.000Z",
        seriesIds: ["series-b"],
      }),
      candidate({
        id: "r-c",
        publishedAt: "2024-03-01T00:00:00.000Z",
        categoryIds: ["cat-b"],
      }),
      candidate({
        id: "r-d",
        publishedAt: "2023-01-01T00:00:00.000Z",
        seriesIds: ["series-a"],
        categoryIds: ["cat-b"],
      }),
    ];

    const a = recommendNewsletterRecipes({ profile, candidates: shuffle(candidates) });
    const b = recommendNewsletterRecipes({
      profile: {
        ...profile,
        followedSeriesIds: shuffle(profile.followedSeriesIds),
        followedCategoryIds: shuffle(profile.followedCategoryIds),
      },
      candidates: shuffle(candidates),
    });
    assert.deepEqual(a, b);
  });

  it("freshness is tie-break only (same score → newer publishedAt first)", () => {
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: [seriesId],
      followedCategoryIds: [],
    };
    const ranked = recommendNewsletterRecipes({
      profile,
      candidates: [
        candidate({
          id: "older",
          publishedAt: "2020-01-01T00:00:00.000Z",
          seriesIds: [seriesId],
        }),
        candidate({
          id: "newer",
          publishedAt: "2025-01-01T00:00:00.000Z",
          seriesIds: [seriesId],
        }),
      ],
    });
    assert.equal(ranked[0]?.recipeId, "newer");
    assert.equal(ranked[0]?.score, ranked[1]?.score);
  });

  it("duplicate candidates collapse to one", () => {
    const normalized = normalizeNewsletterCandidates([
      candidate({ id: "r1", status: "draft", seriesIds: [seriesId] }),
      candidate({ id: "r1", status: "published", seriesIds: [seriesId] }),
    ]);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0]?.status, "published");
  });

  it("canonicalize IDs sorts and dedupes", () => {
    assert.deepEqual(canonicalizeNewsletterIdList(["b", "a", "b", ""]), ["a", "b"]);
  });
});

describe("newsletter personalization — diversity", () => {
  it("spreads across two interests when both have eligible candidates", () => {
    assert.equal(NEWSLETTER_DIVERSITY_MAX_PER_INTEREST, 2);
    const profile: NewsletterInterestProfile = {
      userId: "u1",
      followedSeriesIds: ["series-bread"],
      followedCategoryIds: ["cat-dessert"],
    };
    const candidates = [
      candidate({
        id: "bread-a",
        publishedAt: "2025-06-01T00:00:00.000Z",
        seriesIds: ["series-bread"],
      }),
      candidate({
        id: "bread-b",
        publishedAt: "2025-05-01T00:00:00.000Z",
        seriesIds: ["series-bread"],
      }),
      candidate({
        id: "bread-c",
        publishedAt: "2025-04-01T00:00:00.000Z",
        seriesIds: ["series-bread"],
      }),
      candidate({
        id: "dessert-d",
        publishedAt: "2025-03-01T00:00:00.000Z",
        categoryIds: ["cat-dessert"],
      }),
      candidate({
        id: "dessert-e",
        publishedAt: "2025-02-01T00:00:00.000Z",
        categoryIds: ["cat-dessert"],
      }),
    ];

    const ranked = recommendNewsletterRecipes({ profile, candidates, limit: 3 });
    assert.equal(ranked.length, 3);
    const ids = ranked.map((row) => row.recipeId);
    assert.ok(ids.includes("dessert-d") || ids.includes("dessert-e"));
    assert.ok(ids.some((id) => id.startsWith("bread-")));
    assert.ok(!ids.every((id) => id.startsWith("bread-")));
  });
});

describe("newsletter personalization — block / fallback", () => {
  const pool = [
    candidate({ id: "A", publishedAt: "2024-01-01T00:00:00.000Z" }),
    candidate({ id: "B", publishedAt: "2024-02-01T00:00:00.000Z" }),
    candidate({ id: "C", publishedAt: "2024-03-01T00:00:00.000Z" }),
    candidate({ id: "P", seriesIds: ["series-bread"], publishedAt: "2024-04-01T00:00:00.000Z" }),
  ];

  it("anonymous / empty profile → editorial fallback A,B,C", () => {
    const block = selectNewsletterRecipeBlock({
      profile: emptyNewsletterInterestProfile(null),
      candidates: pool,
      fallbackRecipeIds: ["A", "B", "C"],
      limit: 3,
    });
    assert.equal(block.mode, "fallback");
    assert.deepEqual(
      block.items.map((item) => ({ id: item.recipeId, source: item.source })),
      [
        { id: "A", source: "fallback" },
        { id: "B", source: "fallback" },
        { id: "C", source: "fallback" },
      ],
    );
  });

  it("linked no-signal member → same editorial fallback", () => {
    const block = selectNewsletterRecipeBlock({
      profile: emptyNewsletterInterestProfile("user-1"),
      candidates: pool,
      fallbackRecipeIds: ["A", "B", "C"],
    });
    assert.equal(block.mode, "fallback");
    assert.deepEqual(
      block.items.map((item) => item.recipeId),
      ["A", "B", "C"],
    );
  });

  it("one personalized + fill → P,A,B", () => {
    const block = selectNewsletterRecipeBlock({
      profile: {
        userId: "u1",
        followedSeriesIds: ["series-bread"],
        followedCategoryIds: [],
      },
      candidates: pool,
      fallbackRecipeIds: ["A", "B", "C"],
      limit: 3,
    });
    assert.equal(block.mode, "personalized");
    assert.deepEqual(
      block.items.map((item) => ({ id: item.recipeId, source: item.source })),
      [
        { id: "P", source: "personalized" },
        { id: "A", source: "fallback" },
        { id: "B", source: "fallback" },
      ],
    );
  });

  it("personalized ID also in fallback appears once", () => {
    const block = selectNewsletterRecipeBlock({
      profile: {
        userId: "u1",
        followedSeriesIds: ["series-bread"],
        followedCategoryIds: [],
      },
      candidates: pool,
      fallbackRecipeIds: ["P", "A", "B", "C"],
      limit: 3,
    });
    assert.deepEqual(
      block.items.map((item) => item.recipeId),
      ["P", "A", "B"],
    );
    assert.equal(block.items[0]?.source, "personalized");
  });

  it("Draft fallback is skipped", () => {
    const block = selectNewsletterRecipeBlock({
      profile: emptyNewsletterInterestProfile(null),
      candidates: [
        candidate({ id: "A", status: "draft" }),
        candidate({ id: "B" }),
        candidate({ id: "C" }),
      ],
      fallbackRecipeIds: ["A", "B", "C"],
      limit: 3,
    });
    assert.deepEqual(
      block.items.map((item) => item.recipeId),
      ["B", "C"],
    );
  });

  it("clamps limit to hard max 4", () => {
    assert.equal(NEWSLETTER_RECIPE_BLOCK_LIMIT, 3);
    assert.equal(NEWSLETTER_RECIPE_BLOCK_HARD_MAX, 4);
    const many = ["A", "B", "C", "D", "E"].map((id) => candidate({ id }));
    const block = selectNewsletterRecipeBlock({
      profile: emptyNewsletterInterestProfile(null),
      candidates: many,
      fallbackRecipeIds: ["A", "B", "C", "D", "E"],
      limit: 99,
    });
    assert.equal(block.items.length, 4);
  });

  it("empty personalized + empty valid fallback → []", () => {
    const block = selectNewsletterRecipeBlock({
      profile: emptyNewsletterInterestProfile(null),
      candidates: [candidate({ id: "A", status: "draft" })],
      fallbackRecipeIds: ["A", "missing"],
    });
    assert.deepEqual(block.items, []);
    assert.equal(block.mode, "fallback");
  });
});

describe("newsletter personalization — privacy / scope contracts", () => {
  it("pure domain has no DB, env, Resend, saves, search analytics, or planner imports", () => {
    const domain = readRepo("lib/newsletter-personalization.ts");
    assert.doesNotMatch(domain, /getDb|Prisma|process\.env|Resend|sendTransactional/);
    assert.doesNotMatch(domain, /from ["']@\/lib\/(accounts|recently-viewed|search-analytics|meal-planner)/);
    assert.doesNotMatch(domain, /RecipeSave|recipeSave/);
    assert.doesNotMatch(domain, /Date\.now|Math\.random/);
    assert.doesNotMatch(domain, /console\.(log|info|warn|error)/);
  });

  it("interest profile type comments forbid PII fields", () => {
    const domain = readRepo("lib/newsletter-personalization.ts");
    assert.match(domain, /never email, name, private notes/);
  });
});
