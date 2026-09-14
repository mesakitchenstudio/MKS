import type { Prisma } from "@prisma/client";
import type { getDb } from "@/lib/db";
import {
  assertValidIngredientSeed,
  buildIngredientCreateFields,
  INGREDIENT_IDENTITY_SEED,
  normalizeIngredientLookupKey,
  type IngredientSeedEntry,
} from "@/lib/ingredient-identity";
import type { IngredientSeedReport } from "./types";

type DbClient = Prisma.TransactionClient | ReturnType<typeof getDb>;

/**
 * Idempotent curated Ingredient + Alias persistence.
 * Never remaps an alias owned by another Ingredient.
 * Does not run at app boot.
 */
export async function seedIngredientIdentity(
  db: DbClient,
  seed: IngredientSeedEntry[] = INGREDIENT_IDENTITY_SEED,
): Promise<IngredientSeedReport> {
  assertValidIngredientSeed(seed);

  const report: IngredientSeedReport = {
    status: "SUCCESS",
    ingredientsCreated: 0,
    ingredientsExisting: 0,
    aliasesCreated: 0,
    aliasesExisting: 0,
    failures: [],
  };

  for (const entry of seed) {
    const fields = buildIngredientCreateFields(entry.name);
    if (!fields.nameNorm) {
      report.status = "FAILED";
      report.failures.push(`Empty nameNorm for "${entry.name}".`);
      continue;
    }

    let ingredient = await db.ingredient.findUnique({
      where: { nameNorm: fields.nameNorm },
    });

    if (!ingredient) {
      const slugTaken = await db.ingredient.findUnique({ where: { slug: fields.slug } });
      if (slugTaken) {
        report.status = "FAILED";
        report.failures.push(
          `Slug "${fields.slug}" already belongs to "${slugTaken.name}" (nameNorm=${slugTaken.nameNorm}); cannot create "${fields.name}".`,
        );
        continue;
      }
      ingredient = await db.ingredient.create({
        data: {
          name: fields.name,
          nameNorm: fields.nameNorm,
          slug: fields.slug,
        },
      });
      report.ingredientsCreated += 1;
    } else {
      report.ingredientsExisting += 1;
      // Do not mutate slug. Name display drift is allowed only if same nameNorm.
      if (ingredient.nameNorm !== fields.nameNorm) {
        report.status = "FAILED";
        report.failures.push(
          `Existing Ingredient id=${ingredient.id} nameNorm mismatch for "${fields.name}".`,
        );
        continue;
      }
    }

    const seenAlias = new Set<string>();
    for (const rawAlias of entry.aliases ?? []) {
      const alias = String(rawAlias ?? "").trim();
      if (!alias) continue;
      const aliasNorm = normalizeIngredientLookupKey(alias);
      if (!aliasNorm || seenAlias.has(aliasNorm)) continue;
      seenAlias.add(aliasNorm);
      if (aliasNorm === fields.nameNorm) continue;

      const existingAlias = await db.ingredientAlias.findUnique({
        where: { aliasNorm },
      });
      if (!existingAlias) {
        await db.ingredientAlias.create({
          data: {
            ingredientId: ingredient.id,
            alias,
            aliasNorm,
          },
        });
        report.aliasesCreated += 1;
        continue;
      }

      if (existingAlias.ingredientId !== ingredient.id) {
        report.status = "FAILED";
        report.failures.push(
          `Alias norm "${aliasNorm}" already belongs to Ingredient ${existingAlias.ingredientId}; refused to remap to ${ingredient.id} ("${fields.name}").`,
        );
        continue;
      }
      report.aliasesExisting += 1;
    }
  }

  if (report.failures.length) {
    report.status = "FAILED";
  }
  return report;
}

export function formatIngredientSeedReport(report: IngredientSeedReport): string {
  const lines = [
    "Ingredient identity seed",
    "",
    `Status:               ${report.status}`,
    `Ingredients created:  ${String(report.ingredientsCreated).padStart(6)}`,
    `Ingredients existing: ${String(report.ingredientsExisting).padStart(6)}`,
    `Aliases created:      ${String(report.aliasesCreated).padStart(6)}`,
    `Aliases existing:     ${String(report.aliasesExisting).padStart(6)}`,
  ];
  if (report.failures.length) {
    lines.push("", "Failures:");
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return lines.join("\n");
}
