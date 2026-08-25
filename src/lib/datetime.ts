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
