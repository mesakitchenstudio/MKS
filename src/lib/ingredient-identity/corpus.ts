import { buildIngredientCatalog } from "./catalog";
import { matchIngredientIdentityAgainstCatalog } from "./match";
import { normalizeIngredientLookupKey } from "./normalize";
import { INGREDIENT_IDENTITY_SEED } from "./seed";
import type {
  AuthoredIngredientOccurrence,
  IngredientCatalog,
  IngredientCorpusReport,
  IngredientSeedEntry,
} from "./types";

export type CorpusRecipeLike = {
  title?: string;
  ingredients?: Array<{
    name?: string;
    items?: Array<{ item?: string | null; amount?: string | null; notes?: string | null }>;
  }> | null;
};

/** Collect authored ingredient item occurrences without mutating input. */
export function collectAuthoredIngredientOccurrences(
  recipes: CorpusRecipeLike[],
): AuthoredIngredientOccurrence[] {
  const rows: AuthoredIngredientOccurrence[] = [];
  for (const recipe of recipes) {
    const groups = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    groups.forEach((group, groupIndex) => {
      const items = Array.isArray(group.items) ? group.items : [];
      items.forEach((line, itemIndex) => {
        const authoredItem = String(line?.item ?? "").trim();
        if (!authoredItem) return;
        rows.push({
          authoredItem,
          normalizedKey: normalizeIngredientLookupKey(authoredItem),
          recipeTitle: recipe.title,
          groupIndex,
          itemIndex,
        });
      });
    });
  }
  return rows;
}

export function analyzeIngredientCorpus(input: {
  recipes: CorpusRecipeLike[];
  seed?: IngredientSeedEntry[];
  catalog?: IngredientCatalog;
}): IngredientCorpusReport {
  const catalog =
    input.catalog || buildIngredientCatalog(input.seed || INGREDIENT_IDENTITY_SEED);
  const occurrences = collectAuthoredIngredientOccurrences(input.recipes);

  const byAuthored = new Map<
    string,
    { authoredItem: string; normalizedKey: string; count: number }
  >();
  for (const row of occurrences) {
    const key = row.authoredItem;
    const existing = byAuthored.get(key);
    if (existing) existing.count += 1;
    else {
      byAuthored.set(key, {
        authoredItem: row.authoredItem,
        normalizedKey: row.normalizedKey,
        count: 1,
      });
    }
  }

  const distinctNorm = new Set(
    [...byAuthored.values()].map((row) => row.normalizedKey).filter(Boolean),
  );

  let matchedExact = 0;
  let matchedAlias = 0;
  const unresolvedAuthored: IngredientCorpusReport["unresolvedAuthored"] = [];
  const matchedAuthored: IngredientCorpusReport["matchedAuthored"] = [];

  for (const row of byAuthored.values()) {
    const match = matchIngredientIdentityAgainstCatalog(row.authoredItem, catalog);
    if (match.status === "exact") {
      matchedExact += 1;
      matchedAuthored.push({
        authoredItem: row.authoredItem,
        normalizedKey: row.normalizedKey,
        status: "exact",
        ingredientName: match.ingredientName || "",
        count: row.count,
      });
    } else if (match.status === "alias") {
      matchedAlias += 1;
      matchedAuthored.push({
        authoredItem: row.authoredItem,
        normalizedKey: row.normalizedKey,
        status: "alias",
        ingredientName: match.ingredientName || "",
        count: row.count,
      });
    } else {
      unresolvedAuthored.push({
        authoredItem: row.authoredItem,
        normalizedKey: row.normalizedKey,
        count: row.count,
      });
    }
  }

  unresolvedAuthored.sort(
    (a, b) => b.count - a.count || a.authoredItem.localeCompare(b.authoredItem),
  );
  matchedAuthored.sort(
    (a, b) => b.count - a.count || a.authoredItem.localeCompare(b.authoredItem),
  );

  const matchedDistinct = matchedExact + matchedAlias;
  const distinctAuthoredItems = byAuthored.size;
  const coveragePercent =
    distinctAuthoredItems === 0
      ? 0
      : Math.round((matchedDistinct / distinctAuthoredItems) * 1000) / 10;

  return {
    recipesAnalyzed: input.recipes.length,
    ingredientRows: occurrences.length,
    distinctAuthoredItems,
    distinctNormalizedKeys: distinctNorm.size,
    matchedExact,
    matchedAlias,
    unresolved: unresolvedAuthored.length,
    matchedDistinct,
    coveragePercent,
    unresolvedAuthored,
    matchedAuthored,
  };
}

/** Human-readable report for CLI / Owner review. */
export function formatIngredientCorpusReport(report: IngredientCorpusReport): string {
  const lines = [
    "Ingredient normalization report",
    "",
    `Recipes analyzed: ${report.recipesAnalyzed}`,
    `Ingredient rows: ${report.ingredientRows}`,
    `Distinct authored items: ${report.distinctAuthoredItems}`,
    `Distinct normalized keys: ${report.distinctNormalizedKeys}`,
    "",
    `Matched: ${report.matchedDistinct} / ${report.distinctAuthoredItems} (${report.coveragePercent}%)`,
    `Exact canonical: ${report.matchedExact}`,
    `Alias: ${report.matchedAlias}`,
    `Unresolved: ${report.unresolved}`,
  ];

  if (report.unresolvedAuthored.length) {
    lines.push("", "Unresolved:");
    for (const row of report.unresolvedAuthored.slice(0, 40)) {
      lines.push(`- ${row.authoredItem} (×${row.count})`);
    }
    if (report.unresolvedAuthored.length > 40) {
      lines.push(`… and ${report.unresolvedAuthored.length - 40} more`);
    }
  }

  return lines.join("\n");
}
