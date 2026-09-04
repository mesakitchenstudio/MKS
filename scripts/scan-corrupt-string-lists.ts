/**
 * READ-ONLY scan for corrupt plain-list values in Recipe.values.
 * Does not mutate the database.
 *
 * Usage: npx tsx scripts/scan-corrupt-string-lists.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  coerceStringListItem,
  isStringListCorruptSentinel,
  STRING_LIST_CORRUPT_SENTINEL,
} from "../src/lib/coerce-string-list.ts";

const TARGET_KEYS = ["utensils", "notes", "tips"] as const;

type CorruptCategory = "object_array" | "literal_sentinel" | "mixed_list";

type Finding = {
  recipeId: string;
  slug: string;
  title: string;
  field: (typeof TARGET_KEYS)[number];
  category: CorruptCategory;
  corruptEntryCount: number;
};

function parseValues(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function classifyList(value: unknown): { category: CorruptCategory; corruptEntryCount: number } | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  let sentinel = 0;
  let objects = 0;
  let recoverable = 0;

  for (const item of value) {
    if (typeof item === "string") {
      if (isStringListCorruptSentinel(item)) sentinel += 1;
      continue;
    }
    if (item && typeof item === "object") {
      objects += 1;
      if (coerceStringListItem(item)) recoverable += 1;
    }
  }

  const corruptEntryCount = sentinel + objects;
  if (corruptEntryCount === 0) return null;

  const hasCleanString = value.some(
    (item) => typeof item === "string" && item.trim() && !isStringListCorruptSentinel(item),
  );

  let category: CorruptCategory;
  if (sentinel > 0 && objects > 0) category = "mixed_list";
  else if (sentinel > 0 && (hasCleanString || objects === 0)) {
    category = hasCleanString || objects > 0 ? "mixed_list" : "literal_sentinel";
  } else if (objects > 0 && (hasCleanString || sentinel > 0)) category = "mixed_list";
  else if (objects > 0) category = "object_array";
  else category = "literal_sentinel";

  // Refine: only sentinels
  if (sentinel > 0 && objects === 0) category = hasCleanString ? "mixed_list" : "literal_sentinel";
  if (objects > 0 && sentinel === 0) category = hasCleanString ? "mixed_list" : "object_array";
  if (sentinel > 0 && objects > 0) category = "mixed_list";

  void recoverable;
  return { category, corruptEntryCount };
}

async function main() {
  const db = new PrismaClient();
  const findings: Finding[] = [];

  try {
    const recipes = await db.recipe.findMany({
      select: { id: true, slug: true, title: true, values: true },
      orderBy: { updatedAt: "desc" },
    });

    for (const recipe of recipes) {
      const values = parseValues(recipe.values);
      for (const field of TARGET_KEYS) {
        const classified = classifyList(values[field]);
        if (!classified) continue;
        findings.push({
          recipeId: recipe.id,
          slug: recipe.slug,
          title: recipe.title,
          field,
          category: classified.category,
          corruptEntryCount: classified.corruptEntryCount,
        });
      }
    }

    const affectedIds = new Set(findings.map((row) => row.recipeId));
    console.log(
      JSON.stringify(
        {
          scanned: recipes.length,
          affectedRecipes: affectedIds.size,
          findings: findings.length,
          byField: Object.fromEntries(
            TARGET_KEYS.map((field) => [field, findings.filter((row) => row.field === field).length]),
          ),
          sentinel: STRING_LIST_CORRUPT_SENTINEL,
          rows: findings.map((row) => ({
            id: row.recipeId,
            slug: row.slug,
            field: row.field,
            category: row.category,
            corruptEntryCount: row.corruptEntryCount,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
