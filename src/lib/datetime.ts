function pad(value: number) {
  return String(value).padStart(2, "0");
}

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Compact admin timestamps: 24082026 19:35 GMT */
export function formatGmtDateTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";
  return `${pad(date.getUTCDate())}${pad(date.getUTCMonth() + 1)}${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} GMT`;
}

/** Admin list timestamps: Aug 24, 2026 · 10:09 PM GMT */
export function formatAdminDateTime(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });

  return `${month} ${day}, ${year} · ${time} GMT`;
}

/** Compact visitors table timestamps: Aug 25 · 11:47 AM (year if not current UTC year). */
export function formatAdminShortDateTime(value: Date | string | null | undefined, now = new Date()) {
  const date = asDate(value);
  if (!date) return "—";

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });

  if (date.getUTCFullYear() === now.getUTCFullYear()) {
    return `${month} ${day} · ${time}`;
  }
  return `${month} ${day}, ${date.getUTCFullYear()} · ${time}`;
}

/** Date only for admin lists: Aug 24, 2026 */
export function formatAdminDate(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Public member-facing date: August 24, 2026 (no GMT suffix) */
export function formatLongDate(value: Date | string | null | undefined) {
  const date = asDate(value);
  if (!date) return "—";

  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

function utcCalendarDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatUtcClock(date: Date) {
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  });
}

/**
 * Friendly last-seen labels in UTC (site timestamps are GMT):
 * Today, 7:58 AM · Yesterday, 4:12 PM · Aug 24, 9:30 PM
 */
export function formatAdminRelativeDateTime(value: Date | string | null | undefined, now = new Date()) {
  const date = asDate(value);
  if (!date) return "—";

  const time = formatUtcClock(date);
  const dayDiff = Math.round((utcCalendarDay(now) - utcCalendarDay(date)) / 86_400_000);

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  if (date.getUTCFullYear() === now.getUTCFullYear()) {
    return `${month} ${day}, ${time}`;
  }
  return `${month} ${day}, ${date.getUTCFullYear()}, ${time}`;
}

/** Readable dates with optional time: Aug 24, 2026, 19:35 GMT */
export function formatGmtDisplay(
  value: Date | string | null | undefined,
  options?: { includeTime?: boolean },
) {
  const date = asDate(value);
  if (!date) return "—";

  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  if (!options?.includeTime) {
    return `${month} ${day}, ${year} GMT`;
  }
  return `${month} ${day}, ${year}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} GMT`;
}
