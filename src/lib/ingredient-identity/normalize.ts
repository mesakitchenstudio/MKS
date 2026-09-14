/**
 * Deterministic lookup-key normalizer for ingredient identity matching.
 *
 * Conservative: no stemming, no plural stripping, no adjective removal,
 * no fuzzy/substring matching. Plural variants belong in explicit aliases.
 */

export function normalizeIngredientLookupKey(input: string): string {
  let value = String(input ?? "")
    .normalize("NFKC")
    .toLowerCase()
    // Typographic apostrophes / primes → ASCII apostrophe
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    // Typographic dashes → hyphen
    .replace(/[\u2013\u2014\u2212]/g, "-")
    // Soft hyphen / zero-width noise
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "")
    // Keep letters, numbers, spaces, apostrophe, hyphen, period (e.g. approx.)
    .replace(/[^\p{L}\p{N}\s'+.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip harmless surrounding punctuation only (preserve internal hyphens).
  value = value.replace(/^['".+-]+|['".+-]+$/g, "").trim();

  return value;
}
