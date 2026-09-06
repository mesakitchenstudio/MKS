import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_CADENCE, PLANNER_START_DATE } from "./release-cadence.ts";
import {
  RELEASE_ATTENTION_GRACE_MS,
  buildArchiveMonthJumper,
  buildMonthJumper,
  deriveAttention,
  filterYoutubeArchiveRows,
  formatIstanbulParts,
  isThisWeekIstanbul,
  mergePlannerRows,
  projectCadenceSlots,
  projectCadenceSlotsForMonth,
  selectPlannerUpNext,
  zonedLocalToUtc,
} from "./release-planner.ts";

describe("youtube release planner", () => {
  it("month jumper starts Sep 2026 (no Jan–Aug 2026)", () => {
    const jumper = buildMonthJumper(new Date("2026-09-06T12:00:00.000Z"));
    assert.equal(jumper[0]?.year, 2026);
    assert.deepEqual(
      jumper[0]?.months.map((m) => m.month),
      [9, 10, 11, 12],
    );
    assert.equal(
      jumper[0]?.months.some((m) => m.month < 9),
      false,
    );

    const later = buildMonthJumper(new Date("2027-03-15T12:00:00.000Z"));
    const y2027 = later.find((y) => y.year === 2027);
    assert.ok(y2027);
    assert.deepEqual(
      y2027.months.map((m) => m.month),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
    assert.equal(y2027.months.find((m) => m.month === 3)?.isCurrent, true);
  });

  it("projects Friday 15:00 Istanbul slots from Sep 2026", () => {
    // Saturday 2026-09-05 12:00 UTC = 15:00 Istanbul — still before first Friday after start.
    const now = new Date("2026-09-05T12:00:00.000Z");
    const slots = projectCadenceSlots({
      cadence: DEFAULT_CADENCE,
      from: now,
      weeksAhead: 12,
      now,
    });

    assert.ok(slots.length > 0);
    assert.equal(slots[0]?.slotKey, "2026-09-11");
    assert.equal(slots[0]?.timeLabel, "15:00");
    assert.equal(slots[0]?.weekdayShort, "Fri");
    // 15:00 Istanbul = 12:00 UTC
    assert.equal(slots[0]?.releaseAt.toISOString(), "2026-09-11T12:00:00.000Z");

    for (const slot of slots) {
      assert.ok(slot.dateKey >= PLANNER_START_DATE.slice(0, 10));
      assert.ok(!slot.dateKey.startsWith("2026-0") || slot.dateKey >= "2026-09-01");
      assert.match(slot.dateKey, /^2026-(09|10|11|12)-/);
    }
  });

  it("bounds projection to ~12 weeks and skips pre-September 2026", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const slots = projectCadenceSlots({
      cadence: DEFAULT_CADENCE,
      from: now,
      weeksAhead: 12,
      now,
    });

    const horizon = now.getTime() + 12 * 7 * 24 * 60 * 60 * 1000;
    for (const slot of slots) {
      assert.ok(slot.releaseAt.getTime() <= horizon);
    }

    // Even if "now" were earlier in 2026, planner floor is Sep 2026.
    const early = projectCadenceSlots({
      cadence: DEFAULT_CADENCE,
      from: new Date("2026-06-01T12:00:00.000Z"),
      weeksAhead: 20,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    assert.ok(early.every((s) => s.dateKey >= "2026-09-01"));
    assert.equal(early[0]?.slotKey, "2026-09-04");
  });

  it("grace period attention waits 2 hours past releaseAt", () => {
    const releaseAt = new Date("2026-09-11T12:00:00.000Z");
    assert.equal(
      deriveAttention({
        releaseAt,
        status: "PLANNED",
        now: new Date(releaseAt.getTime() + RELEASE_ATTENTION_GRACE_MS - 1),
      }).needsAttention,
      false,
    );
    assert.equal(
      deriveAttention({
        releaseAt,
        status: "OPEN",
        now: new Date(releaseAt.getTime() + RELEASE_ATTENTION_GRACE_MS + 1),
      }).needsAttention,
      true,
    );
    assert.equal(
      deriveAttention({
        releaseAt,
        status: "PUBLISHED",
        now: new Date(releaseAt.getTime() + RELEASE_ATTENTION_GRACE_MS + 1),
      }).needsAttention,
      false,
    );
    assert.equal(
      deriveAttention({
        releaseAt,
        status: "SKIPPED",
        now: new Date(releaseAt.getTime() + RELEASE_ATTENTION_GRACE_MS + 1),
      }).needsAttention,
      false,
    );
  });

  it("formats Istanbul parts for labels and keys", () => {
    // 12:00 UTC = 15:00 Istanbul
    const parts = formatIstanbulParts(new Date("2026-09-11T12:00:00.000Z"));
    assert.equal(parts.weekdayShort, "Fri");
    assert.equal(parts.day, 11);
    assert.equal(parts.monthShort, "Sep");
    assert.equal(parts.year, 2026);
    assert.equal(parts.time24, "15:00");
    assert.equal(parts.monthKey, "2026-09");
    assert.equal(parts.dateKey, "2026-09-11");
    assert.equal(parts.label, "Fri 11 · Sep");
    assert.equal(parts.timeLabel, "15:00");
  });

  it("supports multiple same-day rows while filling open Friday slots", () => {
    const friday = zonedLocalToUtc({
      year: 2026,
      month: 9,
      day: 11,
      hour: 15,
      minute: 0,
    });
    const openSlots = projectCadenceSlots({
      cadence: DEFAULT_CADENCE,
      from: new Date("2026-09-06T12:00:00.000Z"),
      weeksAhead: 2,
      now: new Date("2026-09-06T12:00:00.000Z"),
    });

    const rows = mergePlannerRows({
      now: new Date("2026-09-06T12:00:00.000Z"),
      openSlots,
      localReleases: [
        {
          id: "short-1",
          status: "PLANNED",
          workingTitle: "Quick tip short",
          videoType: "SHORT",
          releaseAt: friday,
          slotKey: "2026-09-11",
          notes: "",
          skipReason: "",
          youtubeVideoId: null,
        },
        {
          id: "long-1",
          status: "PLANNED",
          workingTitle: "Friday long-form",
          videoType: "LONG",
          releaseAt: friday,
          slotKey: "2026-09-11",
          notes: "",
          skipReason: "",
          youtubeVideoId: null,
        },
      ],
      youtubeVideos: [],
    });

    const dayRows = rows.filter((r) => r.dateKey === "2026-09-11");
    assert.equal(dayRows.length, 2);
    assert.equal(
      dayRows.every((r) => r.source === "local"),
      true,
    );
    assert.equal(
      rows.some((r) => r.source === "open" && r.slotKey === "2026-09-11"),
      false,
    );
  });

  it("YouTube scheduled video fills the matching Istanbul Friday open slot", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const openSlots = projectCadenceSlots({ cadence: DEFAULT_CADENCE, from: now, weeksAhead: 4, now });
    const rows = mergePlannerRows({
      now,
      openSlots,
      localReleases: [],
      youtubeVideos: [
        {
          videoId: "abc123XYZ01",
          title: "Scheduled upload",
          thumbnailUrl: "",
          scheduledPublishAt: new Date("2026-09-11T12:00:00.000Z"),
          publishedAt: null,
          privacyStatus: "private",
        },
      ],
    });

    assert.equal(
      rows.some((r) => r.source === "open" && r.slotKey === "2026-09-11"),
      false,
    );
    assert.equal(
      rows.some((r) => r.source === "youtube" && r.youtubeVideoId === "abc123XYZ01"),
      true,
    );
  });

  it("up next prefers concrete releases over open slots", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const openSlots = projectCadenceSlots({ cadence: DEFAULT_CADENCE, from: now, weeksAhead: 4, now });
    const rows = mergePlannerRows({
      now,
      openSlots,
      localReleases: [
        {
          id: "later",
          status: "PLANNED",
          workingTitle: "Later planned",
          videoType: "LONG",
          releaseAt: new Date("2026-09-25T12:00:00.000Z"),
          slotKey: "2026-09-25",
          notes: "",
          skipReason: "",
          youtubeVideoId: null,
        },
      ],
      youtubeVideos: [],
    });

    const upNext = selectPlannerUpNext(rows, now);
    assert.ok(upNext);
    assert.equal(upNext.source, "local");
    assert.equal(upNext.workingTitle, "Later planned");
  });

  it("isThisWeekIstanbul uses Europe/Istanbul week bounds", () => {
    const now = new Date("2026-09-09T12:00:00.000Z"); // Wed
    assert.equal(isThisWeekIstanbul(new Date("2026-09-07T12:00:00.000Z"), now), true); // Mon
    assert.equal(isThisWeekIstanbul(new Date("2026-09-13T12:00:00.000Z"), now), true); // Sun
    assert.equal(isThisWeekIstanbul(new Date("2026-09-14T12:00:00.000Z"), now), false); // next Mon
  });

  it("projectCadenceSlotsForMonth returns Friday slots for one YYYY-MM", () => {
    const slots = projectCadenceSlotsForMonth(DEFAULT_CADENCE, "2026-10");
    assert.deepEqual(
      slots.map((s) => s.slotKey),
      ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"],
    );
    assert.equal(slots.every((s) => s.monthKey === "2026-10"), true);
    assert.equal(slots.every((s) => s.timeLabel === "15:00"), true);
    assert.equal(slots.every((s) => s.weekdayShort === "Fri"), true);
  });

  it("projectCadenceSlotsForMonth respects planner start floor", () => {
    const beforeFloor = projectCadenceSlotsForMonth(DEFAULT_CADENCE, "2026-08");
    assert.equal(beforeFloor.length, 0);

    const september = projectCadenceSlotsForMonth(DEFAULT_CADENCE, "2026-09");
    assert.ok(september.length > 0);
    assert.equal(september[0]?.slotKey, "2026-09-04");
    assert.equal(
      september.every((s) => s.dateKey >= PLANNER_START_DATE.slice(0, 10)),
      true,
    );
  });

  it("mergePlannerRows uses youtube videoType when provided", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const rows = mergePlannerRows({
      now,
      openSlots: [],
      localReleases: [],
      youtubeVideos: [
        {
          videoId: "shortVid0001",
          title: "Quick tip #shorts",
          thumbnailUrl: "",
          scheduledPublishAt: new Date("2026-09-11T12:00:00.000Z"),
          publishedAt: null,
          privacyStatus: "private",
          videoType: "SHORT",
        },
        {
          videoId: "longVid00001",
          title: "Sunday roast",
          thumbnailUrl: "",
          scheduledPublishAt: null,
          publishedAt: new Date("2026-09-01T12:00:00.000Z"),
          privacyStatus: "public",
          videoType: "LONG",
        },
      ],
    });

    assert.equal(rows.find((r) => r.youtubeVideoId === "shortVid0001")?.videoType, "SHORT");
    assert.equal(rows.find((r) => r.youtubeVideoId === "longVid00001")?.videoType, "LONG");
  });

  it("filterYoutubeArchiveRows keeps only synced scheduled/published YouTube rows", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const merged = mergePlannerRows({
      now,
      openSlots: projectCadenceSlots({
        cadence: DEFAULT_CADENCE,
        from: now,
        weeksAhead: 4,
        now,
      }),
      localReleases: [
        {
          id: "local1",
          status: "PLANNED",
          workingTitle: "Local plan",
          videoType: "LONG",
          releaseAt: new Date("2026-09-18T12:00:00.000Z"),
          slotKey: "2026-09-18",
          notes: "",
          skipReason: "",
          youtubeVideoId: null,
        },
      ],
      youtubeVideos: [
        {
          videoId: "ytSched001",
          title: "Upcoming",
          thumbnailUrl: "",
          scheduledPublishAt: new Date("2026-09-11T12:00:00.000Z"),
          publishedAt: null,
          privacyStatus: "private",
          videoType: "SHORT",
        },
        {
          videoId: "ytPub00001",
          title: "Published",
          thumbnailUrl: "",
          scheduledPublishAt: null,
          publishedAt: new Date("2026-09-01T12:00:00.000Z"),
          privacyStatus: "public",
          videoType: "LONG",
        },
        {
          videoId: "ytPrivate01",
          title: "Sandy Eggplant 2026 01 27",
          thumbnailUrl: "",
          scheduledPublishAt: null,
          publishedAt: new Date("2026-01-27T12:00:00.000Z"),
          privacyStatus: "private",
          videoType: "LONG",
        },
      ],
    });

    assert.equal(merged.some((r) => r.youtubeVideoId === "ytPrivate01"), false);

    const archive = filterYoutubeArchiveRows(merged);
    assert.equal(archive.every((r) => r.source === "youtube"), true);
    assert.equal(
      archive.every((r) => r.status === "SCHEDULED" || r.status === "PUBLISHED"),
      true,
    );
    assert.equal(archive.some((r) => r.status === "OPEN"), false);
    assert.equal(archive.some((r) => r.source === "local"), false);
    assert.equal(archive.length, 2);

    const upNext = selectPlannerUpNext(archive, now);
    assert.equal(upNext?.youtubeVideoId, "ytSched001");
  });

  it("month counts and Up Next exclude private/unlisted unscheduled uploads", () => {
    const now = new Date("2026-09-06T12:00:00.000Z");
    const rows = mergePlannerRows({
      now,
      openSlots: [],
      localReleases: [],
      youtubeVideos: [
        {
          videoId: "pubFeb00001",
          title: "Public Feb",
          thumbnailUrl: "",
          scheduledPublishAt: null,
          publishedAt: new Date("2026-02-10T12:00:00.000Z"),
          privacyStatus: "public",
        },
        {
          videoId: "privFeb0001",
          title: "Sandy Eggplant 2026 01 27",
          thumbnailUrl: "",
          scheduledPublishAt: null,
          publishedAt: new Date("2026-02-15T12:00:00.000Z"),
          privacyStatus: "private",
        },
        {
          videoId: "unlistFeb01",
          title: "Unlisted upload",
          thumbnailUrl: "",
          scheduledPublishAt: null,
          publishedAt: new Date("2026-02-20T12:00:00.000Z"),
          privacyStatus: "unlisted",
        },
        {
          videoId: "schedSep001",
          title: "Future schedule",
          thumbnailUrl: "",
          scheduledPublishAt: new Date("2026-09-18T12:00:00.000Z"),
          publishedAt: new Date("2026-02-01T12:00:00.000Z"),
          privacyStatus: "private",
        },
        {
          videoId: "pastSched01",
          title: "Private past publishAt",
          thumbnailUrl: "",
          scheduledPublishAt: new Date("2026-02-01T12:00:00.000Z"),
          publishedAt: new Date("2026-02-01T12:00:00.000Z"),
          privacyStatus: "private",
        },
      ],
    });

    assert.equal(rows.length, 2);
    assert.equal(rows.filter((r) => r.monthKey === "2026-02").length, 1);
    assert.equal(rows.filter((r) => r.status === "PUBLISHED").length, 1);
    assert.equal(rows.filter((r) => r.status === "SCHEDULED").length, 1);
    assert.equal(selectPlannerUpNext(rows, now)?.youtubeVideoId, "schedSep001");
  });

  it("buildArchiveMonthJumper extends earlier when occupied months exist", () => {
    const jumper = buildArchiveMonthJumper(new Date("2026-09-06T12:00:00.000Z"), [
      "2026-08",
      "2026-09",
    ]);
    assert.equal(jumper[0]?.year, 2026);
    assert.equal(jumper[0]?.months[0]?.month, 8);
    assert.ok(jumper[0]?.months.some((m) => m.monthKey === "2026-09"));
  });
});
