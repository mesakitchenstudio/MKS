export { normalizeIngredientLookupKey } from "./normalize";
export {
  buildIngredientCatalog,
  validateIngredientSeed,
  assertValidIngredientSeed,
} from "./catalog";
export { matchIngredientIdentity, matchIngredientIdentityAgainstCatalog } from "./match";
export { INGREDIENT_IDENTITY_SEED } from "./seed";
export {
  analyzeIngredientCorpus,
  collectAuthoredIngredientOccurrences,
  formatIngredientCorpusReport,
  type CorpusRecipeLike,
} from "./corpus";
export {
  buildIngredientCreateFields,
  ingredientSlugFromName,
  INGREDIENT_MATCH_VIA,
  isIngredientMatchVia,
  type IngredientMatchVia,
} from "./persistence";
export type {
  AuthoredIngredientOccurrence,
  IngredientAliasRecord,
  IngredientCatalog,
  IngredientCorpusReport,
  IngredientIdentityRecord,
  IngredientMatchResult,
  IngredientMatchStatus,
  IngredientSeedEntry,
  IngredientSeedValidationIssue,
} from "./types";
