import type {
  ContentCalendarEntry,
  ContentCalendarLinkFilter,
  ContentCalendarTimingFilter,
  RecipeCalendarEntry,
  YoutubeCalendarEntry,
} from "@/lib/content-calendar/types";

export function isUpcomingCalendarEntry(entry: ContentCalendarEntry, now: Date = new Date()): boolean {
  return entry.at.getTime() >= now.getTime();
}

export function filterCalendarEntries(
  entries: ContentCalendarEntry[],
  input: {
    channel?: "all" | "website" | "youtube";
    timing?: ContentCalendarTimingFilter;
    linked?: ContentCalendarLinkFilter;
    query?: string;
    now?: Date;
  },
): ContentCalendarEntry[] {
  const now = input.now ?? new Date();
  const channel = input.channel ?? "all";
  const timing = input.timing ?? "all";
  const linked = input.linked ?? "all";
  const q = String(input.query || "")
    .trim()
    .toLowerCase();

  return entries.filter((entry) => {
    if (channel === "website" && entry.source !== "recipe") return false;
    if (channel === "youtube" && entry.source !== "youtube") return false;

    if (timing === "upcoming" && !isUpcomingCalendarEntry(entry, now)) return false;
    if (timing === "published") {
      if (entry.source === "recipe" && entry.statusLabel !== "Published") return false;
      if (entry.source === "youtube" && entry.statusLabel !== "Published") return false;
    }

    const hasLink =
      entry.source === "recipe"
        ? Boolean(entry.linkedTitle)
        : Boolean(entry.linkedRecipeId);

    if (linked === "linked" && !hasLink) return false;
    if (linked === "unlinked" && hasLink) return false;

    if (q) {
      const hay = `${entry.title} ${entry.linkedTitle || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortCalendarEntries(entries: ContentCalendarEntry[]): ContentCalendarEntry[] {
  return [...entries].sort((a, b) => {
    const t = a.at.getTime() - b.at.getTime();
    if (t !== 0) return t;
    if (a.source !== b.source) return a.source === "recipe" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export function youtubeStatusLabel(status: string): string {
  const raw = String(status || "").trim().toUpperCase();
  switch (raw) {
    case "BACKLOG":
      return "Backlog";
    case "PLANNED":
      return "Planned";
    case "SCHEDULED":
      return "Scheduled";
    case "PUBLISHED":
      return "Published";
    case "SKIPPED":
      return "Skipped";
    default:
      return raw || "Unknown";
  }
}

export function youtubeVideoTypeLabel(videoType: string): string {
  const raw = String(videoType || "").trim().toUpperCase();
  if (raw === "LONG") return "Long-form";
  if (raw === "SHORT") return "Short";
  if (raw === "SPECIAL") return "Special";
  return raw || "Long-form";
}

export function countBySource(entries: ContentCalendarEntry[]): {
  websiteCount: number;
  youtubeCount: number;
} {
  let websiteCount = 0;
  let youtubeCount = 0;
  for (const entry of entries) {
    if (entry.source === "recipe") websiteCount += 1;
    else youtubeCount += 1;
  }
  return { websiteCount, youtubeCount };
}

export type { RecipeCalendarEntry, YoutubeCalendarEntry };
