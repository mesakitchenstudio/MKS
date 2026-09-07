/**
 * Explicit production Recipe Identity backfill.
 *
 * Usage:
 *   npm run db:backfill-recipe-identity
 *   npm run db:backfill-recipe-identity -- --force
 *
 * Safe to re-run (idempotent). Exits non-zero on FAILED.
 * Does not delete orphan rows or divergent review conflicts.
 */
import {
  backfillRecipeIdentity,
  formatRecipeIdentityBackfillReport,
} from "../src/lib/recipe-identity.ts";

async function main() {
  const force = process.argv.includes("--force");
  const report = await backfillRecipeIdentity({ force });
  console.log(formatRecipeIdentityBackfillReport(report));

  if (report.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Recipe identity backfill failed unexpectedly.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
