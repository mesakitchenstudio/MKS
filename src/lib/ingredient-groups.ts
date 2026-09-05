/**
 * Ingredient-group normalization for the Recipe Editor and AI drafts.
 * Empty optional groups must not pollute the UI or publish UX.
 */

export type IngredientLine = {
  item: string;
  amount: string;
  notes?: string;
};

export type IngredientGroup = {
  name?: string;
  items: IngredientLine[];
};

export function emptyIngredientGroupsPlaceholder(): IngredientGroup[] {
  return [{ name: "", items: [{ item: "", amount: "", notes: "" }] }];
}

export function ingredientLineHasContent(line: {
  item?: string | null;
  amount?: string | null;
  notes?: string | null;
}): boolean {
  return Boolean(
    String(line.item ?? "").trim() ||
      String(line.amount ?? "").trim() ||
      String(line.notes ?? "").trim(),
  );
}

export function ingredientGroupHasContent(group: {
  name?: string | null;
  items?: { item?: string | null; amount?: string | null; notes?: string | null }[] | null;
}): boolean {
  return (group.items ?? []).some((row) => ingredientLineHasContent(row));
}

/** True when the group has no meaningful ingredient rows (name alone does not count). */
export function isEmptyIngredientGroup(group: {
  name?: string | null;
  items?: { item?: string | null; amount?: string | null; notes?: string | null }[] | null;
}): boolean {
  return !ingredientGroupHasContent(group);
}

function coerceLine(raw: unknown): IngredientLine | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const line: IngredientLine = {
    item: String(row.item ?? "").trim(),
    amount: String(row.amount ?? "").trim(),
    notes: String(row.notes ?? "").trim(),
  };
  if (!ingredientLineHasContent(line)) return null;
  return line;
}

function coerceGroup(raw: unknown): IngredientGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = String(row.name ?? "").trim();
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items = itemsRaw
    .map((entry) => coerceLine(entry))
    .filter((line): line is IngredientLine => Boolean(line));
  if (!items.length) return null;
  return { name, items };
}

/**
 * Drop empty groups and coalesce all-unnamed multi-group stacks into one list.
 * Never invents ingredient text. Preserves named groups that have real items.
 */
export function normalizeIngredientGroups(
  raw: unknown,
  options?: { forEditor?: boolean },
): IngredientGroup[] {
  const forEditor = options?.forEditor === true;
  if (!Array.isArray(raw)) {
    return forEditor ? emptyIngredientGroupsPlaceholder() : [];
  }

  const kept: IngredientGroup[] = [];
  for (const entry of raw) {
    const group = coerceGroup(entry);
    if (group) kept.push(group);
  }

  if (!kept.length) {
    return forEditor ? emptyIngredientGroupsPlaceholder() : [];
  }

  const allUnnamed = kept.every((group) => !String(group.name ?? "").trim());
  if (allUnnamed && kept.length > 1) {
    const items = kept.flatMap((group) => group.items);
    return [{ name: "", items }];
  }

  // Merge consecutive unnamed groups while preserving named sections.
  const merged: IngredientGroup[] = [];
  for (const group of kept) {
    const named = Boolean(String(group.name ?? "").trim());
    const last = merged[merged.length - 1];
    if (!named && last && !String(last.name ?? "").trim()) {
      last.items = [...last.items, ...group.items];
      continue;
    }
    merged.push({ name: group.name ?? "", items: [...group.items] });
  }

  return merged;
}

/** Count groups that contain at least one meaningful ingredient row. */
export function countContentIngredientGroups(raw: unknown): number {
  return normalizeIngredientGroups(raw).length;
}

/** True when any group has a usable ingredient `item` (publish rule). */
export function hasPublishableIngredients(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const items = Array.isArray((entry as { items?: unknown }).items)
      ? ((entry as { items: { item?: string }[] }).items ?? [])
      : [];
    return items.some((item) => String(item.item ?? "").trim().length > 0);
  });
}
