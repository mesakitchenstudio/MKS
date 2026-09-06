import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canAccess } from "../admin-access.ts";
import {
  coalesceScheduledPublishAt,
  formatScheduledPublishParts,
  isFutureScheduledPublishAt,
  resolveScheduledVideoTitles,
  scheduleFormatLabel,
  scheduledVideoStatusLabel,
  selectNextUpScheduledVideo,
  selectUpcomingScheduledVideos,
  youtubeStudioVideoUrl,
} from "./schedule.ts";
import { classifyYouTubeVideoFormat } from "./video-format.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(root, "..", "..");

function read(relFromSrc: string) {
  return readFileSync(path.join(srcRoot, relFromSrc), "utf8");
}

describe("youtube schedule helpers", () => {
  const now = new Date("2026-09-06T12:00:00.000Z");

  it("D/E/F/G/H: upcoming filters and Next Up ordering", () => {
    const rows = [
      { id: "past", scheduledPublishAt: new Date("2026-09-01T12:00:00.000Z") },
      { id: "later", scheduledPublishAt: new Date("2026-09-18T15:00:00.000Z") },
      { id: "next", scheduledPublishAt: new Date("2026-09-11T12:00:00.000Z") },
      { id: "draft", scheduledPublishAt: null as unknown as Date },
    ].filter((row) => row.scheduledPublishAt instanceof Date) as Array<{
      id: string;
      scheduledPublishAt: Date;
    }>;

    const upcoming = selectUpcomingScheduledVideos(rows, now);
    assert.deepEqual(
      upcoming.map((row) => row.id),
      ["next", "later"],
    );
    assert.equal(selectNextUpScheduledVideo(upcoming)?.id, "next");
    assert.equal(upcoming.slice(1).some((row) => row.id === "next"), false);
    assert.equal(isFutureScheduledPublishAt(new Date("2026-09-01T12:00:00.000Z"), now), false);
    assert.equal(isFutureScheduledPublishAt(null, now), false);
  });

  it("K: formats scheduled publish parts in GMT and Europe/Istanbul", () => {
    const parts = formatScheduledPublishParts(new Date("2026-09-08T12:00:00.000Z"));
    assert.equal(parts.dateLabel, "Sep 8, 2026");
    assert.equal(parts.timeLabel, "12:00 PM");
    assert.equal(parts.timezoneLabel, "GMT");
    assert.equal(parts.localTimeLabel, "3:00 PM");
    assert.equal(parts.localTimezoneLabel, "Istanbul");
  });

  it("prefers linked editorial identity over YouTube SEO title", () => {
    const linked = resolveScheduledVideoTitles({
      youtubeTitle: "How to make the perfect crispy potato puffs at home #cooking #snacks",
      linkedRecipeTitle: "Crispy Potato Puffs",
    });
    assert.equal(linked.displayTitle, "Crispy Potato Puffs");
    assert.equal(linked.showYoutubeTitle, true);

    const fallback = resolveScheduledVideoTitles({
      youtubeTitle: "How to make the perfect crispy potato puffs at home #cooking #snacks",
      linkedRecipeTitle: null,
    });
    assert.equal(
      fallback.displayTitle,
      "How to make the perfect crispy potato puffs at home #cooking #snacks",
    );
    assert.equal(fallback.showYoutubeTitle, false);
  });

  it("coalesceScheduledPublishAt clears past and missing publishAt", () => {
    assert.ok(coalesceScheduledPublishAt("2026-09-11T12:00:00.000Z", now));
    assert.equal(coalesceScheduledPublishAt("2026-09-01T12:00:00.000Z", now), null);
    assert.equal(coalesceScheduledPublishAt(null, now), null);
    assert.equal(coalesceScheduledPublishAt("", now), null);
  });

  it("status labels distinguish scheduled vs published vs private drafts", () => {
    assert.equal(
      scheduledVideoStatusLabel({
        scheduledPublishAt: new Date("2026-09-11T12:00:00.000Z"),
        privacyStatus: "private",
        now,
      }),
      "Scheduled",
    );
    assert.equal(
      scheduledVideoStatusLabel({
        scheduledPublishAt: null,
        privacyStatus: "public",
        now,
      }),
      "Published",
    );
    assert.equal(
      scheduledVideoStatusLabel({
        scheduledPublishAt: null,
        privacyStatus: "private",
        now,
      }),
      "Private",
    );
    assert.equal(
      scheduledVideoStatusLabel({
        scheduledPublishAt: null,
        uploadStatus: "processing",
        now,
      }),
      "Processing",
    );
  });

  it("I: Shorts classification uses existing classifier", () => {
    const format = classifyYouTubeVideoFormat({
      title: "Quick tip #shorts",
      durationSeconds: 45,
    });
    assert.equal(format, "SHORT");
    assert.equal(scheduleFormatLabel(format), "SHORT");
    assert.equal(scheduleFormatLabel("LONG"), "LONG-FORM");
  });

  it("studio URL is YouTube Studio edit link", () => {
    assert.equal(
      youtubeStudioVideoUrl("abc123XYZ01"),
      "https://studio.youtube.com/video/abc123XYZ01/edit",
    );
  });
});

describe("youtube schedule access and wiring", () => {
  it("A/B/C: Schedule reuses youtube area access; no new role", () => {
    assert.equal(canAccess("owner", "youtube"), true);
    assert.equal(canAccess("editor", "youtube"), true);
    assert.equal(canAccess("members", "youtube"), false);

    const access = read("lib/admin-access.ts");
    assert.doesNotMatch(access, /filmmaker|schedule role|scheduled-video/i);
    assert.doesNotMatch(access, /canManageScheduled|canAccessSchedule/);

    const page = read("app/admin/(app)/youtube/page.tsx");
    assert.match(page, /requireAccess\("youtube"\)/);
    assert.match(page, /view === "schedule"/);
    assert.match(page, />\s*Schedule\s*</);
    assert.match(page, /YoutubeSchedulePanel/);
    assert.match(page, /next !== "schedule" && filterQuery/);
    assert.match(page, /view === "schedule" && params\.filter/);
  });

  it("N: public catalogue still filters to public privacy only", () => {
    const eligibility = read("lib/public-videos/eligibility.ts");
    const catalogue = read("lib/public-videos/catalogue.ts");
    assert.match(eligibility, /isPublicPrivacyStatus/);
    assert.match(catalogue, /privacyStatus:\s*"public"/);
    assert.doesNotMatch(catalogue, /scheduledPublishAt/);
  });

  it("M/L: schedule panel distinguishes empty vs error and Refresh YouTube", () => {
    const panel = read("components/admin/YoutubeSchedulePanel.tsx");
    const dashboard = read("components/admin/YoutubeDashboard.tsx");
    assert.match(panel, /No upcoming videos are currently scheduled/);
    assert.match(panel, /We couldn&apos;t load the YouTube schedule/);
    assert.match(panel, /showHardError/);
    assert.match(panel, /[Cc]onnect YouTube Analytics/);
    assert.match(panel, /<ul className="list-none"/);
    assert.match(panel, /Next up/);
    assert.match(panel, /Upcoming/);
    assert.match(panel, /Times in GMT/);
    assert.match(panel, /Istanbul/);
    assert.match(panel, /Refresh YouTube/);
    assert.doesNotMatch(panel, /Refresh Public YouTube/);
    assert.match(dashboard, /Refresh YouTube/);
    assert.doesNotMatch(dashboard, /Refresh Public YouTube/);
    assert.match(panel, /showYoutubeTitle/);
  });

  it("sync stores publishAt via OAuth extension and clears stale schedules", () => {
    const sync = read("lib/youtube-data/sync.ts");
    const scheduled = read("lib/youtube-data/scheduled-sync.ts");
    const client = read("lib/youtube-data/client.ts");
    const load = read("lib/youtube-data/schedule-load.ts");
    const schema = readFileSync(path.join(srcRoot, "..", "prisma", "schema.prisma"), "utf8");

    assert.match(schema, /scheduledPublishAt/);
    assert.match(schema, /uploadStatus/);
    assert.match(client, /publishAt/);
    assert.match(sync, /syncYoutubeScheduledViaOAuth/);
    assert.match(sync, /coalesceScheduledPublishAt/);
    assert.match(scheduled, /getAnalyticsAccessToken/);
    assert.match(scheduled, /scheduledPublishAt/);
    assert.match(scheduled, /coalesceScheduledPublishAt/);
    assert.match(scheduled, /scheduledPublishAt: \{ lte: now \}/);
    assert.match(load, /resolveScheduledVideoTitles/);
    assert.match(load, /buildRecipeVideoIndex/);
  });
});
