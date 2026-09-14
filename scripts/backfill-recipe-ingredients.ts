/**
 * RecipeIngredient backfill (ING-3).
 *
 * Usage:
 *   npm run ingredient:backfill              # DRY RUN (default)
 *   npm run ingredient:backfill -- --apply   # mutate derived index
 *
 * Does not alter Recipe.values, create revisions, or seed Ingredients.
 * Recommended order: migrate → ingredient:seed → this command --apply → coverage
 */
import { getDb } from "../src/lib/db.ts";
import {
  backfillRecipeIngredientIndex,
  formatRecipeIngredientBackfillReport,
} from "../src/lib/ingredient-index/index.ts";
import { describeDatabaseTarget } from "../src/lib/ingredient-index/cli-guard.ts";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  console.log(describeDatabaseTarget());
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log("");

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
