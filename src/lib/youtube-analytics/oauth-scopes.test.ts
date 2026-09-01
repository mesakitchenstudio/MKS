import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyticsScopesAreSufficient,
  canReadYoutubeAnalytics,
  canWriteYoutubeVideoMetadata,
  chapterSyncWriteScopesAreSufficient,
  YT_ANALYTICS_SCOPES,
  YT_WRITE_SCOPE,
} from "@/lib/youtube-analytics/oauth-scopes";
import { youtubeChapterSyncEnabled } from "@/lib/youtube-chapter-sync/sync-metadata";

test("analytics-only connection → canWrite false", () => {
  const scopes = YT_ANALYTICS_SCOPES.join(" ");
  assert.equal(analyticsScopesAreSufficient(scopes), true);
  assert.equal(canReadYoutubeAnalytics(scopes), true);
  assert.equal(canWriteYoutubeVideoMetadata(scopes), false);
  assert.equal(chapterSyncWriteScopesAreSufficient(scopes), false);
});

test("required write scope → canWrite true", () => {
  const scopes = [...YT_ANALYTICS_SCOPES, YT_WRITE_SCOPE].join(" ");
  assert.equal(chapterSyncWriteScopesAreSufficient(scopes), true);
  assert.equal(canWriteYoutubeVideoMetadata(scopes), true);
});

test("reconnect union preserves Analytics scopes", () => {
  const scopes = [...YT_ANALYTICS_SCOPES, YT_WRITE_SCOPE].join(" ");
  for (const required of YT_ANALYTICS_SCOPES) {
    assert.ok(scopes.includes(required));
  }
});

test("canWrite requires granted scope in token — not request flag alone", () => {
  const analyticsOnly = "https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly";
  assert.equal(canWriteYoutubeVideoMetadata(analyticsOnly), false);
  assert.equal(canWriteYoutubeVideoMetadata(""), false);
});

test("youtubeChapterSyncEnabled defaults false when unset", (t) => {
  const prior = process.env.YOUTUBE_CHAPTER_SYNC_ENABLED;
  t.after(() => {
    if (prior === undefined) delete process.env.YOUTUBE_CHAPTER_SYNC_ENABLED;
    else process.env.YOUTUBE_CHAPTER_SYNC_ENABLED = prior;
  });
  delete process.env.YOUTUBE_CHAPTER_SYNC_ENABLED;
  assert.equal(youtubeChapterSyncEnabled(), false);
});
