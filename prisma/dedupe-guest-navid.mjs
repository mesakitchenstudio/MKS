/**
 * Production builds apply `navId @unique` on GuestPageView.
 * Clear duplicate navIds (keep oldest row) so `prisma db push` can succeed.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  const result = await db.$executeRawUnsafe(`
    UPDATE "GuestPageView" AS g
    SET "navId" = NULL
    WHERE g."navId" IS NOT NULL
      AND g.id IN (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY "navId"
              ORDER BY "createdAt" ASC, id ASC
            ) AS rn
          FROM "GuestPageView"
          WHERE "navId" IS NOT NULL
        ) ranked
        WHERE rn > 1
      )
  `);
  if (result > 0) {
    console.log(`Cleared ${result} duplicate GuestPageView.navId value(s).`);
  }
} catch (error) {
  // Table may not exist yet on a fresh database — db push will create it.
  console.warn("Could not dedupe GuestPageView.navId (continuing):", error);
} finally {
  await db.$disconnect();
}
