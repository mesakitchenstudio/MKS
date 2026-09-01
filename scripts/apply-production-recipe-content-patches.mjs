import { PrismaClient } from "@prisma/client";
import { parseValues } from "../src/lib/recipe-map.ts";
import {
  applyProductionRecipeContentPatchPlan,
  countAppliedFields,
  patchedProductionRecipeSlugs,
  planProductionRecipeContentPatch,
  summarizePatchPlans,
} from "../src/lib/production-recipe-content-patches.ts";

const dryRun = process.argv.includes("--dry-run");
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

const plans = [];
const updates: { id: string; slug: string; values: Record<string, unknown> }[] = [];

for (const row of rows) {
  const values = parseValues(row.values);
  const plan = planProductionRecipeContentPatch(row.slug, values);
  if (!plan) continue;
  plans.push(plan);

  for (const decision of plan.decisions) {
    console.log(
      JSON.stringify({
        slug: row.slug,
        field: decision.field,
        current: decision.currentValue,
        legacyBaseline: decision.legacyBaseline,
        proposed: decision.proposedValue,
        action: decision.action,
        reason: decision.reason,
      }),
    );
  }

  const merged = applyProductionRecipeContentPatchPlan(values, plan);
  const changed = plan.decisions.some((d) => d.action === "APPLY");
  if (changed) {
    updates.push({ id: row.id, slug: row.slug, values: merged });
  }
}

const summary = summarizePatchPlans(plans);
    if (!dryRun && updates.length > 0) {
  await prisma.$transaction(
    updates.map((row) =>
      prisma.recipe.update({
        where: { id: row.id },
        data: { values: JSON.stringify(row.values) },
      }),
    ),
  );
}

if (!dryRun) {
  summary.fieldsApplied = countAppliedFields(plans);
}

console.log(
  JSON.stringify({
    mode: dryRun ? "dry-run" : "apply",
    recipesInspected: summary.recipesInspected,
    fieldsProposed: summary.fieldsProposed,
    fieldsApplied: summary.fieldsApplied,
    fieldsAlreadyCorrect: summary.fieldsAlreadyCorrect,
    fieldsSkipped: summary.fieldsSkipped,
    fieldsConflict: summary.fieldsConflict,
    recipesUpdated: dryRun ? 0 : updates.length,
  }),
);

await prisma.$disconnect();
