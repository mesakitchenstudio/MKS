import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAdminDate,
  formatAdminDateTime,
  formatAdminDateTimeUtc,
  formatAdminRelativeDateTime,
  formatAdminShortDateTime,
  formatChannelSnapshotTrendShort,
  formatGmtDisplay,
  MESA_ADMIN_TIME_ZONE,
  MESA_ADMIN_TIME_ZONE_LABEL,
} from "./datetime.ts";

describe("mesa admin timezone constants", () => {
  it("pins Admin display to Europe/Istanbul (TRT)", () => {
    assert.equal(MESA_ADMIN_TIME_ZONE, "Europe/Istanbul");
    assert.equal(MESA_ADMIN_TIME_ZONE_LABEL, "TRT");
  });
});

describe("formatAdminDateTime", () => {
  it("formats UTC 09:00 as TRT 12:00 with explicit TRT suffix", () => {
    assert.equal(
      formatAdminDateTime("2026-09-13T09:00:00.000Z"),
      "Sep 13, 2026 · 12:00 PM TRT",
    );
  });

  it("formats UTC 21:30 as next Istanbul calendar day 00:30", () => {
    assert.equal(
      formatAdminDateTime("2026-09-13T21:30:00.000Z"),
      "Sep 14, 2026 · 12:30 AM TRT",
    );
  });

  it("handles year/month rollover across the TRT offset", () => {
    assert.equal(
      formatAdminDateTime("2025-12-31T22:15:00.000Z"),
      "Jan 1, 2026 · 1:15 AM TRT",
    );
  });
});

describe("formatAdminDateTimeUtc", () => {
  it("formats the same TRT instant without a per-row TRT suffix", () => {
    assert.equal(
      formatAdminDateTimeUtc("2026-09-02T18:20:00.000Z"),
      "Sep 2, 2026 · 9:20 PM",
    );
  });
});

describe("formatAdminShortDateTime", () => {
  const now = new Date("2026-08-28T10:00:00.000Z");

  it("formats timestamps in TRT with an explicit TRT suffix", () => {
    assert.equal(
      formatAdminShortDateTime("2026-08-28T07:00:00.000Z", now),
      "Aug 28 · 10:00 AM TRT",
    );
    assert.equal(
      formatAdminShortDateTime("2026-08-27T23:22:00.000Z", now),
      "Aug 28 · 2:22 AM TRT",
    );
  });

  it("includes the year when requested or when the date is in another year", () => {
    assert.equal(
      formatAdminShortDateTime("2026-08-28T07:00:00.000Z", now, { includeYear: true }),
      "Aug 28, 2026 · 10:00 AM TRT",
    );
    assert.equal(
      formatAdminShortDateTime("2025-12-01T12:00:00.000Z", now),
      "Dec 1, 2025 · 3:00 PM TRT",
    );
  });
});

describe("formatAdminDate", () => {
  it("uses the Istanbul calendar day for date-only Admin labels", () => {
    assert.equal(formatAdminDate("2026-09-13T22:00:00.000Z"), "Sep 14, 2026");
  });
});

describe("formatAdminRelativeDateTime", () => {
  it("uses TRT calendar days for Today/Yesterday labels", () => {
    const now = new Date("2026-08-27T12:00:00.000Z"); // 15:00 TRT
    assert.equal(
      formatAdminRelativeDateTime("2026-08-27T07:58:00.000Z", now),
      "Today, 10:58 AM",
    );
    assert.equal(
      formatAdminRelativeDateTime("2026-08-26T16:12:00.000Z", now),
      "Yesterday, 7:12 PM",
    );
    assert.equal(
      formatAdminRelativeDateTime("2026-08-24T21:30:00.000Z", now),
      "Aug 25, 12:30 AM",
    );
  });
});

describe("formatGmtDisplay", () => {
  it("does not timezone-shift date-only style labels incorrectly", () => {
    // Instant mid-day UTC stays same Istanbul calendar day.
    assert.equal(formatGmtDisplay("2026-09-13T12:00:00.000Z"), "Sep 13, 2026");
    assert.equal(
      formatGmtDisplay("2026-09-13T09:00:00.000Z", { includeTime: true }),
      "Sep 13, 2026, 12:00 TRT",
    );
  });
});

describe("formatChannelSnapshotTrendShort", () => {
  it("formats concise subscriber delta with since date in TRT", () => {
    const result = formatChannelSnapshotTrendShort({
      delta: "+10",
      fromRecordedAt: new Date("2026-08-30T14:32:00Z"),
      toRecordedAt: new Date("2026-09-01T10:20:00Z"),
    });
    assert.equal(result.short, "+10 since Aug 30");
    assert.match(result.title || "", /Aug 30, 2026/);
    assert.match(result.title || "", /TRT/);
  });
});
