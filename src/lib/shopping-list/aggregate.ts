/**
 * Conservative Shopping List aggregation (ING-7).
 * When uncertain: do not merge.
 */

import { notesCompatible, normalizeNotesKey } from "./contribution";
import {
  formatPackageCount,
  formatShoppingQuantity,
  parseShoppingQuantity,
  quantitiesCompatible,
  sumCompatibleQuantities,
  type ShoppingParsedQuantity,
} from "./quantity";
import type {
  ShoppingListContribution,
  ShoppingListDisplayItem,
  ShoppingListRecipeSource,
  ShoppingListState,
  ShoppingListView,
} from "./types";

function conceptualIdentityKey(c: ShoppingListContribution): string {
  if (c.ingredientId) return `id:${c.ingredientId}`;
  return `u:${c.authoredItemNorm}`;
}

function identityCompatible(a: ShoppingListContribution, b: ShoppingListContribution): boolean {
  if (a.ingredientId && b.ingredientId) return a.ingredientId === b.ingredientId;
  if (a.ingredientId || b.ingredientId) return false;
  return a.authoredItemNorm === b.authoredItemNorm && Boolean(a.authoredItemNorm);
}

function sourceDedupe(
  contributions: ShoppingListContribution[],
): ShoppingListDisplayItem["sources"] {
  const map = new Map<string, ShoppingListDisplayItem["sources"][number]>();
  for (const c of contributions) {
    if (!map.has(c.recipeId)) {
      map.set(c.recipeId, {
        recipeId: c.recipeId,
        recipeSlug: c.recipeSlug,
        recipeTitle: c.recipeTitle,
        servings: c.servings,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.recipeTitle.localeCompare(b.recipeTitle));
}

function displayKeyForCluster(
  sample: ShoppingListContribution,
  amountKey: string,
): string {
  return [
    conceptualIdentityKey(sample),
    sample.shoppingItemKey,
    normalizeNotesKey(sample.notes),
    amountKey,
  ].join("|");
}

function amountKeyForParsed(
  parsed: ShoppingParsedQuantity,
  scaledSample: string,
): string {
  if (parsed.kind === "aggregatable") {
    return `agg:${parsed.unit}:${parsed.packageDetail ?? ""}`;
  }
  if (parsed.kind === "nonnumeric") {
    return `text:${parsed.text}`;
  }
  return `opaque:${scaledSample.toLowerCase().replace(/\s+/g, " ")}`;
}

function tryMergeCluster(
  cluster: ShoppingListContribution[],
): { amountDisplay: string; amountKey: string } | null {
  if (!cluster.length) return null;
  const sample = cluster[0]!;

  // Identity + shopping key + notes already filtered by caller
  const parsedList = cluster.map((c) => parseShoppingQuantity(c.scaledAmountText));

  // All nonnumeric identical → dedupe
  if (parsedList.every((p) => p.kind === "nonnumeric")) {
    const texts = new Set(
      parsedList.map((p) => (p.kind === "nonnumeric" ? p.text : "")),
    );
    if (texts.size === 1) {
      const text = [...texts][0]!;
      return {
        amountDisplay: cluster[0]!.scaledAmountText.trim() || text,
        amountKey: `text:${text}`,
      };
    }
    return null;
  }

  // Any nonaggregatable / mixed kinds → no merge of whole cluster
  if (!parsedList.every((p) => p.kind === "aggregatable")) {
    return null;
  }

  const aggregatable = parsedList as Array<
    Extract<ShoppingParsedQuantity, { kind: "aggregatable" }>
  >;
  for (let i = 1; i < aggregatable.length; i += 1) {
    if (!quantitiesCompatible(aggregatable[0]!, aggregatable[i]!)) return null;
  }

  const summed = sumCompatibleQuantities(aggregatable);
  if (!summed) return null;

  let amountDisplay: string;
  if (summed.packageDetail) {
    amountDisplay = formatPackageCount(
      summed.value,
      summed.packageDetail,
      sample.scaledAmountText,
    );
  } else {
    amountDisplay = formatShoppingQuantity(summed);
  }

  return {
    amountDisplay,
    amountKey: amountKeyForParsed(summed, sample.scaledAmountText),
  };
}

/**
 * Aggregate contributions into display rows.
 * Purchased association uses deterministic display keys.
 */
export function aggregateShoppingList(
  contributions: ShoppingListContribution[],
  purchasedKeys: string[] = [],
): ShoppingListDisplayItem[] {
  const purchased = new Set(purchasedKeys);
  const remaining = [...contributions];
  const rows: ShoppingListDisplayItem[] = [];

  while (remaining.length) {
    const seed = remaining.shift()!;
    const cluster: ShoppingListContribution[] = [seed];
    const rest: ShoppingListContribution[] = [];

    for (const candidate of remaining) {
      if (
        identityCompatible(seed, candidate) &&
        seed.shoppingItemKey === candidate.shoppingItemKey &&
        notesCompatible(seed.notes, candidate.notes)
      ) {
        cluster.push(candidate);
      } else {
        rest.push(candidate);
      }
    }
    remaining.length = 0;
    remaining.push(...rest);

    const merged = tryMergeCluster(cluster);
    if (merged && cluster.length >= 1) {
      // Even single items go through format path when aggregatable
      const key = displayKeyForCluster(seed, merged.amountKey);
      rows.push({
        key,
        amountDisplay: merged.amountDisplay,
        itemDisplay: seed.authoredItem,
        notesDisplay: seed.notes,
        contributionIds: cluster.map((c) => c.id),
        sources: sourceDedupe(cluster),
        purchased: purchased.has(key),
      });
      continue;
    }

    // Cannot merge cluster — emit each contribution as its own row
    for (const c of cluster) {
      const parsed = parseShoppingQuantity(c.scaledAmountText);
      let amountDisplay = c.scaledAmountText.trim();
      if (parsed.kind === "aggregatable" && !parsed.packageDetail) {
        amountDisplay = formatShoppingQuantity(parsed);
      } else if (parsed.kind === "aggregatable" && parsed.packageDetail) {
        amountDisplay = formatPackageCount(
          parsed.value,
          parsed.packageDetail,
          c.scaledAmountText,
        );
      }
      const amountKey = amountKeyForParsed(parsed, c.scaledAmountText);
      const key = displayKeyForCluster(c, amountKey);
      rows.push({
        key,
        amountDisplay,
        itemDisplay: c.authoredItem,
        notesDisplay: c.notes,
        contributionIds: [c.id],
        sources: sourceDedupe([c]),
        purchased: purchased.has(key),
      });
    }
  }

  return rows.sort((a, b) => a.itemDisplay.localeCompare(b.itemDisplay));
}

export function listRecipeSources(
  contributions: ShoppingListContribution[],
): ShoppingListRecipeSource[] {
  const map = new Map<string, ShoppingListRecipeSource>();
  for (const c of contributions) {
    const existing = map.get(c.recipeId);
    if (existing) {
      existing.contributionCount += 1;
      // Prefer RECIPE mode if any contribution is full recipe
      if (c.sourceMode === "RECIPE") existing.sourceMode = "RECIPE";
      existing.servings = c.servings;
      existing.recipeTitle = c.recipeTitle;
      existing.recipeSlug = c.recipeSlug;
    } else {
      map.set(c.recipeId, {
        recipeId: c.recipeId,
        recipeSlug: c.recipeSlug,
        recipeTitle: c.recipeTitle,
        servings: c.servings,
        sourceMode: c.sourceMode,
        contributionCount: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.recipeTitle.localeCompare(b.recipeTitle));
}

export function buildShoppingListView(state: ShoppingListState): ShoppingListView {
  const all = aggregateShoppingList(state.contributions, state.purchasedKeys);
  const unchecked = all.filter((row) => !row.purchased);
  const purchased = all.filter((row) => row.purchased);
  const sources = listRecipeSources(state.contributions);
  return {
    sources,
    unchecked,
    purchased,
    itemCount: all.length,
    recipeCount: sources.length,
  };
}

export function formatShoppingListPlainText(view: ShoppingListView): string {
  const lines = ["Shopping List", ""];
  if (!view.unchecked.length) {
    lines.push("(No unchecked items)");
    return lines.join("\n");
  }
  for (const row of view.unchecked) {
    const amount = row.amountDisplay ? `${row.amountDisplay} ` : "";
    const notes = row.notesDisplay ? `, ${row.notesDisplay}` : "";
    lines.push(`${amount}${row.itemDisplay}${notes}`.trim());
  }
  return lines.join("\n");
}
