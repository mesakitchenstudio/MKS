/**
 * Explicit Recipe Revision baseline backfill.
 *
 * Usage:
 *   npm run db:backfill-recipe-revisions
 *
 * Idempotent: recipes that already have any revision are skipped.
 * Creates one "baseline" revision from current recipe state.
 * Exits non-zero on FAILED.
 */
import {
  backfillRecipeRevisionBaselines,
  formatRecipeRevisionBaselineReport,
} from "../src/lib/recipe-revisions.ts";

async function main() {
  const report = await backfillRecipeRevisionBaselines();
  console.log(formatRecipeRevisionBaselineReport(report));

  if (report.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Recipe revision baseline failed unexpectedly.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
