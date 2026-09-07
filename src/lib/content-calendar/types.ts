/**
 * Derived Content Calendar entry types — no persisted CalendarEvent table.
 */

export type ContentCalendarSource = "recipe" | "youtube";

export type ContentCalendarChannelFilter = "all" | "website" | "youtube";
export type ContentCalendarTimingFilter = "all" | "upcoming" | "published";
export type ContentCalendarLinkFilter = "all" | "linked" | "unlinked";

export type RecipeCalendarEntry = {
  source: "recipe";
  sourceId: string;
  title: string;
  /** UTC instant from scheduledPublishAt or publishedAt. */
  at: Date;
  /** Europe/Istanbul YYYY-MM-DD */
  localDateKey: string;
  /** Europe/Istanbul HH:mm */
  localTime: string;
  statusLabel: "Scheduled" | "Published";
  needsAttention: boolean;
  href: string;
  performanceHref: string;
  linkedRecipeId: string;
  linkedTitle: string | null;
};

export type YoutubeCalendarEntry = {
  source: "youtube";
  sourceId: string;
  title: string;
  at: Date;
  localDateKey: string;
  localTime: string;
  statusLabel: string;
  videoType: string;
  href: string;
  linkedRecipeId: string | null;
  linkedTitle: string | null;
  youtubeVideoId: string | null;
};

export type ContentCalendarEntry = RecipeCalendarEntry | YoutubeCalendarEntry;

export type ContentCalendarDay = {
  dateKey: string;
  weekdayLabel: string;
  isToday: boolean;
  entries: ContentCalendarEntry[];
};

export type ContentCalendarMonthSummary = {
  year: number;
  month: number;
  monthKey: string;
  monthLabel: string;
  websiteCount: number;
  youtubeCount: number;
};
