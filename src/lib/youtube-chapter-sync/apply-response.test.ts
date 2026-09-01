import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chapterSyncApplyErrorMessage,
  chapterSyncApplyUiFailure,
  chapterSyncApplyUiStart,
  chapterSyncApplyUiSuccess,
  createChapterSyncApplyFlightGuard,
  parseChapterSyncApplyHttpResponse,
  parseChapterSyncApplyPayload,
} from "@/lib/youtube-chapter-sync/apply-response";

test("createChapterSyncApplyFlightGuard allows one in-flight request", () => {
  const guard = createChapterSyncApplyFlightGuard();
  assert.equal(guard.tryAcquire(), true);
  assert.equal(guard.tryAcquire(), false);
  guard.release();
  assert.equal(guard.tryAcquire(), true);
});

test("chapterSyncApplyUiStart enables applying and clears modal error", () => {
  assert.deepEqual(chapterSyncApplyUiStart(), { applying: true, modalError: null });
});

test("chapterSyncApplyUiSuccess closes modal and stores success message", () => {
  const next = chapterSyncApplyUiSuccess({
    lastSyncedAt: "2026-01-15T12:00:00.000Z",
  });
  assert.equal(next.confirmOpen, false);
  assert.equal(next.applying, false);
  assert.match(next.successMessage ?? "", /YouTube chapters updated successfully/);
  assert.match(next.successMessage ?? "", /Last synced:/);
});

test("chapterSyncApplyUiFailure keeps modal open with error", () => {
  const next = chapterSyncApplyUiFailure("YouTube rejected the update.");
  assert.equal(next.applying, false);
  assert.equal(next.modalError, "YouTube rejected the update.");
});

test("parseChapterSyncApplyPayload handles success", () => {
  const parsed = parseChapterSyncApplyPayload({
    ok: true,
    status: "synced",
    lastSyncedAt: "2026-01-15T12:00:00.000Z",
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.status, "synced");
    assert.equal(parsed.lastSyncedAt, "2026-01-15T12:00:00.000Z");
  }
});

test("parseChapterSyncApplyHttpResponse maps 409 drift to visible message", () => {
  const parsed = parseChapterSyncApplyHttpResponse({
    ok: false,
    status: 409,
    body: { ok: false, code: "remote_drift", error: "stale" },
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /description changed after this preview/i);
  }
});

test("parseChapterSyncApplyHttpResponse maps OAuth failure", () => {
  const parsed = parseChapterSyncApplyHttpResponse({
    ok: false,
    status: 403,
    body: { ok: false, code: "oauth_error", error: "expired" },
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /Reconnect YouTube/i);
  }
});

test("parseChapterSyncApplyHttpResponse maps 500 to controlled error", () => {
  const parsed = parseChapterSyncApplyHttpResponse({
    ok: false,
    status: 500,
    body: { ok: false, code: "internal", error: "boom" },
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(parsed.message, chapterSyncApplyErrorMessage(undefined));
  }
});

test("parseChapterSyncApplyPayload handles malformed JSON body", () => {
  const parsed = parseChapterSyncApplyPayload(null);
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /Unexpected server response/i);
  }
});

test("parseChapterSyncApplyPayload surfaces partial success warning", () => {
  const parsed = parseChapterSyncApplyPayload({
    ok: true,
    status: "synced",
    lastSyncedAt: "2026-01-15T12:00:00.000Z",
    warning: "YouTube was updated successfully, but Mesa could not record the sync status.",
    metadataStored: false,
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.match(parsed.warning ?? "", /could not record the sync status/i);
  }
});

test("network failure message is user-facing", () => {
  assert.match(chapterSyncApplyErrorMessage("network"), /connection/i);
});
