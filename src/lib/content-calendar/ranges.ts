import {
  formatIstanbulParts,
  istanbulStartOfDayUtc,
  zonedLocalToUtc,
} from "@/lib/youtube-data/release-planner";

export const CONTENT_CALENDAR_TIMEZONE = "Europe/Istanbul";

export type CalendarMonthRef = {
  year: number;
  month: number;
  monthKey: string;
};

/** Inclusive UTC range covering the Istanbul calendar month (and optional week spillover). */
export type CalendarMonthWindow = {
  year: number;
  month: number;
  monthKey: string;
  /** First Istanbul day of month YYYY-MM-DD */
  startDateKey: string;
  /** Last Istanbul day of month YYYY-MM-DD */
  endDateKey: string;
  rangeStartUtc: Date;
  rangeEndExclusiveUtc: Date;
};

export function parseCalendarYearMonth(input?: {
  year?: unknown;
  month?: unknown;
  now?: Date;
}): CalendarMonthRef {
  const now = input?.now ?? new Date();
  const parts = formatIstanbulParts(now);
  const fallbackYear = Number(parts.year) || now.getUTCFullYear();
  const fallbackMonth = parts.monthKey ? Number(parts.monthKey.slice(5)) : now.getUTCMonth() + 1;

  let year = Number(String(input?.year ?? "").trim());
  let month = Number(String(input?.month ?? "").trim());
  if (!Number.isFinite(year) || year < 2000 || year > 2100) year = fallbackYear;
  if (!Number.isFinite(month) || month < 1 || month > 12) month = fallbackMonth;

  return {
    year,
    month,
    monthKey: `${year}-${String(month).padStart(2, "0")}`,
  };
}

export function shiftCalendarMonth(ref: CalendarMonthRef, delta: number): CalendarMonthRef {
  const date = new Date(Date.UTC(ref.year, ref.month - 1 + delta, 1));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return {
    year,
    month,
    monthKey: `${year}-${String(month).padStart(2, "0")}`,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Istanbul-local month window as UTC [start, endExclusive). */
export function contentCalendarMonthWindow(ref: CalendarMonthRef): CalendarMonthWindow {
  const startDateKey = `${ref.monthKey}-01`;
  const lastDay = daysInMonth(ref.year, ref.month);
  const endDateKey = `${ref.monthKey}-${String(lastDay).padStart(2, "0")}`;
  const rangeStartUtc = istanbulStartOfDayUtc(startDateKey);
  const nextMonth = shiftCalendarMonth(ref, 1);
  const rangeEndExclusiveUtc = istanbulStartOfDayUtc(`${nextMonth.monthKey}-01`);
  return {
    year: ref.year,
    month: ref.month,
    monthKey: ref.monthKey,
    startDateKey,
    endDateKey,
    rangeStartUtc,
    rangeEndExclusiveUtc,
  };
}

export function istanbulDateKeyFromUtc(value: Date | string): string {
  return formatIstanbulParts(value).dateKey;
}

export function istanbulTimeFromUtc(value: Date | string): string {
  const time = formatIstanbulParts(value).time24;
  return time && time !== "—" ? time : "";
}

export function istanbulTodayDateKey(now: Date = new Date()): string {
  return formatIstanbulParts(now).dateKey;
}

export function monthLabel(year: number, month: number): string {
  const sample = zonedLocalToUtc({
    timeZone: CONTENT_CALENDAR_TIMEZONE,
    year,
    month,
    day: 1,
    hour: 12,
    minute: 0,
  });
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CONTENT_CALENDAR_TIMEZONE,
    month: "long",
    year: "numeric",
  }).format(sample);
}

export function weekdayLabel(dateKey: string): string {
  const utc = istanbulStartOfDayUtc(dateKey);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CONTENT_CALENDAR_TIMEZONE,
    weekday: "long",
  }).format(utc);
}
