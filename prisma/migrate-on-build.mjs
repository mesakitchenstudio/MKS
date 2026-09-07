/**
 * Production-only Prisma migrate deploy wrapper.
 * Preview/Development builds must never migrate a shared production database.
 */
import { spawnSync } from "node:child_process";

const envName = process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || "";
const force = process.env.PRISMA_MIGRATE_ON_BUILD === "1";
const isProduction = envName === "production" || force;

if (!isProduction) {
  console.log(
    `[prisma-migrate-on-build] Skipping migrate deploy (VERCEL_ENV=${envName || "unset"}; set PRISMA_MIGRATE_ON_BUILD=1 to force).`,
  );
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["prisma", "migrate", "deploy", "--schema=prisma/schema.production.prisma"],
  { stdio: "inherit", shell: true, env: process.env },
);

process.exit(result.status ?? 1);
