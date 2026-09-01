import { PrismaClient } from "@prisma/client";
import { parseValues } from "../src/lib/recipe-map.ts";
import {
  mergeProductionRecipeContentPatches,
  patchedProductionRecipeSlugs,
} from "../src/lib/production-recipe-content-patches.ts";

const url = process.env.DATABASE_URL?.trim();
if (!url?.startsWith("postgres")) {
  console.error(
    "DATABASE_URL must be postgres:// for this script. For local SQLite use scripts/apply-production-recipe-content-patches.py",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
const slugs = patchedProductionRecipeSlugs();
const rows = await prisma.recipe.findMany({
  where: { slug: { in: slugs }, status: "published" },
  select: { id: true, slug: true, values: true },
});

let updated = 0;
for (const row of rows) {
  const values = parseValues(row.values);
  const merged = mergeProductionRecipeContentPatches(row.slug, values);
  await prisma.recipe.update({
    where: { id: row.id },
    data: { values: JSON.stringify(merged) },
  });
  updated += 1;
  console.log(`patched ${row.slug}`);
}

console.log(`updated ${updated} published recipes`);
await prisma.$disconnect();
