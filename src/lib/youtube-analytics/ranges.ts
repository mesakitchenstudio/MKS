export const ANALYTICS_RANGE_DAYS = [7, 28, 90] as const;
export type AnalyticsRangeDays = (typeof ANALYTICS_RANGE_DAYS)[number];
export const DEFAULT_ANALYTICS_RANGE_DAYS: AnalyticsRangeDays = 28;

export type AnalyticsDateRange = {
  days: AnalyticsRangeDays;
  /** Inclusive start YYYY-MM-DD (UTC). */
  startDate: string;
  /** Inclusive end YYYY-MM-DD (UTC) — typically yesterday (Analytics lag). */
  endDate: string;
};

function utcYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseUtcYmd(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Parse ?range= query; default 28. */
export function parseAnalyticsRangeDays(raw: unknown): AnalyticsRangeDays {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (n === 7 || n === 28 || n === 90) return n;
  return DEFAULT_ANALYTICS_RANGE_DAYS;
}

/**
 * Build an inclusive UTC date window ending on "yesterday"
 * (YouTube Analytics typically lags the current day).
 */
export function analyticsDateRange(
  days: AnalyticsRangeDays = DEFAULT_ANALYTICS_RANGE_DAYS,
  now: Date = new Date(),
): AnalyticsDateRange {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return {
    days,
    startDate: utcYmd(start),
    endDate: utcYmd(end),
  };
}

/** Inclusive list of UTC midnights from startDate through endDate. */
export function eachUtcDay(startDate: string, endDate: string): Date[] {
  const start = parseUtcYmd(startDate);
  const end = parseUtcYmd(endDate);
  const days: Date[] = [];
  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

export function utcDayStart(ymd: string): Date {
  return parseUtcYmd(ymd);
}

/**
 * Synthetic UTC date used to store Top-videos period aggregates in VideoDay.
 * Top videos reports are period totals (not daily), and 7/28/90 share the same
 * real endDate — so we key rows by these reserved calendar days instead.
 */
export function analyticsVideoPeriodStoreDate(days: AnalyticsRangeDays): Date {
  return new Date(Date.UTC(2099, 0, days));
}
