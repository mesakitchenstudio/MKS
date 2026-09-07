import "server-only";
import { getDb } from "@/lib/db";
import { canAccess, type AccessLevel } from "@/lib/admin-access";
import {
  countBySource,
  filterCalendarEntries,
  sortCalendarEntries,
  youtubeStatusLabel,
  youtubeVideoTypeLabel,
} from "@/lib/content-calendar/entries";
import {
  contentCalendarMonthWindow,
  istanbulDateKeyFromUtc,
  istanbulTimeFromUtc,
  istanbulTodayDateKey,
  monthLabel,
  parseCalendarYearMonth,
  shiftCalendarMonth,
  weekdayLabel,
  type CalendarMonthRef,
} from "@/lib/content-calendar/ranges";
import type {
  ContentCalendarChannelFilter,
  ContentCalendarDay,
  ContentCalendarEntry,
  ContentCalendarLinkFilter,
  ContentCalendarMonthSummary,
  ContentCalendarTimingFilter,
  RecipeCalendarEntry,
  YoutubeCalendarEntry,
} from "@/lib/content-calendar/types";
import { parseValues } from "@/lib/recipe-map";
import { buildRecipeVideoIndex } from "@/lib/youtube-data/matching";
import {
  buildCalendarReadinessInput,
  calendarScheduledReadinessFromCanonical,
  type CalendarTypeFieldRow,
} from "@/lib/content-calendar/readiness";

export type ContentCalendarAccess = {
  role: AccessLevel;
  canViewRecipes: boolean;
  canViewYoutube: boolean;
  canViewPerformance: boolean;
};

export function contentCalendarAccessForRole(role: AccessLevel): ContentCalendarAccess {
  return {
    role,
    canViewRecipes: canAccess(role, "content"),
    canViewYoutube: canAccess(role, "youtube"),
    canViewPerformance: canAccess(role, "content"),
  };
}

export type LoadContentCalendarInput = {
  year?: unknown;
  month?: unknown;
  channel?: ContentCalendarChannelFilter;
  timing?: ContentCalendarTimingFilter;
  linked?: ContentCalendarLinkFilter;
  q?: string;
  access: ContentCalendarAccess;
  now?: Date;
};

export type ContentCalendarDashboard = {
  month: CalendarMonthRef;
  monthLabel: string;
  todayDateKey: string;
  prev: CalendarMonthRef;
  next: CalendarMonthRef;
  days: ContentCalendarDay[];
  websiteCount: number;
  youtubeCount: number;
  unscheduledDraftCount: number;
  unscheduledYoutubeCount: number;
  yearOverview: ContentCalendarMonthSummary[];
  filters: {
    channel: ContentCalendarChannelFilter;
    timing: ContentCalendarTimingFilter;
    linked: ContentCalendarLinkFilter;
    q: string;
  };
  access: ContentCalendarAccess;
};

function parseChannel(raw: unknown): ContentCalendarChannelFilter {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "website" || v === "youtube" || v === "all") return v;
  return "all";
}

function parseTiming(raw: unknown): ContentCalendarTimingFilter {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "upcoming" || v === "published" || v === "all") return v;
  return "all";
}

function parseLinked(raw: unknown): ContentCalendarLinkFilter {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "linked" || v === "unlinked" || v === "all") return v;
  return "all";
}

async function loadTypeFieldsByTypeId(
  typeIds: string[],
): Promise<Map<string, CalendarTypeFieldRow[]>> {
  const map = new Map<string, CalendarTypeFieldRow[]>();
  if (typeIds.length === 0) return map;
  const db = getDb();
  const rows = await db.recipeTypeField.findMany({
    where: { typeId: { in: typeIds } },
    orderBy: { sortOrder: "asc" },
    select: {
      typeId: true,
      key: true,
      label: true,
      kind: true,
      required: true,
      helpText: true,
      options: true,
    },
  });
  for (const row of rows) {
    const list = map.get(row.typeId) ?? [];
    list.push({
      key: row.key,
      label: row.label,
      kind: row.kind,
      required: row.required,
      helpText: row.helpText,
      options: row.options,
    });
    map.set(row.typeId, list);
  }
  return map;
}

export async function loadContentCalendar(
  input: LoadContentCalendarInput,
): Promise<ContentCalendarDashboard> {
  const now = input.now ?? new Date();
  const month = parseCalendarYearMonth({ year: input.year, month: input.month, now });
  const window = contentCalendarMonthWindow(month);
  const todayDateKey = istanbulTodayDateKey(now);
  const channel = parseChannel(input.channel);
  const timing = parseTiming(input.timing);
  const linked = parseLinked(input.linked);
  const q = String(input.q || "").trim();
  const access = input.access;

  const db = getDb();
  const entries: ContentCalendarEntry[] = [];

  let unscheduledDraftCount = 0;
  let unscheduledYoutubeCount = 0;

  const [recipeVideoIndex, recipesScheduled, recipesPublished, youtubeReleases, draftCount, backlogCount] =
    await Promise.all([
      access.canViewYoutube || access.canViewRecipes
        ? buildRecipeVideoIndex({ includeDrafts: true })
        : Promise.resolve({ byVideoId: new Map(), recipesWithVideo: [], recipesWithoutVideo: [], recipes: [] }),
      access.canViewRecipes
        ? db.recipe.findMany({
            where: {
              status: "draft",
              scheduledPublishAt: {
                gte: window.rangeStartUtc,
                lt: window.rangeEndExclusiveUtc,
              },
            },
            select: {
              id: true,
              title: true,
              slug: true,
              status: true,
              scheduledPublishAt: true,
              values: true,
              typeId: true,
              excerpt: true,
              categories: { select: { categoryId: true } },
            },
          })
        : Promise.resolve([]),
      access.canViewRecipes
        ? db.recipe.findMany({
            where: {
              status: "published",
              publishedAt: {
                gte: window.rangeStartUtc,
                lt: window.rangeEndExclusiveUtc,
              },
            },
            select: {
              id: true,
              title: true,
              status: true,
              publishedAt: true,
            },
          })
        : Promise.resolve([]),
      access.canViewYoutube
        ? db.youTubeRelease.findMany({
            where: {
              releaseAt: {
                gte: window.rangeStartUtc,
                lt: window.rangeEndExclusiveUtc,
              },
              status: { not: "SKIPPED" },
            },
            select: {
              id: true,
              status: true,
              workingTitle: true,
              videoType: true,
              releaseAt: true,
              youtubeVideoId: true,
              recipeId: true,
              recipe: { select: { id: true, title: true } },
            },
          })
        : Promise.resolve([]),
      access.canViewRecipes
        ? db.recipe.count({
            where: { status: "draft", scheduledPublishAt: null },
          })
        : Promise.resolve(0),
      access.canViewYoutube
        ? db.youTubeRelease.count({
            where: {
              OR: [{ releaseAt: null }, { status: "BACKLOG" }],
            },
          })
        : Promise.resolve(0),
    ]);

  unscheduledDraftCount = draftCount;
  unscheduledYoutubeCount = backlogCount;

  const typeIds = [...new Set(recipesScheduled.map((recipe) => recipe.typeId))];
  const fieldsByType = access.canViewRecipes
    ? await loadTypeFieldsByTypeId(typeIds)
    : new Map<string, CalendarTypeFieldRow[]>();

  const recipeTitleById = new Map<string, string>();
  for (const recipe of recipeVideoIndex.recipes) {
    recipeTitleById.set(recipe.id, recipe.displayTitle || recipe.title);
  }

  for (const recipe of recipesScheduled) {
    if (!recipe.scheduledPublishAt) continue;
    const at = recipe.scheduledPublishAt;
    const typeFields = fieldsByType.get(recipe.typeId) ?? [];
    const calendarReadiness = calendarScheduledReadinessFromCanonical(
      buildCalendarReadinessInput({
        title: recipe.title,
        slug: recipe.slug,
        excerpt: recipe.excerpt,
        typeId: recipe.typeId,
        values: parseValues(recipe.values),
        categoryIds: recipe.categories.map((row) => row.categoryId),
        typeFields,
      }),
    );
    const needsAttention = calendarReadiness.needsAttention;
    // Find linked YouTube releases in this month for relationship label.
    const linkedRelease = youtubeReleases.find(
      (rel) =>
        rel.recipeId === recipe.id ||
        (rel.youtubeVideoId &&
          recipeVideoIndex.byVideoId.get(rel.youtubeVideoId)?.recipeId === recipe.id),
    );
    const entry: RecipeCalendarEntry = {
      source: "recipe",
      sourceId: recipe.id,
      title: recipe.title,
      at,
      localDateKey: istanbulDateKeyFromUtc(at),
      localTime: istanbulTimeFromUtc(at),
      statusLabel: "Scheduled",
      needsAttention,
      href: `/admin/recipes/${recipe.id}`,
      performanceHref: `/admin/content-performance/recipes/${recipe.id}`,
      linkedRecipeId: recipe.id,
      linkedTitle: linkedRelease
        ? linkedRelease.workingTitle || youtubeVideoTypeLabel(linkedRelease.videoType)
        : null,
    };
    // Prefer showing linked YouTube title when present.
    if (linkedRelease) {
      entry.linkedTitle = linkedRelease.workingTitle || "YouTube release";
    }
    entries.push(entry);
  }

  for (const recipe of recipesPublished) {
    if (!recipe.publishedAt) continue;
    const at = recipe.publishedAt;
    const linkedRelease = youtubeReleases.find(
      (rel) =>
        rel.recipeId === recipe.id ||
        (rel.youtubeVideoId &&
          recipeVideoIndex.byVideoId.get(rel.youtubeVideoId)?.recipeId === recipe.id),
    );
    entries.push({
      source: "recipe",
      sourceId: recipe.id,
      title: recipe.title,
      at,
      localDateKey: istanbulDateKeyFromUtc(at),
      localTime: istanbulTimeFromUtc(at),
      statusLabel: "Published",
      needsAttention: false,
      href: `/admin/recipes/${recipe.id}`,
      performanceHref: `/admin/content-performance/recipes/${recipe.id}`,
      linkedRecipeId: recipe.id,
      linkedTitle: linkedRelease ? linkedRelease.workingTitle || "YouTube release" : null,
    });
  }

  for (const release of youtubeReleases) {
    if (!release.releaseAt) continue;
    const at = release.releaseAt;
    let linkedRecipeId = release.recipeId || null;
    let linkedTitle = release.recipe?.title || null;
    if (!linkedRecipeId && release.youtubeVideoId) {
      const viaVideo = recipeVideoIndex.byVideoId.get(release.youtubeVideoId);
      if (viaVideo) {
        linkedRecipeId = viaVideo.recipeId;
        linkedTitle = viaVideo.recipeTitle;
      }
    }
    if (linkedRecipeId && !linkedTitle) {
      linkedTitle = recipeTitleById.get(linkedRecipeId) || null;
    }
    const entry: YoutubeCalendarEntry = {
      source: "youtube",
      sourceId: release.id,
      title: release.workingTitle || "Untitled release",
      at,
      localDateKey: istanbulDateKeyFromUtc(at),
      localTime: istanbulTimeFromUtc(at),
      statusLabel: youtubeStatusLabel(release.status),
      videoType: youtubeVideoTypeLabel(release.videoType),
      href: `/admin/youtube?view=schedule&release=${release.id}`,
      linkedRecipeId,
      linkedTitle,
      youtubeVideoId: release.youtubeVideoId,
    };
    entries.push(entry);
  }

  const filtered = sortCalendarEntries(
    filterCalendarEntries(entries, { channel, timing, linked, query: q, now }),
  );

  const byDate = new Map<string, ContentCalendarEntry[]>();
  for (const entry of filtered) {
    if (entry.localDateKey < window.startDateKey || entry.localDateKey > window.endDateKey) {
      continue;
    }
    const list = byDate.get(entry.localDateKey) || [];
    list.push(entry);
    byDate.set(entry.localDateKey, list);
  }

  const days: ContentCalendarDay[] = [];
  // Iterate each Istanbul day in month.
  let cursor = new Date(window.rangeStartUtc);
  while (cursor.getTime() < window.rangeEndExclusiveUtc.getTime()) {
    const dateKey = istanbulDateKeyFromUtc(cursor);
    if (dateKey >= window.startDateKey && dateKey <= window.endDateKey) {
      days.push({
        dateKey,
        weekdayLabel: weekdayLabel(dateKey),
        isToday: dateKey === todayDateKey,
        entries: byDate.get(dateKey) || [],
      });
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  // Year overview: bounded counts per month (no event payloads).
  const yearOverview = await loadYearOverview({
    year: month.year,
    access,
    now,
  });

  const counts = countBySource(filtered);

  return {
    month,
    monthLabel: monthLabel(month.year, month.month),
    todayDateKey,
    prev: shiftCalendarMonth(month, -1),
    next: shiftCalendarMonth(month, 1),
    days,
    websiteCount: counts.websiteCount,
    youtubeCount: counts.youtubeCount,
    unscheduledDraftCount,
    unscheduledYoutubeCount,
    yearOverview,
    filters: { channel, timing, linked, q },
    access,
  };
}

async function loadYearOverview(input: {
  year: number;
  access: ContentCalendarAccess;
  now: Date;
}): Promise<ContentCalendarMonthSummary[]> {
  const db = getDb();
  const yearStart = contentCalendarMonthWindow({
    year: input.year,
    month: 1,
    monthKey: `${input.year}-01`,
  }).rangeStartUtc;
  const yearEnd = contentCalendarMonthWindow({
    year: input.year,
    month: 12,
    monthKey: `${input.year}-12`,
  }).rangeEndExclusiveUtc;

  const [scheduled, published, releases] = await Promise.all([
    input.access.canViewRecipes
      ? db.recipe.findMany({
          where: {
            status: "draft",
            scheduledPublishAt: { gte: yearStart, lt: yearEnd },
          },
          select: { scheduledPublishAt: true },
        })
      : Promise.resolve([]),
    input.access.canViewRecipes
      ? db.recipe.findMany({
          where: {
            status: "published",
            publishedAt: { gte: yearStart, lt: yearEnd },
          },
          select: { publishedAt: true },
        })
      : Promise.resolve([]),
    input.access.canViewYoutube
      ? db.youTubeRelease.findMany({
          where: {
            releaseAt: { gte: yearStart, lt: yearEnd },
            status: { not: "SKIPPED" },
          },
          select: { releaseAt: true },
        })
      : Promise.resolve([]),
  ]);

  const websiteByMonth = new Map<string, number>();
  const youtubeByMonth = new Map<string, number>();

  for (const row of scheduled) {
    if (!row.scheduledPublishAt) continue;
    const key = istanbulDateKeyFromUtc(row.scheduledPublishAt).slice(0, 7);
    websiteByMonth.set(key, (websiteByMonth.get(key) || 0) + 1);
  }
  for (const row of published) {
    if (!row.publishedAt) continue;
    const key = istanbulDateKeyFromUtc(row.publishedAt).slice(0, 7);
    websiteByMonth.set(key, (websiteByMonth.get(key) || 0) + 1);
  }
  for (const row of releases) {
    if (!row.releaseAt) continue;
    const key = istanbulDateKeyFromUtc(row.releaseAt).slice(0, 7);
    youtubeByMonth.set(key, (youtubeByMonth.get(key) || 0) + 1);
  }

  const out: ContentCalendarMonthSummary[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const monthKey = `${input.year}-${String(m).padStart(2, "0")}`;
    out.push({
      year: input.year,
      month: m,
      monthKey,
      monthLabel: monthLabel(input.year, m),
      websiteCount: websiteByMonth.get(monthKey) || 0,
      youtubeCount: youtubeByMonth.get(monthKey) || 0,
    });
  }
  return out;
}
