/**
 * Normalize plain string-list field values (kind: list | tags | gallery).
 * Never produces the corruption sentinel "[object Object]" from objects.
 */

/** Exact stored garbage from historical `String(object)` coercion. */
export const STRING_LIST_CORRUPT_SENTINEL = "[object Object]";

export function isStringListCorruptSentinel(value: string): boolean {
  return value.trim() === STRING_LIST_CORRUPT_SENTINEL;
}

/**
 * Extract a display string from one list entry.
 * Supported object keys match AI/list payloads seen in this codebase:
 * name, note, text, label, value (string only).
 * Unsupported objects → null (never String(object)).
 */
export function coerceStringListItem(item: unknown): string | null {
  if (typeof item === "string") {
    const trimmed = item.trim();
    if (!trimmed || isStringListCorruptSentinel(trimmed)) return null;
    return trimmed;
  }

  if (item == null || typeof item !== "object" || Array.isArray(item)) {
    return null;
  }

  const row = item as Record<string, unknown>;
  const text = typeof row.text === "string" ? row.text.trim() : "";
  const label = typeof row.label === "string" ? row.label.trim() : "";
  const value = typeof row.value === "string" ? row.value.trim() : "";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const note = typeof row.note === "string" ? row.note.trim() : "";

  const candidates: string[] = [];
  if (text) candidates.push(text);
  else if (label) candidates.push(label);
  else if (value) candidates.push(value);
  else if (name && note) candidates.push(`${name}: ${note}`);
  else if (name) candidates.push(name);
  else if (note) candidates.push(note);

  for (const candidate of candidates) {
    if (candidate && !isStringListCorruptSentinel(candidate)) return candidate;
  }

  return null;
}

/** Convert unknown list payloads into a clean `string[]`. */
export function coerceStringList(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    const single = coerceStringListItem(value);
    return single ? [single] : [];
  }

  const out: string[] = [];
  for (const item of value) {
    const next = coerceStringListItem(item);
    if (next) out.push(next);
  }
  return out;
}

/** Field kinds whose stored contract is plain `string[]`. */
export function isPlainStringListKind(kind: string): boolean {
  return kind === "list" || kind === "tags" || kind === "gallery";
}
