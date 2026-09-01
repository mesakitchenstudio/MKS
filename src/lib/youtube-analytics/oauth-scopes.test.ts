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
