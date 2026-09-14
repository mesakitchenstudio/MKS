import type { Prisma } from "@prisma/client";
import type { getDb } from "@/lib/db";
import { normalizeIngredientLookupKey } from "@/lib/ingredient-identity";
import {
  buildRecipeIngredientIndexRows,
  extractAuthoredIngredientItems,
  parseRecipeValuesIngredients,
} from "./build-rows";
import { loadIngredientIdentityCatalogForKeys } from "./lookup";
import {
  prepareRecipeIngredientIndexRows,
  replaceRecipeIngredientIndexRows,
} from "./rebuild";
import type { RecipeIngredientBackfillReport } from "./types";

type DbClient = ReturnType<typeof getDb>;

/**
 * Interactive transaction options for per-recipe APPLY rebuilds.
 * Prisma default timeout is 5000ms — too short for Production Neon latency
 * when catalog lookup + delete/create ran inside the same interactive tx.
 *
 * maxWait: time to acquire a connection from the pool before starting.
 * timeout: interactive transaction lifetime once started.
 */
export const RECIPE_INGREDIENT_BACKFILL_TX = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function clip(value: unknown, max = 120) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

/** Transient Neon / Prisma interactive-transaction failures eligible for one retry. */
export function isTransientIngredientBackfillError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (code === "P2028" || code === "P1001" || code === "P1017") {
    return true;
  }

  return (
    /Transaction already closed/i.test(message) ||
    /expired transaction/i.test(message) ||
    /Transaction API error/i.test(message) ||
    /Interactive transaction .* timed out/i.test(message) ||
    /Can't reach database server/i.test(message) ||
    /Timed out fetching a new connection/i.test(message) ||
    /Connection .* closed/i.test(message) ||
    /Server has closed the connection/i.test(message)
  );
}

async function applyRebuildOneRecipe(
  db: DbClient,
  recipeId: string,
): Promise<{ rowCount: number; title: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // Reload authoritative values close to rebuild (fresher than the initial list scan).
      const fresh = await db.recipe.findUnique({
        where: { id: recipeId },
        select: { id: true, title: true, values: true },
      });
      if (!fresh) {
        throw new Error(`Recipe ${recipeId} not found during backfill apply`);
      }

      // Catalog + parse outside the interactive transaction so Neon latency does not
      // burn the tx timeout before delete/createMany.
      const rows = await prepareRecipeIngredientIndexRows(db, {
        recipeId: fresh.id,
        values: fresh.values,
      });

      const result = await db.$transaction(
        async (tx: Prisma.TransactionClient) => {
          return replaceRecipeIngredientIndexRows(tx, fresh.id, rows);
        },
        {
          maxWait: RECIPE_INGREDIENT_BACKFILL_TX.maxWait,
          timeout: RECIPE_INGREDIENT_BACKFILL_TX.timeout,
        },
      );

      return { rowCount: result.rowCount, title: fresh.title };
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isTransientIngredientBackfillError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

      const result = await applyRebuildOneRecipe(db, recipe.id);
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
