/** Canonical Mesa Admin display timezone (Türkiye Time, UTC+3, no DST). */
export const MESA_ADMIN_TIME_ZONE = "Europe/Istanbul";

/** Short user-facing timezone label for absolute Admin timestamps. */
export const MESA_ADMIN_TIME_ZONE_LABEL = "TRT";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type AdminZonedParts = {
  year: number;
  month: number;
  day: number;
  hour24: number;
  minute: number;
  monthShort: string;
  monthLong: string;
  hour12Label: string;
};

function adminZonedParts(date: Date): AdminZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MESA_ADMIN_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";

  const year = Number(read("year"));
  const month = Number(read("month"));
  const day = Number(read("day"));
  const hour24 = Number(read("hour"));
  const minute = Number(read("minute"));

  const monthShort = new Intl.DateTimeFormat("en-US", {
    timeZone: MESA_ADMIN_TIME_ZONE,
    month: "short",
  }).format(date);
  const monthLong = new Intl.DateTimeFormat("en-US", {
    timeZone: MESA_ADMIN_TIME_ZONE,
    month: "long",
  }).format(date);
  const hour12Label = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MESA_ADMIN_TIME_ZONE,
  });

  return {
    year,
    month,
    day,
    hour24,
    minute,
    monthShort,
    monthLong,
    hour12Label,
  };
}

function adminCalendarDayKey(date: Date) {
  const parts = adminZonedParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Compact admin timestamps: 13092026 12:27 TRT */
export function formatGmtDateTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";
  const parts = adminZonedParts(date);
  return `${pad(parts.day)}${pad(parts.month)}${parts.year} ${pad(parts.hour24)}:${pad(parts.minute)} ${MESA_ADMIN_TIME_ZONE_LABEL}`;
}

/** Admin list timestamps: Aug 24, 2026 · 10:09 PM TRT */
export function formatAdminDateTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";
  const parts = adminZonedParts(date);
  return `${parts.monthShort} ${parts.day}, ${parts.year} · ${parts.hour12Label} ${MESA_ADMIN_TIME_ZONE_LABEL}`;
}

/**
 * Admin list timestamps without a per-row TRT suffix (still Europe/Istanbul).
 * Pair with a page-level “Times in TRT” note.
 * Example: Aug 24, 2026 · 10:09 PM
 */
export function formatAdminDateTimeUtc(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";
  const parts = adminZonedParts(date);
  return `${parts.monthShort} ${parts.day}, ${parts.year} · ${parts.hour12Label}`;
}

/** Compact visitors timestamps: Aug 25 · 11:47 AM TRT (year when useful or requested). */
export function formatAdminShortDateTime(
  value: Date | string | null | undefined,
  now = new Date(),
  options?: { includeYear?: boolean },
) {
  const date = asDate(value);
  if (!date) return "—";

  const parts = adminZonedParts(date);
  const nowParts = adminZonedParts(now);
  const showYear = options?.includeYear || parts.year !== nowParts.year;
  if (showYear) {
    return `${parts.monthShort} ${parts.day}, ${parts.year} · ${parts.hour12Label} ${MESA_ADMIN_TIME_ZONE_LABEL}`;
  }
  return `${parts.monthShort} ${parts.day} · ${parts.hour12Label} ${MESA_ADMIN_TIME_ZONE_LABEL}`;
}

/** Date only for admin lists: Aug 24, 2026 (Istanbul calendar day). */
export function formatAdminDate(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";
  const parts = adminZonedParts(date);
  return `${parts.monthShort} ${parts.day}, ${parts.year}`;
}

/** Public member-facing date: August 24, 2026 (UTC calendar — public surface, not Admin TRT). */
export function formatLongDate(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";

  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function formatAdminClock(date: Date) {
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MESA_ADMIN_TIME_ZONE,
  });
}

/**
 * Friendly last-seen labels in TRT (Europe/Istanbul):
 * Today, 7:58 AM · Yesterday, 4:12 PM · Aug 24, 9:30 PM
 */
export function formatAdminRelativeDateTime(value: Date | string | null | undefined, now = new Date()) {
  const date = asDate(value);
  if (!date) return "—";

  const time = formatAdminClock(date);
  const nowKey = adminCalendarDayKey(now);
  const dateKey = adminCalendarDayKey(date);
  const nowParts = adminZonedParts(now);
  const dateParts = adminZonedParts(date);

  if (dateKey === nowKey) return `Today, ${time}`;

  const yesterday = new Date(now.getTime() - 86_400_000);
  if (adminCalendarDayKey(yesterday) === dateKey) return `Yesterday, ${time}`;

  if (dateParts.year === nowParts.year) {
    return `${dateParts.monthShort} ${dateParts.day}, ${time}`;
  }
  return `${dateParts.monthShort} ${dateParts.day}, ${dateParts.year}, ${time}`;
}

/** Admin snapshot timestamps: date on first line, time on second (TRT). */
export function formatYoutubeSnapshotDateTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return { date: "—", time: "" };

  const parts = adminZonedParts(date);
  return {
    date: `${parts.monthShort} ${parts.day}, ${parts.year}`,
    time: `${parts.hour12Label} ${MESA_ADMIN_TIME_ZONE_LABEL}`,
  };
}

/** Short public snapshot delta label, e.g. "+10 since Aug 30". */
export function formatChannelSnapshotTrendShort(input: {
  delta: string | null | undefined;
  fromRecordedAt: Date | string | null | undefined;
  toRecordedAt?: Date | string | null | undefined;
}): { short: string | null; title: string | null } {
  const delta = String(input.delta ?? "").trim();
  if (!delta) return { short: null, title: null };

  const from = asDate(input.fromRecordedAt);
  const to = asDate(input.toRecordedAt);
  const fromLabel = from
    ? from.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: MESA_ADMIN_TIME_ZONE,
      })
    : null;

  const short = fromLabel ? `${delta} since ${fromLabel}` : `${delta} · 7-day snapshot delta`;
  const title =
    from && to
      ? `${delta} since ${formatYoutubeSnapshotDateTime(from).date} ${formatYoutubeSnapshotDateTime(from).time} → ${formatYoutubeSnapshotDateTime(to).date} ${formatYoutubeSnapshotDateTime(to).time}`.trim()
      : short;

  return { short, title };
}

/**
 * Readable Admin dates with optional time in TRT.
 * Date-only: Aug 24, 2026
 * With time: Aug 24, 2026, 12:27 TRT
 */
export function formatGmtDisplay(
  value: Date | string | null | undefined,
  options?: { includeTime?: boolean },
) {
  const date = asDate(value);
  if (!date) return "—";

  const parts = adminZonedParts(date);
  if (!options?.includeTime) {
    return `${parts.monthShort} ${parts.day}, ${parts.year}`;
  }
  return `${parts.monthShort} ${parts.day}, ${parts.year}, ${pad(parts.hour24)}:${pad(parts.minute)} ${MESA_ADMIN_TIME_ZONE_LABEL}`;
}

/** Shared day heading for Admin activity-style lists (Today / Yesterday / Mon, Sep 13). */
export function formatAdminDayHeading(value: Date | string | null | undefined, now = new Date()) {
  const date = asDate(value);
  if (!date) return "—";

  const dateKey = adminCalendarDayKey(date);
  if (dateKey === adminCalendarDayKey(now)) return "Today";
  if (dateKey === adminCalendarDayKey(new Date(now.getTime() - 86_400_000))) return "Yesterday";

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: MESA_ADMIN_TIME_ZONE,
  });
}

/** Shared time-only label for Admin activity-style lists (12:27 PM). */
export function formatAdminTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";
  return formatAdminClock(date);
}
