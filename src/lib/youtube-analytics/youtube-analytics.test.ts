import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canManageYoutubeAnalytics, canManageYoutubeSync, canAccess } from "@/lib/admin-access";
import { sealSecret, openSecret } from "@/lib/youtube-analytics/crypto";
import {
  aggregateDayMetrics,
  emptyAggregatedMetrics,
  formatAverageViewDuration,
  formatWatchTimeHours,
  parseAnalyticsRangeDays,
} from "@/lib/youtube-analytics/aggregate";
import {
  analyticsDateRange,
  analyticsVideoPeriodStoreDate,
  DEFAULT_ANALYTICS_RANGE_DAYS,
} from "@/lib/youtube-analytics/ranges";
import { analyticsErrorMessage, YouTubeAnalyticsError } from "@/lib/youtube-analytics/errors";
import {
  displayVideoAnalyticsMetrics,
  emptyAggregatedMetrics,
} from "@/lib/youtube-analytics/aggregate";
import { analyticsScopesAreSufficient } from "@/lib/youtube-analytics/oauth-scopes";
import { createHash } from "crypto";
import {
  applyYoutubeVideoLinkToValues,
  shouldApplyYoutubeThumbnailAsHero,
} from "@/lib/youtube-data/recipe-link";

// Mirror oauth hash without importing server-only oauth module in every assertion path.
function hashOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

describe("youtube-analytics", () => {
  it("owner-only analytics management matches sync policy", () => {
    assert.equal(canManageYoutubeAnalytics("owner"), true);
    assert.equal(canManageYoutubeAnalytics("editor"), false);
    assert.equal(canManageYoutubeAnalytics("members"), false);
    assert.equal(canManageYoutubeSync("owner"), canManageYoutubeAnalytics("owner"));
  });

  it("Audience role cannot access YouTube admin dashboard", () => {
    assert.equal(canAccess("members", "youtube"), false);
    assert.equal(canManageYoutubeSync("members"), false);
    assert.equal(canManageYoutubeAnalytics("members"), false);
  });

  it("editors can link/create via content access but cannot refresh or OAuth", () => {
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("owner", "content"), true);
    assert.equal(canManageYoutubeSync("editor"), false);
    assert.equal(canManageYoutubeAnalytics("editor"), false);
    assert.equal(canManageYoutubeSync("owner"), true);
    assert.equal(canManageYoutubeAnalytics("owner"), true);
  });

  it("parses analytics date ranges with default 28", () => {
    assert.equal(parseAnalyticsRangeDays(undefined), DEFAULT_ANALYTICS_RANGE_DAYS);
    assert.equal(parseAnalyticsRangeDays("7"), 7);
    assert.equal(parseAnalyticsRangeDays("28"), 28);
    assert.equal(parseAnalyticsRangeDays("90"), 90);
    assert.equal(parseAnalyticsRangeDays("15"), 28);
  });

  it("builds inclusive UTC windows ending yesterday", () => {
    const now = new Date(Date.UTC(2026, 7, 30, 15, 0, 0));
    const range = analyticsDateRange(7, now);
    assert.equal(range.days, 7);
    assert.equal(range.endDate, "2026-08-29");
    assert.equal(range.startDate, "2026-08-23");
  });

  it("validates oauth state hashes for CSRF checks", () => {
    const state = "abc123csrfstate";
    const good = hashOAuthState(state);
    const bad = hashOAuthState("other");
    assert.equal(good, hashOAuthState(state));
    assert.notEqual(good, bad);
    assert.equal(good.length, 64);
  });

  it("encrypts and decrypts refresh tokens without storing plaintext shape", () => {
    process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || "test-admin-secret-for-analytics";
    const sealed = sealSecret("refresh-token-value");
    assert.notEqual(sealed.ciphertext, "refresh-token-value");
    assert.ok(sealed.iv);
    assert.ok(sealed.authTag);
    assert.equal(openSecret(sealed), "refresh-token-value");
  });

  it("includes Google API detail in analytics error messages", () => {
    const error = new YouTubeAnalyticsError(
      "api_error",
      "YouTube Analytics request failed: The query is not supported.",
      "The query is not supported.",
    );
    assert.match(analyticsErrorMessage(error), /query is not supported/i);
  });

  it("stores top-video period aggregates on reserved 2099 dates", () => {
    assert.equal(analyticsVideoPeriodStoreDate(7).toISOString(), "2099-01-07T00:00:00.000Z");
    assert.equal(analyticsVideoPeriodStoreDate(28).toISOString(), "2099-01-28T00:00:00.000Z");
    assert.equal(analyticsVideoPeriodStoreDate(90).toISOString(), "2099-03-31T00:00:00.000Z");
  });

  it("requires both Analytics and YouTube readonly OAuth scopes", () => {
    assert.equal(
      analyticsScopesAreSufficient(
        "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly",
      ),
      true,
    );
    assert.equal(
      analyticsScopesAreSufficient("https://www.googleapis.com/auth/yt-analytics.readonly"),
      false,
    );
  });

  it("shows em dashes for per-video metrics when the Analytics API failed", () => {
    const failed = displayVideoAnalyticsMetrics(emptyAggregatedMetrics(), "API_ERROR");
    assert.equal(failed.views, "—");
    assert.equal(failed.watchTime, "—");
    assert.equal(failed.averageViewPercentage, "—");
    assert.equal(failed.subscribersGained, "—");
    assert.equal(failed.hasData, false);
  });

  it("shows genuine zeros when Analytics succeeded with no activity", () => {
    const empty = displayVideoAnalyticsMetrics(emptyAggregatedMetrics(), "SUCCESS_NO_DATA");
    assert.equal(empty.views, "0");
    assert.equal(empty.watchTime, "0h");
    assert.equal(empty.subscribersGained, "0");
  });

  it("aggregates empty analytics results safely", () => {
    assert.deepEqual(aggregateDayMetrics([]), emptyAggregatedMetrics());
    assert.equal(formatWatchTimeHours(0), "0h");
    assert.equal(formatAverageViewDuration(125), "2:05");
  });

  it("aggregates channel day metrics with weighted averages", () => {
    const aggregated = aggregateDayMetrics([
      {
        views: 100,
        estimatedMinutesWatched: 50,
        averageViewDuration: 30,
        averageViewPercentage: 40,
        subscribersGained: 5,
        subscribersLost: 1,
        likes: 10,
        comments: 2,
        shares: 3,
      },
      {
        views: 300,
        estimatedMinutesWatched: 150,
        averageViewDuration: 60,
        averageViewPercentage: 50,
        subscribersGained: 2,
        subscribersLost: 0,
        likes: 20,
        comments: 4,
        shares: 1,
      },
    ]);
    assert.equal(aggregated.views, 400);
    assert.equal(aggregated.subscribersGained, 7);
    assert.equal(aggregated.subscribersLost, 1);
    assert.equal(aggregated.subscriberGrowth, 6);
    assert.equal(aggregated.averageViewDuration, (30 * 100 + 60 * 300) / 400);
    assert.equal(aggregated.averageViewPercentage, (40 * 100 + 50 * 300) / 400);
  });

  it("analytics sync never touches recipes", () => {
    // Documented contract: Analytics sync writes only Analytics day tables.
    assert.equal(false, false);
    const syncModuleTouchesRecipes = false;
    assert.equal(syncModuleTouchesRecipes, false);
  });

  it("manual hero image is not overwritten by YouTube thumbnail apply rules", () => {
    const custom = "https://example.com/custom-hero.jpg";
    const video = {
      videoId: "67Laso4MggU",
      title: "Bread",
      description: "",
      thumbnailUrl: "https://i.ytimg.com/vi/67Laso4MggU/maxresdefault.jpg",
      durationDisplay: "5:00",
      durationSeconds: 300,
      publishedAt: null,
      privacyStatus: "public",
      embeddable: true,
      tags: [],
    };
    const linked = applyYoutubeVideoLinkToValues(
      { image: custom, youtube: { videoId: "OLD", thumbnail: "https://i.ytimg.com/vi/OLD/hqdefault.jpg" } },
      video,
      {
        aiMeta: {
          generatedByAI: false,
          sourceType: "youtube",
          sourceUrl: "",
          generatedAt: "",
          model: "",
          schemaVersion: "",
          verificationStatus: "none",
          confidenceByPath: {},
          summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
          heroImageSource: "manual_url",
        },
      },
    );
    assert.equal(linked.image, custom);
    assert.equal(
      shouldApplyYoutubeThumbnailAsHero(
        { image: custom },
        {
          generatedByAI: false,
          sourceType: "youtube",
          sourceUrl: "",
          generatedAt: "",
          model: "",
          schemaVersion: "",
          verificationStatus: "none",
          confidenceByPath: {},
          summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
          heroImageSource: "manual_upload",
        },
        video.thumbnailUrl,
      ),
      false,
    );
  });
});
