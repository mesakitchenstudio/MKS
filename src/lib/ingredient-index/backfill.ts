import type { Prisma } from "@prisma/client";
import type { getDb } from "@/lib/db";
import { normalizeIngredientLookupKey } from "@/lib/ingredient-identity";
import {
  buildRecipeIngredientIndexRows,
  extractAuthoredIngredientItems,
  parseRecipeValuesIngredients,
} from "./build-rows";
import { loadIngredientIdentityCatalogForKeys } from "./lookup";
import { rebuildRecipeIngredientIndex } from "./rebuild";
import type { RecipeIngredientBackfillReport } from "./types";

type DbClient = ReturnType<typeof getDb>;

function clip(value: unknown, max = 120) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/**
 * Idempotent RecipeIngredient backfill for all active Recipes (any status).
 * Per-recipe transaction on apply. Does not mutate Recipe.values or create revisions.
 */
export async function backfillRecipeIngredientIndex(
  db: DbClient,
  options?: { apply?: boolean },
): Promise<RecipeIngredientBackfillReport> {
  const apply = options?.apply === true;
  const report: RecipeIngredientBackfillReport = {
    status: apply ? "SUCCESS" : "DRY_RUN",
    mode: apply ? "apply" : "dry_run",
    examined: 0,
    rebuilt: 0,
    rowsWritten: 0,
    failures: [],
  };

  const recipes = await db.recipe.findMany({
    select: { id: true, title: true, values: true, status: true },
    orderBy: { id: "asc" },
  });
  report.examined = recipes.length;

  for (const recipe of recipes) {
    try {
      if (!apply) {
        const items = extractAuthoredIngredientItems(
          parseRecipeValuesIngredients(recipe.values),
        );
        const norms = [
          ...new Set(
            items
              .map((item) => normalizeIngredientLookupKey(item.authoredItem))
              .filter(Boolean),
          ),
        ];
        const catalog = await loadIngredientIdentityCatalogForKeys(db, norms);
        const rows = buildRecipeIngredientIndexRows({
          recipeId: recipe.id,
          items,
          ingredients: catalog.ingredients,
          aliases: catalog.aliases,
        });
        report.rebuilt += 1;
        report.rowsWritten += rows.length;
        continue;
      }

      const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        return rebuildRecipeIngredientIndex(tx, {
          recipeId: recipe.id,
          values: recipe.values,
        });
      });
      report.rebuilt += 1;
      report.rowsWritten += result.rowCount;
    } catch (error) {
      report.status = apply ? "FAILED" : report.status;
      report.failures.push({
        recipeId: recipe.id,
        title: clip(recipe.title),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!apply) {
    report.status = report.failures.length ? "FAILED" : "DRY_RUN";
  } else if (report.failures.length) {
    report.status = "FAILED";
  }

  return report;
}

export function formatRecipeIngredientBackfillReport(
  report: RecipeIngredientBackfillReport,
): string {
  const lines = [
    "RecipeIngredient backfill",
    "",
    `Mode:          ${report.mode === "apply" ? "APPLY" : "DRY RUN"}`,
    `Status:        ${report.status}`,
    `Examined:      ${String(report.examined).padStart(6)}`,
    `Rebuilt:       ${String(report.rebuilt).padStart(6)}`,
    `Rows written:  ${String(report.rowsWritten).padStart(6)}`,
  ];
  if (report.mode === "dry_run") {
    lines.push(
      "",
      "No mutations performed. Re-run with --apply to rebuild indexes.",
      "Recommended order: migrate → ingredient:seed → ingredient:backfill -- --apply → ingredient:coverage",
    );
  }
  if (report.failures.length) {
    lines.push("", "Failures:");
    for (const failure of report.failures) {
      lines.push(`- ${failure.recipeId} (${failure.title}): ${failure.message}`);
    }
  }
  return lines.join("\n");
}
