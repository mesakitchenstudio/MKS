import type { getDb } from "@/lib/db";
import { INGREDIENT_MATCH_VIA } from "@/lib/ingredient-identity";
import type { RecipeIngredientCoverageReport } from "./types";

type DbClient = ReturnType<typeof getDb>;

/**
 * Read-only coverage report over derived RecipeIngredient rows.
 */
export async function reportRecipeIngredientCoverage(
  db: DbClient,
): Promise<RecipeIngredientCoverageReport> {
  const [exact, alias, unresolved, recipeIdRows, canonicalIngredients, aliases, unresolvedRows] =
    await Promise.all([
      db.recipeIngredient.count({ where: { matchedVia: INGREDIENT_MATCH_VIA.EXACT } }),
      db.recipeIngredient.count({ where: { matchedVia: INGREDIENT_MATCH_VIA.ALIAS } }),
      db.recipeIngredient.count({ where: { matchedVia: INGREDIENT_MATCH_VIA.UNRESOLVED } }),
      db.recipeIngredient.findMany({
        distinct: ["recipeId"],
        select: { recipeId: true },
      }),
      db.ingredient.count(),
      db.ingredientAlias.count(),
      db.recipeIngredient.findMany({
        where: { matchedVia: INGREDIENT_MATCH_VIA.UNRESOLVED },
        select: {
          authoredItem: true,
          authoredItemNorm: true,
          recipeId: true,
        },
      }),
    ]);
  const recipesIndexed = recipeIdRows.length;

  const ingredientRowsIndexed = exact + alias + unresolved;
  const matched = exact + alias;
  const coveragePercent =
    ingredientRowsIndexed === 0
      ? 0
      : Math.round((matched / ingredientRowsIndexed) * 1000) / 10;

  const byNorm = new Map<
    string,
    { authoredItemNorm: string; representativeAuthoredItem: string; occurrenceCount: number; recipes: Set<string> }
  >();
  for (const row of unresolvedRows) {
    const key = row.authoredItemNorm || normalizeFallback(row.authoredItem);
    const existing = byNorm.get(key);
    if (!existing) {
      byNorm.set(key, {
        authoredItemNorm: key,
        representativeAuthoredItem: row.authoredItem,
        occurrenceCount: 1,
        recipes: new Set([row.recipeId]),
      });
    } else {
      existing.occurrenceCount += 1;
      existing.recipes.add(row.recipeId);
    }
  }

  const unresolvedGrouped = [...byNorm.values()]
    .map((entry) => ({
      authoredItemNorm: entry.authoredItemNorm,
      representativeAuthoredItem: entry.representativeAuthoredItem,
      occurrenceCount: entry.occurrenceCount,
      recipeCount: entry.recipes.size,
    }))
    .sort((a, b) => {
      if (b.occurrenceCount !== a.occurrenceCount) return b.occurrenceCount - a.occurrenceCount;
      return a.authoredItemNorm.localeCompare(b.authoredItemNorm);
    });

  return {
    recipesIndexed,
    ingredientRowsIndexed,
    exact,
    alias,
    unresolved,
    matched,
    coveragePercent,
    distinctUnresolvedKeys: unresolvedGrouped.length,
    unresolvedGrouped,
    canonicalIngredients,
    aliases,
  };
}

function normalizeFallback(value: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function formatRecipeIngredientCoverageReport(
  report: RecipeIngredientCoverageReport,
): string {
  const lines = [
    "Ingredient index coverage (derived RecipeIngredient)",
    "",
    `Recipes indexed:           ${String(report.recipesIndexed).padStart(6)}`,
    `Ingredient rows indexed:   ${String(report.ingredientRowsIndexed).padStart(6)}`,
    `Exact:                     ${String(report.exact).padStart(6)}`,
    `Alias:                     ${String(report.alias).padStart(6)}`,
    `Unresolved:                ${String(report.unresolved).padStart(6)}`,
    `Matched (exact+alias):     ${String(report.matched).padStart(6)}`,
    `Coverage:                  ${String(report.coveragePercent).padStart(5)}%`,
    `Distinct unresolved keys:  ${String(report.distinctUnresolvedKeys).padStart(6)}`,
    `Canonical Ingredients:     ${String(report.canonicalIngredients).padStart(6)}`,
    `Aliases:                   ${String(report.aliases).padStart(6)}`,
    "",
    "Top unresolved (by occurrence):",
  ];

  if (!report.unresolvedGrouped.length) {
    lines.push("(none)");
  } else {
    for (const row of report.unresolvedGrouped.slice(0, 40)) {
      lines.push(
        `- ${row.representativeAuthoredItem} [${row.authoredItemNorm}] ×${row.occurrenceCount} (recipes: ${row.recipeCount})`,
      );
    }
  }

  return lines.join("\n");
}
