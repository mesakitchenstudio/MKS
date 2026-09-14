/**
 * Explicit Ingredient + Alias seed from INGREDIENT_IDENTITY_SEED (ING-3).
 *
 * Usage:
 *   npm run ingredient:seed
 *
 * Does NOT run at app boot, build, or Recipe save.
 * Does NOT connect to Production Neon from this workspace by default —
 * getDb() uses local SQLite unless VERCEL is set.
 *
 * Recommended Production order (do not run here):
 *   migrate deploy → ingredient:seed → ingredient:backfill -- --apply → ingredient:coverage
 */
import { getDb } from "../src/lib/db.ts";
import {
  formatIngredientSeedReport,
  seedIngredientIdentity,
} from "../src/lib/ingredient-index/index.ts";
import { describeDatabaseTarget } from "../src/lib/ingredient-index/cli-guard.ts";

async function main() {
  const db = getDb();
  console.log(describeDatabaseTarget());
  console.log("");

  const report = await seedIngredientIdentity(db);
  console.log(formatIngredientSeedReport(report));

  if (report.status === "FAILED") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Ingredient seed failed unexpectedly.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
