/**
 * Safe DB target description for ingredient operator CLIs.
 * Never prints credentials or full DATABASE_URL.
 *
 * Classification is based on DATABASE_URL scheme (see `@/lib/db-target`).
 * VERCEL alone must never imply Production Postgres.
 */
export {
  assertIngredientOperatorWriteTargetSafe,
  assertProductionOperatorDatabaseUrl,
  classifyDatabaseUrl,
  describeDatabaseTarget,
  getDatabaseTargetInfo,
  isIngredientOperatorProductionMode,
  resolveOperatorDatabaseUrl,
  type DatabaseProvider,
  type DatabaseTargetInfo,
} from "@/lib/db-target";