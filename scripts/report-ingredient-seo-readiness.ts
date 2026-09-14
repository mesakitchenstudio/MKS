/**
 * Read-only Ingredient SEO readiness report (ING-8).
 *
 * Usage:
 *   npm run ingredient:seo-readiness
 *
 * Target banner is scheme-based (file: = SQLite; postgres = PostgreSQL).
 * VERCEL alone does not imply Production Postgres. No writes.
 */
import { getDb } from "../src/lib/db.ts";
import { describeDatabaseTarget } from "../src/lib/ingredient-index/cli-guard.ts";
import {
  formatIngredientSeoReadinessReport,
  reportIngredientSeoReadiness,
} from "../src/lib/ingredient-seo.ts";

async function main() {
  const db = getDb();
  console.log(describeDatabaseTarget());
  console.log("");

  const rows = await reportIngredientSeoReadiness(db);
  console.log(formatIngredientSeoReadinessReport(rows));
}

main().catch((error) => {
  console.error("Ingredient SEO readiness report failed unexpectedly.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
