import {
  DEFAULT_CADENCE,
  PLANNER_START_DATE,
  RELEASE_TIMEZONE,
  type ReleaseCadence,
  type ReleaseVideoType,
} from "@/lib/youtube-data/release-cadence";

export const RELEASE_ATTENTION_GRACE_MS = 2 * 60 * 60 * 1000;

export type ReleaseStatus = "BACKLOG" | "PLANNED" | "SCHEDULED" | "PUBLISHED" | "SKIPPED";

export type IstanbulParts = {
  weekdayShort: string;
  day: number;
  monthShort: string;
  year: number;
  time24: string;
  monthKey: string;
  dateKey: string;
  label: string;
  timeLabel: string;
};

export type ProjectedCadenceSlot = {
  slotKey: string;
  releaseAt: Date;
  weekdayShort: string;
  day: number;
  monthShort: string;
  year: number;
  time24: string;
  monthKey: string;
  dateKey: string;
  label: string;
  timeLabel: string;
};

export type MonthJumperMonth = {
  month: number;
  monthKey: string;
  label: string;
  isCurrent: boolean;
};

export type MonthJumperYear = {
  year: number;
  months: MonthJumperMonth[];
};

export type AttentionKind = "none" | "overdue";

export type AttentionResult = {
  kind: AttentionKind;
  needsAttention: boolean;
};

/** UI-ready stream kinds consumed by YoutubeSchedulePanel. */
export type PlannerRowSource = "open" | "local" | "youtube";

export type PlannerStreamRow = {
  id: string;
  source: PlannerRowSource;
  status: ReleaseStatus | "OPEN";
  workingTitle: string;
  videoType: ReleaseVideoType | "UNKNOWN";
  releaseAt: Date | null;
  slotKey: string;
  dateKey: string;
  monthKey: string;
  label: string;
  timeLabel: string;
  skipReason: string;
  notes: string;
  youtubeVideoId: string | null;
  youtubeTitle: string | null;
  thumbnailUrl: string | null;
  needsAttention: boolean;
};

export type PlannerMonthGroup = {
  monthKey: string;
  year: number;
  month: number;
  label: string;
  rows: PlannerStreamRow[];
};

/** Client-safe planner dashboard shape (Dates serialize to strings over RSC). */
export type YoutubeReleasePlannerDashboard = {
  status: "ok" | "error" | "needs_oauth";
  errorMessage: string;
  lastSyncedAt: Date | null;
  lastSyncedLabel: string;
  analyticsConnected: boolean;
  cadence: ReleaseCadence;
  monthJumper: MonthJumperYear[];
  upNext: PlannerStreamRow | null;
  attention: PlannerStreamRow[];
  backlog: PlannerStreamRow[];
  months: PlannerMonthGroup[];
  stream: PlannerStreamRow[];
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function parseIsoDateParts(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Read calendar + clock parts for a UTC instant in Europe/Istanbul. */
export function formatIstanbulParts(date: Date | string): IstanbulParts {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) {
    return {
      weekdayShort: "—",
      day: 0,
      monthShort: "—",
      year: 0,
      time24: "—",
      monthKey: "",
      dateKey: "",
      label: "—",
      timeLabel: "—",
    };
  }

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: RELEASE_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const bag: Record<string, string> = {};
  for (const part of dtf.formatToParts(value)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }

  const year = Number(bag.year);
  const day = Number(bag.day);
  const monthShort = bag.month || "—";
  const weekdayShort = bag.weekday || "—";
  // hourCycle h23 can still yield "24" for midnight in some engines — normalize.
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const minute = Number(bag.minute);
  const time24 = `${pad2(hour)}:${pad2(minute)}`;

  const monthIndex = MONTH_SHORT.findIndex((m) => m === monthShort);
  const monthNum = monthIndex >= 0 ? monthIndex + 1 : 0;
  const monthKey = monthNum ? `${year}-${pad2(monthNum)}` : "";
  const dateKey = monthNum ? `${year}-${pad2(monthNum)}-${pad2(day)}` : "";

  return {
    weekdayShort,
    day,
    monthShort,
    year,
    time24,
    monthKey,
    dateKey,
    label: `${weekdayShort} ${day} · ${monthShort}`,
    timeLabel: time24,
  };
}

/**
 * Convert a wall-clock local datetime in `timeZone` to a UTC Date.
 * Works for Europe/Istanbul (UTC+3, no DST) and other fixed/variable zones via Intl.
 */
export function zonedLocalToUtc(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone?: string;
}): Date {
  const timeZone = input.timeZone || RELEASE_TIMEZONE;
  const utcGuess = new Date(
    Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0),
  );

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const read = (date: Date) => {
    const bag: Record<string, string> = {};
    for (const part of dtf.formatToParts(date)) {
      if (part.type !== "literal") bag[part.type] = part.value;
    }
    let hour = Number(bag.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(bag.year),
      month: Number(bag.month),
      day: Number(bag.day),
      hour,
      minute: Number(bag.minute),
      second: Number(bag.second),
    };
  };

  const asLocal = read(utcGuess);
  const asLocalMs = Date.UTC(
    asLocal.year,
    asLocal.month - 1,
    asLocal.day,
    asLocal.hour,
    asLocal.minute,
    asLocal.second,
  );
  const desiredMs = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
  );
  const corrected = new Date(utcGuess.getTime() + (desiredMs - asLocalMs));

  // One refinement pass for DST transition edges.
  const check = read(corrected);
  const checkMs = Date.UTC(
    check.year,
    check.month - 1,
    check.day,
    check.hour,
    check.minute,
    check.second,
  );
  if (checkMs !== desiredMs) {
    return new Date(corrected.getTime() + (desiredMs - checkMs));
  }
  return corrected;
}

/** Istanbul calendar date YYYY-MM-DD for an instant. */
export function istanbulDateKey(date: Date): string {
  return formatIstanbulParts(date).dateKey;
}

/** Start of the given Istanbul calendar day as UTC Date. */
export function istanbulStartOfDayUtc(dateKey: string): Date {
  const parts = parseIsoDateParts(dateKey);
  if (!parts) return new Date(NaN);
  return zonedLocalToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
  });
}

function istanbulWeekday(date: Date): number {
  // Map short weekday from formatParts via a dedicated formatter.
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: RELEASE_TIMEZONE,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? -1;
}

/** Monday 00:00 Istanbul containing `date` (Europe-style week). */
export function istanbulStartOfWeekUtc(date: Date): Date {
  const parts = formatIstanbulParts(date);
  const weekday = istanbulWeekday(date);
  // Convert Sun=0…Sat=6 into days since Monday.
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  const month = parts.monthKey ? Number(parts.monthKey.slice(5)) : 1;
  const probe = new Date(Date.UTC(parts.year, month - 1, parts.day - daysFromMonday));
  return zonedLocalToUtc({
    year: probe.getUTCFullYear(),
    month: probe.getUTCMonth() + 1,
    day: probe.getUTCDate(),
    hour: 0,
    minute: 0,
  });
}

export function isThisWeekIstanbul(date: Date | string, now = new Date()): boolean {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return false;
  const weekStart = istanbulStartOfWeekUtc(now).getTime();
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
  const t = value.getTime();
  return t >= weekStart && t < weekEnd;
}

/**
 * Project open cadence slots (~12 weeks). Open slots are NEVER persisted — callers merge in memory.
 * Only weekdays matching cadence on/after max(now start-of-day Istanbul, effectiveFrom, plannerStart).
 * Does not include Jan–Aug 2026.
 */
export function projectCadenceSlots(input: {
  cadence?: ReleaseCadence;
  from?: Date;
  weeksAhead?: number;
  now?: Date;
}): ProjectedCadenceSlot[] {
  const cadence = input.cadence ?? DEFAULT_CADENCE;
  const now = input.now ?? new Date();
  const weeksAhead = input.weeksAhead ?? 12;
  const from = input.from ?? now;

  const nowParts = formatIstanbulParts(from);
  const nowDateKey = nowParts.dateKey || istanbulDateKey(from);
  const floorKey = maxIsoDate(
    maxIsoDate(cadence.effectiveFrom, cadence.plannerStart),
    maxIsoDate(PLANNER_START_DATE, nowDateKey),
  );

  const [hh, mm] = cadence.timeLocal.split(":").map(Number);
  const floorParts = parseIsoDateParts(floorKey);
  if (!floorParts) return [];

  const horizonMs = weeksAhead * 7 * 24 * 60 * 60 * 1000;
  const horizonEnd = new Date(from.getTime() + horizonMs);

  const slots: ProjectedCadenceSlot[] = [];
  // Walk calendar days from floor through horizon in Istanbul.
  let cursor = zonedLocalToUtc({
    year: floorParts.year,
    month: floorParts.month,
    day: floorParts.day,
    hour: 12,
    minute: 0,
  });

  while (cursor.getTime() <= horizonEnd.getTime() + 24 * 60 * 60 * 1000) {
    const parts = formatIstanbulParts(cursor);
    if (!parts.dateKey) break;
    if (parts.dateKey < floorKey) {
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
      continue;
    }
    if (cursor.getTime() > horizonEnd.getTime() + 24 * 60 * 60 * 1000) break;

    // Stop once Istanbul date is past the horizon date.
    const horizonKey = formatIstanbulParts(horizonEnd).dateKey;
    if (horizonKey && parts.dateKey > horizonKey) break;

    if (istanbulWeekday(cursor) === cadence.weekday) {
      const releaseAt = zonedLocalToUtc({
        year: parts.year,
        month: Number(parts.monthKey.slice(5)),
        day: parts.day,
        hour: hh,
        minute: mm,
        timeZone: cadence.timezone || RELEASE_TIMEZONE,
      });

      // Only include slots whose release instant is within the weeksAhead window from `from`,
      // or whose Istanbul day is still on/before the horizon date and releaseAt >= start of floor day.
      if (releaseAt.getTime() >= istanbulStartOfDayUtc(floorKey).getTime() && releaseAt.getTime() <= horizonEnd.getTime()) {
        const labeled = formatIstanbulParts(releaseAt);
        slots.push({
          slotKey: labeled.dateKey,
          releaseAt,
          weekdayShort: labeled.weekdayShort,
          day: labeled.day,
          monthShort: labeled.monthShort,
          year: labeled.year,
          time24: labeled.time24,
          monthKey: labeled.monthKey,
          dateKey: labeled.dateKey,
          label: labeled.label,
          timeLabel: labeled.timeLabel,
        });
      }
    }

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return slots;
}

/**
 * Month jumper nav: 2026 only Sep–Dec; later years full Jan–Dec; mark current Istanbul month.
 * Range: planner start through December of (now year + 1).
 */
export function buildMonthJumper(now = new Date()): MonthJumperYear[] {
  const nowParts = formatIstanbulParts(now);
  const currentMonthKey = nowParts.monthKey;
  const endYear = Math.max(nowParts.year + 1, 2026);

  const years: MonthJumperYear[] = [];
  for (let year = 2026; year <= endYear; year += 1) {
    const startMonth = year === 2026 ? 9 : 1;
    const months: MonthJumperMonth[] = [];
    for (let month = startMonth; month <= 12; month += 1) {
      const monthKey = `${year}-${pad2(month)}`;
      months.push({
        month,
        monthKey,
        label: MONTH_SHORT[month - 1],
        isCurrent: monthKey === currentMonthKey,
      });
    }
    years.push({ year, months });
  }
  return years;
}

/**
 * Overdue attention after releaseAt + grace (default 2h).
 * PUBLISHED / SKIPPED / BACKLOG (no date) do not need slot attention.
 */
export function deriveAttention(input: {
  releaseAt: Date | string | null | undefined;
  status: ReleaseStatus | "OPEN" | string;
  now?: Date;
  graceMs?: number;
}): AttentionResult {
  const now = input.now ?? new Date();
  const graceMs = input.graceMs ?? RELEASE_ATTENTION_GRACE_MS;
  const status = String(input.status || "").toUpperCase();

  if (status === "PUBLISHED" || status === "SKIPPED" || status === "BACKLOG") {
    return { kind: "none", needsAttention: false };
  }

  if (!input.releaseAt) return { kind: "none", needsAttention: false };
  const releaseAt =
    input.releaseAt instanceof Date ? input.releaseAt : new Date(input.releaseAt);
  if (Number.isNaN(releaseAt.getTime())) return { kind: "none", needsAttention: false };

  // Empty cadence slots within 48 hours still need assignment.
  if (status === "OPEN") {
    const msUntil = releaseAt.getTime() - now.getTime();
    if (msUntil >= 0 && msUntil <= 48 * 60 * 60 * 1000) {
      return { kind: "overdue", needsAttention: true };
    }
  }

  if (now.getTime() > releaseAt.getTime() + graceMs) {
    return { kind: "overdue", needsAttention: true };
  }
  return { kind: "none", needsAttention: false };
}

export type MergePlannerInput = {
  now?: Date;
  openSlots: ProjectedCadenceSlot[];
  localReleases: Array<{
    id: string;
    status: string;
    workingTitle: string;
    videoType: string;
    releaseAt: Date | null;
    slotKey: string;
    notes: string;
    skipReason: string;
    youtubeVideoId: string | null;
  }>;
  youtubeVideos: Array<{
    videoId: string;
    title: string;
    thumbnailUrl: string;
    scheduledPublishAt: Date | null;
    publishedAt: Date | null;
  }>;
};

function asVideoType(value: string): ReleaseVideoType | "UNKNOWN" {
  const v = value.toUpperCase();
  if (v === "LONG" || v === "SHORT" || v === "SPECIAL") return v;
  return "UNKNOWN";
}

function asStatus(value: string): ReleaseStatus {
  const v = value.toUpperCase();
  if (
    v === "BACKLOG" ||
    v === "PLANNED" ||
    v === "SCHEDULED" ||
    v === "PUBLISHED" ||
    v === "SKIPPED"
  ) {
    return v;
  }
  return "PLANNED";
}

/**
 * Merge open slots, local releases, and YouTube videos into chronological stream rows.
 * A YouTube (or local non-backlog) row on an Istanbul dateKey fills that cadence slot —
 * open Friday projection is omitted for that day. Multiple same-day rows are allowed
 * (e.g. SHORT + LONG); only the first OPEN for a given slotKey is suppressed when filled.
 */
export function mergePlannerRows(input: MergePlannerInput): PlannerStreamRow[] {
  const now = input.now ?? new Date();
  const filledSlotKeys = new Set<string>();
  const rows: PlannerStreamRow[] = [];

  for (const local of input.localReleases) {
    const status = asStatus(local.status);
    if (status === "BACKLOG") continue;

    const releaseAt = local.releaseAt;
    const parts = releaseAt ? formatIstanbulParts(releaseAt) : null;
    const dateKey = local.slotKey || parts?.dateKey || "";
    const monthKey = parts?.monthKey || (dateKey ? dateKey.slice(0, 7) : "");
    if (dateKey && status !== "SKIPPED") filledSlotKeys.add(dateKey);
    if (local.slotKey) filledSlotKeys.add(local.slotKey);

    const attention = deriveAttention({ releaseAt, status, now });
    rows.push({
      id: `local:${local.id}`,
      source: "local",
      status,
      workingTitle: local.workingTitle || (status === "SKIPPED" ? "Skipped" : "Untitled"),
      videoType: asVideoType(local.videoType),
      releaseAt,
      slotKey: local.slotKey || dateKey,
      dateKey,
      monthKey,
      label: parts?.label || (dateKey || "—"),
      timeLabel: parts?.timeLabel || "",
      skipReason: local.skipReason || "",
      notes: local.notes || "",
      youtubeVideoId: local.youtubeVideoId,
      youtubeTitle: null,
      thumbnailUrl: null,
      needsAttention: attention.needsAttention,
    });
  }

  for (const video of input.youtubeVideos) {
    const when = video.scheduledPublishAt ?? video.publishedAt;
    if (!when) continue;
    const parts = formatIstanbulParts(when);
    const isFuture = video.scheduledPublishAt
      ? video.scheduledPublishAt.getTime() > now.getTime()
      : false;
    const status: ReleaseStatus = isFuture ? "SCHEDULED" : "PUBLISHED";
    if (parts.dateKey) filledSlotKeys.add(parts.dateKey);

    const attention = deriveAttention({ releaseAt: when, status, now });
    rows.push({
      id: `youtube:${video.videoId}`,
      source: "youtube",
      status,
      workingTitle: video.title || "Untitled video",
      videoType: "UNKNOWN",
      releaseAt: when,
      slotKey: parts.dateKey,
      dateKey: parts.dateKey,
      monthKey: parts.monthKey,
      label: parts.label,
      timeLabel: parts.timeLabel,
      skipReason: "",
      notes: "",
      youtubeVideoId: video.videoId,
      youtubeTitle: video.title,
      thumbnailUrl: video.thumbnailUrl || null,
      needsAttention: attention.needsAttention,
    });
  }

  for (const slot of input.openSlots) {
    if (filledSlotKeys.has(slot.slotKey) || filledSlotKeys.has(slot.dateKey)) continue;
    const attention = deriveAttention({ releaseAt: slot.releaseAt, status: "OPEN", now });
    rows.push({
      id: `open:${slot.slotKey}`,
      source: "open",
      status: "OPEN",
      workingTitle: "Open slot",
      videoType: "LONG",
      releaseAt: slot.releaseAt,
      slotKey: slot.slotKey,
      dateKey: slot.dateKey,
      monthKey: slot.monthKey,
      label: slot.label,
      timeLabel: slot.timeLabel,
      skipReason: "",
      notes: "",
      youtubeVideoId: null,
      youtubeTitle: null,
      thumbnailUrl: null,
      needsAttention: attention.needsAttention,
    });
  }

  rows.sort((a, b) => {
    const at = a.releaseAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bt = b.releaseAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });

  return rows;
}

export function groupPlannerRowsByMonth(rows: PlannerStreamRow[]): PlannerMonthGroup[] {
  const map = new Map<string, PlannerMonthGroup>();
  for (const row of rows) {
    const monthKey = row.monthKey || (row.dateKey ? row.dateKey.slice(0, 7) : "unknown");
    let group = map.get(monthKey);
    if (!group) {
      const [yRaw, mRaw] = monthKey.split("-");
      const year = Number(yRaw) || 0;
      const month = Number(mRaw) || 0;
      group = {
        monthKey,
        year,
        month,
        label: month ? `${MONTH_SHORT[month - 1]} ${year}` : monthKey,
        rows: [],
      };
      map.set(monthKey, group);
    }
    group.rows.push(row);
  }
  return [...map.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

/**
 * Soonest future non-skipped row. Prefer scheduled/planned/youtube over open slots
 * when any concrete item exists in the future window.
 */
export function selectPlannerUpNext(rows: PlannerStreamRow[], now = new Date()): PlannerStreamRow | null {
  const future = rows.filter((row) => {
    if (row.status === "SKIPPED" || row.status === "PUBLISHED" || row.status === "BACKLOG") {
      return false;
    }
    if (!row.releaseAt) return false;
    return row.releaseAt.getTime() > now.getTime();
  });

  const concrete = future.filter((row) => row.source !== "open");
  const pool = concrete.length > 0 ? concrete : future.filter((row) => row.source === "open");
  return pool[0] ?? null;
}

export function selectPlannerAttention(rows: PlannerStreamRow[]): PlannerStreamRow[] {
  return rows.filter((row) => row.needsAttention);
}
