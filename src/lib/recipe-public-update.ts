/**
 * Editorial public update notes — separate from Recipe.updatedAt and Admin Revision History.
 */

export const PUBLIC_UPDATE_NOTE_MAX_CHARS = 500;
export const PUBLIC_UPDATE_NOTE_MIN_CHARS = 12;

export type NormalizedPublicUpdate = {
  note: string | null;
  updatedAt: Date | null;
};

export type PublicUpdateNormalizeResult =
  | { ok: true; value: NormalizedPublicUpdate }
  | { ok: false; error: string };

function trimNote(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
}

/** Parse YYYY-MM-DD or ISO into a UTC calendar date (noon UTC to avoid DST edge noise). */
export function parsePublicUpdateDateInput(raw: unknown): Date | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  // Prefer date-only form from <input type="date">
  const day = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (day) {
    const y = Number(day[1]);
    const m = Number(day[2]);
    const d = Number(day[3]);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Coherent pairing:
 * - both empty → valid (no public note)
 * - both present → valid
 * - only one → invalid
 */
export function normalizePublicUpdateFields(input: {
  enabled?: boolean;
  note?: unknown;
  date?: unknown;
}): PublicUpdateNormalizeResult {
  const enabled = input.enabled !== false;
  const note = enabled ? trimNote(input.note) : "";
  const date = enabled ? parsePublicUpdateDateInput(input.date) : null;

  if (!note && !date) {
    return { ok: true, value: { note: null, updatedAt: null } };
  }

  if (note && !date) {
    return { ok: false, error: "A public update note needs an update date." };
  }
  if (!note && date) {
    return { ok: false, error: "A public update date needs note text." };
  }

  if (note.length < PUBLIC_UPDATE_NOTE_MIN_CHARS) {
    return {
      ok: false,
      error: `Update note must be at least ${PUBLIC_UPDATE_NOTE_MIN_CHARS} characters.`,
    };
  }
  if (note.length > PUBLIC_UPDATE_NOTE_MAX_CHARS) {
    return {
      ok: false,
      error: `Update note must be at most ${PUBLIC_UPDATE_NOTE_MAX_CHARS} characters.`,
    };
  }

  return { ok: true, value: { note, updatedAt: date } };
}

/** Public label: "Updated September 2026" (month + year, UTC). */
export function formatPublicUpdateLabel(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const year = date.getUTCFullYear();
  return `Updated ${month} ${year}`;
}

/** YYYY-MM-DD for admin date inputs (UTC calendar day). */
export function publicUpdateDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Meaningful dateModified for Recipe JSON-LD. */
export function recipeDateModifiedIso(recipe: {
  publicUpdatedAt?: string | null;
  updatedAt: string;
}): string {
  const pub = recipe.publicUpdatedAt?.trim();
  if (pub) {
    const d = new Date(pub);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}/.test(pub)) return pub.slice(0, 10);
  }
  return recipe.updatedAt;
}
