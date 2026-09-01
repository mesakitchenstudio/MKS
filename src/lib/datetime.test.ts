import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatAdminShortDateTime, formatChannelSnapshotTrendShort } from "./datetime.ts";

describe("formatAdminShortDateTime", () => {
  const now = new Date("2026-08-28T10:00:00.000Z");

  it("formats UTC timestamps with an explicit GMT suffix", () => {
    assert.equal(
      formatAdminShortDateTime("2026-08-28T07:00:00.000Z", now),
      "Aug 28 · 7:00 AM GMT",
    );
    assert.equal(
      formatAdminShortDateTime("2026-08-27T23:22:00.000Z", now),
      "Aug 27 · 11:22 PM GMT",
    );
  });

  it("includes the year when requested or when the date is in another year", () => {
    assert.equal(
      formatAdminShortDateTime("2026-08-28T07:00:00.000Z", now, { includeYear: true }),
      "Aug 28, 2026 · 7:00 AM GMT",
    );
    assert.equal(
      formatAdminShortDateTime("2025-12-01T12:00:00.000Z", now),
      "Dec 1, 2025 · 12:00 PM GMT",
    );
  });
});

describe("formatChannelSnapshotTrendShort", () => {
  it("formats concise subscriber delta with since date", () => {
    const result = formatChannelSnapshotTrendShort({
      delta: "+10",
      fromRecordedAt: new Date("2026-08-30T14:32:00Z"),
      toRecordedAt: new Date("2026-09-01T10:20:00Z"),
    });
    assert.equal(result.short, "+10 since Aug 30");
    assert.match(result.title || "", /Aug 30, 2026/);
  });
});
