/**
 * Editorial dish name helpers for the Recipe Editor Identity field.
 * Persisted as `values.dishName` (with legacy aliases on read).
 */

export function readEditorialDishName(rawValues: Record<string, unknown>): string {
  const primary = String(rawValues.dishName ?? "").trim();
  if (primary) return primary;
  const recipeDish = String(rawValues.recipeDish ?? "").trim();
  if (recipeDish) return recipeDish;
  return String(rawValues.shortName ?? "").trim();
}

/** Parse FormData `field:dishName` (JSON-encoded) or a plain string; trim whitespace. */
export function normalizeDishNameForSave(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw !== "string") return String(raw).trim();
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed == null) return "";
    return String(parsed).trim();
  } catch {
    return trimmed;
  }
}

/** Always write `dishName` into the values payload (empty string when blank). */
export function mergeDishNameIntoValues(
  values: Record<string, unknown>,
  dishNameRaw: unknown,
): void {
  values.dishName = normalizeDishNameForSave(dishNameRaw);
}
