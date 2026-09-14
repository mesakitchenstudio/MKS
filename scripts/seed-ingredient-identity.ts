/**
 * Explicit Ingredient + Alias seed from INGREDIENT_IDENTITY_SEED (ING-3).
 *
 * Usage:
 *   npm run ingredient:seed
 *
 * Does NOT run at app boot, build, or Recipe save.
 * Local SQLite seed is allowed for development.
 * Production/operator mode (VERCEL_ENV=production or INGREDIENT_OPERATOR_PRODUCTION=1)
 * requires a real postgres/postgresql DATABASE_URL — VERCEL alone is not enough.
 *
 * Recommended Production order (do not run here without confirmed Postgres target):
 *   migrate deploy → ingredient:seed → ingredient:backfill -- --apply → ingredient:coverage
 */
import { getDb } from "../src/lib/db.ts";
import {
  formatIngredientSeedReport,
  seedIngredientIdentity,
} from "../src/lib/ingredient-index/index.ts";
import {
  assertIngredientOperatorWriteTargetSafe,
  describeDatabaseTarget,
} from "../src/lib/ingredient-index/cli-guard.ts";

async function main() {
  console.log(describeDatabaseTarget());
  console.log("");
  assertIngredientOperatorWriteTargetSafe();

  const db = getDb();
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
