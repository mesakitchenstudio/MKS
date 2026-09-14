/**
 * RecipeIngredient backfill (ING-3).
 *
 * Usage:
 *   npm run ingredient:backfill              # DRY RUN (default)
 *   npm run ingredient:backfill -- --apply   # mutate derived index
 *
 * Does not alter Recipe.values, create revisions, or seed Ingredients.
 * Local SQLite dry-run / apply is allowed for development.
 * Production/operator mode + --apply requires postgres/postgresql DATABASE_URL.
 * Recommended order: migrate → ingredient:seed → this command --apply → coverage
 */
import { getDb } from "../src/lib/db.ts";
import {
  backfillRecipeIngredientIndex,
  formatRecipeIngredientBackfillReport,
} from "../src/lib/ingredient-index/index.ts";
import {
  assertIngredientOperatorWriteTargetSafe,
  describeDatabaseTarget,
} from "../src/lib/ingredient-index/cli-guard.ts";

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(describeDatabaseTarget());
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log("");

  // Mutating Production path: validate Postgres before any Recipe query/write.
  if (apply) {
    assertIngredientOperatorWriteTargetSafe();
  }

  const db = getDb();
  const report = await backfillRecipeIngredientIndex(db, { apply });
  console.log(formatRecipeIngredientBackfillReport(report));

  if (report.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("RecipeIngredient backfill failed unexpectedly.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
