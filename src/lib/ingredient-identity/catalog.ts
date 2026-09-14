import { normalizeIngredientLookupKey } from "./normalize";
import type {
  IngredientAliasRecord,
  IngredientCatalog,
  IngredientIdentityRecord,
  IngredientSeedEntry,
  IngredientSeedValidationIssue,
} from "./types";

function stableSeedId(prefix: string, norm: string): string {
  return `${prefix}:${norm}`;
}

/**
 * Expand curated seed entries into a catalog with norms and stable synthetic ids.
 * Does not write to the database.
 */
export function buildIngredientCatalog(seed: IngredientSeedEntry[]): IngredientCatalog {
  const ingredients: IngredientIdentityRecord[] = [];
  const aliases: IngredientAliasRecord[] = [];

  for (const entry of seed) {
    const name = String(entry.name ?? "").trim();
    if (!name) continue;
    const nameNorm = normalizeIngredientLookupKey(name);
    if (!nameNorm) continue;
    const id = stableSeedId("ing", nameNorm);
    ingredients.push({ id, name, nameNorm });

    const seenAlias = new Set<string>();
    for (const rawAlias of entry.aliases ?? []) {
      const alias = String(rawAlias ?? "").trim();
      if (!alias) continue;
      const aliasNorm = normalizeIngredientLookupKey(alias);
      if (!aliasNorm || seenAlias.has(aliasNorm)) continue;
      // Skip redundant alias identical to the canonical nameNorm.
      if (aliasNorm === nameNorm) continue;
      seenAlias.add(aliasNorm);
      aliases.push({
        ingredientId: id,
        alias,
        aliasNorm,
      });
    }
  }

  return { ingredients, aliases };
}

/**
 * Validate uniqueness invariants for future DB unique constraints.
 * Pure — does not mutate input.
 */
export function validateIngredientSeed(
  seed: IngredientSeedEntry[],
): IngredientSeedValidationIssue[] {
  const issues: IngredientSeedValidationIssue[] = [];
  const catalog = buildIngredientCatalog(seed);

  const nameNormOwners = new Map<string, string>();
  for (const entry of seed) {
    const name = String(entry.name ?? "").trim();
    if (!name) {
      issues.push({ kind: "empty_name", message: "Canonical ingredient name is empty." });
      continue;
    }
    const nameNorm = normalizeIngredientLookupKey(name);
    if (!nameNorm) {
      issues.push({
        kind: "empty_name",
        message: `Canonical name "${name}" normalizes to empty.`,
      });
      continue;
    }
    const existing = nameNormOwners.get(nameNorm);
    if (existing && existing !== name) {
      issues.push({
        kind: "duplicate_name_norm",
        nameNorm,
        message: `Canonical nameNorm "${nameNorm}" shared by "${existing}" and "${name}".`,
      });
    } else {
      nameNormOwners.set(nameNorm, name);
    }
  }

  const aliasNormOwners = new Map<string, string>();
  for (const alias of catalog.aliases) {
    if (!alias.aliasNorm) {
      issues.push({
        kind: "empty_alias",
        message: `Alias "${alias.alias}" normalizes to empty.`,
      });
      continue;
    }
    const ownerId = alias.ingredientId || "";
    const prior = aliasNormOwners.get(alias.aliasNorm);
    if (prior && prior !== ownerId) {
      issues.push({
        kind: "duplicate_alias_norm",
        aliasNorm: alias.aliasNorm,
        message: `Alias norm "${alias.aliasNorm}" maps to more than one canonical ingredient.`,
      });
    } else {
      aliasNormOwners.set(alias.aliasNorm, ownerId);
    }

    const collidingCanonical = catalog.ingredients.find(
      (ing) => ing.nameNorm === alias.aliasNorm && ing.id !== alias.ingredientId,
    );
    if (collidingCanonical) {
      issues.push({
        kind: "alias_collides_with_other_canonical",
        aliasNorm: alias.aliasNorm,
        nameNorm: collidingCanonical.nameNorm,
        message: `Alias norm "${alias.aliasNorm}" collides with canonical "${collidingCanonical.name}".`,
      });
    }
  }

  return issues;
}

export function assertValidIngredientSeed(seed: IngredientSeedEntry[]): void {
  const issues = validateIngredientSeed(seed);
  if (issues.length) {
    throw new Error(
      `Invalid ingredient seed:\n${issues.map((issue) => `- ${issue.message}`).join("\n")}`,
    );
  }
}
