import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  contentCalendarMonthWindow,
  istanbulDateKeyFromUtc,
  istanbulTimeFromUtc,
  parseCalendarYearMonth,
  shiftCalendarMonth,
} from "@/lib/content-calendar/ranges";
import {
  filterCalendarEntries,
  sortCalendarEntries,
  youtubeStatusLabel,
  youtubeVideoTypeLabel,
} from "@/lib/content-calendar/entries";
import type { ContentCalendarEntry } from "@/lib/content-calendar/types";
import { zonedLocalToUtc } from "@/lib/youtube-data/release-planner";
import { canAccess } from "@/lib/admin-access";

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("phase 7C — timezone / month bounds", () => {
  it("maps UTC instants to Europe/Istanbul date keys near midnight", () => {
    // 2026-09-10 22:00 UTC = 2026-09-11 01:00 Istanbul
    const utc = new Date("2026-09-10T22:00:00.000Z");
    assert.equal(istanbulDateKeyFromUtc(utc), "2026-09-11");
    assert.equal(istanbulTimeFromUtc(utc), "01:00");
  });

  it("builds Istanbul-safe month windows", () => {
    const ref = parseCalendarYearMonth({ year: 2026, month: 9 });
    assert.equal(ref.monthKey, "2026-09");
    const window = contentCalendarMonthWindow(ref);
    assert.equal(window.startDateKey, "2026-09-01");
    assert.equal(window.endDateKey, "2026-09-30");
    assert.equal(istanbulDateKeyFromUtc(window.rangeStartUtc), "2026-09-01");
    assert.equal(istanbulDateKeyFromUtc(window.rangeEndExclusiveUtc), "2026-10-01");
    assert.deepEqual(shiftCalendarMonth(ref, 1).monthKey, "2026-10");
  });

  it("converts Istanbul local wall clock without inventing Calendar tables", () => {
    const at = zonedLocalToUtc({
      timeZone: "Europe/Istanbul",
      year: 2026,
      month: 9,
      day: 11,
      hour: 14,
      minute: 30,
    });
    assert.equal(istanbulDateKeyFromUtc(at), "2026-09-11");
    assert.equal(istanbulTimeFromUtc(at), "14:30");
  });
});

describe("phase 7C — entry filtering / pairing", () => {
  const recipeAt = zonedLocalToUtc({
    timeZone: "Europe/Istanbul",
    year: 2026,
    month: 9,
    day: 11,
    hour: 14,
    minute: 30,
  });
  const youtubeAt = zonedLocalToUtc({
    timeZone: "Europe/Istanbul",
    year: 2026,
    month: 9,
    day: 11,
    hour: 15,
    minute: 0,
  });

  const fixtures: ContentCalendarEntry[] = [
    {
      source: "recipe",
      sourceId: "r1",
      title: "Crispy Rice with Eggs",
      at: recipeAt,
      localDateKey: "2026-09-11",
      localTime: "14:30",
      statusLabel: "Scheduled",
      needsAttention: false,
      href: "/admin/recipes/r1",
      performanceHref: "/admin/content-performance/recipes/r1",
      linkedRecipeId: "r1",
      linkedTitle: "Crispy Rice YT",
    },
    {
      source: "youtube",
      sourceId: "y1",
      title: "Crispy Rice YT",
      at: youtubeAt,
      localDateKey: "2026-09-11",
      localTime: "15:00",
      statusLabel: "Scheduled",
      videoType: "Long-form",
      href: "/admin/youtube?view=schedule&release=y1",
      linkedRecipeId: "r1",
      linkedTitle: "Crispy Rice with Eggs",
      youtubeVideoId: null,
    },
    {
      source: "youtube",
      sourceId: "y2",
      title: "Unlinked Short",
      at: youtubeAt,
      localDateKey: "2026-09-11",
      localTime: "16:00",
      statusLabel: "Planned",
      videoType: "Short",
      href: "/admin/youtube?view=schedule&release=y2",
      linkedRecipeId: null,
      linkedTitle: null,
      youtubeVideoId: null,
    },
  ];

  it("keeps Recipe and YouTube as separate events with different times", () => {
    const sorted = sortCalendarEntries(fixtures);
    assert.equal(sorted.length, 3);
    assert.equal(sorted[0]?.source, "recipe");
    assert.equal(sorted[0]?.localTime, "14:30");
    assert.equal(sorted[1]?.source, "youtube");
    assert.equal(sorted[1]?.localTime, "15:00");
  });

  it("filters by channel / linked without inventing shared status enums", () => {
    assert.equal(filterCalendarEntries(fixtures, { channel: "website" }).length, 1);
    assert.equal(filterCalendarEntries(fixtures, { channel: "youtube" }).length, 2);
    assert.equal(filterCalendarEntries(fixtures, { linked: "linked" }).length, 2);
    assert.equal(filterCalendarEntries(fixtures, { linked: "unlinked" }).length, 1);
  });

  it("preserves source status and video type labels", () => {
    assert.equal(youtubeStatusLabel("SCHEDULED"), "Scheduled");
    assert.equal(youtubeStatusLabel("PLANNED"), "Planned");
    assert.equal(youtubeVideoTypeLabel("SHORT"), "Short");
    assert.equal(youtubeVideoTypeLabel("LONG"), "Long-form");
  });
});

describe("phase 7C — wiring / ownership / boundaries", () => {
  it("derives Calendar from Recipe + YouTubeRelease without CalendarEvent table", () => {
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");
    assert.doesNotMatch(schema, /model (ContentCalendarEvent|CalendarEntry|ContentItem|UniversalContent)/);
    assert.match(schema, /model YouTubeRelease/);
    assert.match(schema, /recipeId\s+String\?/);
    assert.match(schema, /onDelete: SetNull/);
    assert.match(schema, /scheduledPublishAt/);
    assert.match(schema, /@@index\(\[publishedAt\]\)/);

    const load = read("lib/content-calendar/load.ts");
    assert.match(load, /scheduledPublishAt/);
    assert.match(load, /publishedAt/);
    assert.match(load, /youTubeRelease\.findMany/);
    assert.match(load, /getRecipePublishingReadiness|calendarScheduledReadinessFromCanonical/);
    assert.match(load, /loadTypeFieldsByTypeId|recipeTypeField\.findMany/);
    assert.doesNotMatch(load, /fields:\s*\[\s*\]/);
    assert.doesNotMatch(load, /SearchConsolePageMetric|GuestPageView|content-performance\/dashboard/);
    assert.doesNotMatch(load, /googleapis\.com/);
    assert.doesNotMatch(load, /createAdminNotification|recordAdminAuditEvent|RecipeRevision/);
  });

  it("wires Admin route under Publishing without drag/reschedule mutations", () => {
    const page = read("app/admin/(app)/content-calendar/page.tsx");
    assert.match(page, /Content Calendar/);
    assert.match(page, /Jump to Today/);
    assert.match(page, /Times shown in TRT/);
    assert.match(page, /Website|YouTube/);
    assert.match(page, /Needs attention/);
    assert.doesNotMatch(page, /drag|onDrop|Opportunity|forecast|viral|SEO score/i);
    assert.doesNotMatch(page, /scheduledPublishAt\s*=/);

    const nav = read("lib/admin-nav.ts");
    assert.match(nav, /\/admin\/content-calendar/);
    assert.match(nav, /Content Calendar/);

    const actions = read("app/admin/youtube-release-actions.ts");
    assert.match(actions, /recipeId/);
    assert.match(actions, /revalidatePath\("\/admin\/content-calendar"\)/);
  });

  it("keeps source ownership and permissions", () => {
    assert.equal(canAccess("editor", "content"), true);
    assert.equal(canAccess("editor", "youtube"), true);
    assert.equal(canAccess("members", "content"), false);
    const page = read("app/admin/(app)/content-calendar/page.tsx");
    assert.match(page, /canAccess\(admin\.role, "content"\)/);
    assert.match(page, /canAccess\(admin\.role, "youtube"\)/);
    assert.match(page, /contentCalendarAccessForRole/);
  });

  it("does not couple Calendar into health / performance / cron owners", () => {
    const siteHealth = read("lib/site-health.ts");
    assert.doesNotMatch(siteHealth, /content-calendar|Content Calendar/);
    const contentHealth = read("lib/recipe-content-health.ts");
    assert.doesNotMatch(contentHealth, /content-calendar/);
    const cron = read("app/api/cron/recipe-publish/route.ts");
    assert.doesNotMatch(cron, /content-calendar/);
    const vercel = readFileSync(path.join(srcRoot, "..", "vercel.json"), "utf8");
    assert.doesNotMatch(vercel, /content-calendar/);
  });
});
