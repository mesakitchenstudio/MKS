/**
 * Read-only RecipeIngredient coverage report (ING-3).
 *
 * Usage:
 *   npm run ingredient:coverage
 *
 * Reports the current database only (local SQLite via getDb unless VERCEL).
 * Not Production Neon coverage unless intentionally run in that environment.
 */
import { getDb } from "../src/lib/db.ts";
import {
  formatRecipeIngredientCoverageReport,
  reportRecipeIngredientCoverage,
} from "../src/lib/ingredient-index/index.ts";
import { describeDatabaseTarget } from "../src/lib/ingredient-index/cli-guard.ts";

async function main() {
  const db = getDb();
  console.log(describeDatabaseTarget());
  console.log("");

  const report = await reportRecipeIngredientCoverage(db);
  console.log(formatRecipeIngredientCoverageReport(report));
}

main().catch((error) => {
  console.error("Ingredient coverage report failed unexpectedly.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
