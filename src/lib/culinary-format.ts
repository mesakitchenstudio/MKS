/**
 * Canonical culinary amount formatting + serving scaling for Mesa.
 * Presentational only — never mutates Recipe.values.
 *
 * Public API:
 * - formatCulinaryNumber
 * - scaleAmount / scaleIngredientAmount (aliases)
 * - parseIngredientAmount (for tests / Print prep)
 * - clampRecipeServings
 */

/** Absolute tolerance when snapping a fractional part to a culinary fraction. */
export const CULINARY_FRACTION_TOLERANCE = 0.012;

/** Shared serving bounds for recipe page + Cooking Mode. */
export const MIN_RECIPE_SERVINGS = 1;
export const MAX_RECIPE_SERVINGS = 99;

const UNICODE_TO_VALUE: Record<string, number> = {
  "⅛": 0.125,
  "¼": 0.25,
  "⅓": 1 / 3,
  "⅜": 0.375,
  "½": 0.5,
  "⅝": 0.625,
  "⅔": 2 / 3,
  "¾": 0.75,
  "⅞": 0.875,
};

/** Prefer Mesa seed style: mixed numbers as `1½` (no space). */
const VALUE_TO_UNICODE: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
];

const NON_SCALABLE_EXACT = new Set(
  [
    "to taste",
    "as needed",
    "for serving",
    "for finishing",
    "for dusting",
    "optional",
    "a pinch",
    "a handful",
    "one handful",
    "—",
    "-",
    "–",
    "n/a",
    "na",
  ].map((s) => s.toLowerCase()),
);

const MODIFIER_PREFIX =
  /^(about|approximately|approx\.?|scant|heaping)\s+/i;

/** Leading quantity: unicode / ascii mixed / decimal / integer */
const QUANTITY_TOKEN =
  "(?:\\d+\\s*[⅛¼⅓⅜½⅝⅔¾⅞]|[⅛¼⅓⅜½⅝⅔¾⅞]|\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d*\\.\\d+|\\d+)";

const RANGE_SEPARATOR = "\\s*(?:–|-|to)\\s*";

export type ParsedIngredientAmount =
  | { kind: "text"; original: string }
  | {
      kind: "quantity";
      original: string;
      prefix: string;
      value: number;
      suffix: string;
    }
  | {
      kind: "range";
      original: string;
      prefix: string;
      low: number;
      high: number;
      /** Exact separator text including surrounding spaces as captured. */
      separator: string;
      suffix: string;
    };

export function clampRecipeServings(value: number): number {
  if (!Number.isFinite(value)) return MIN_RECIPE_SERVINGS;
  return Math.max(MIN_RECIPE_SERVINGS, Math.min(MAX_RECIPE_SERVINGS, Math.round(value)));
}

function nearestCulinaryFraction(fraction: number): string | null {
  if (fraction <= 0) return null;
  for (const [decimal, symbol] of VALUE_TO_UNICODE) {
    if (Math.abs(fraction - decimal) <= CULINARY_FRACTION_TOLERANCE) return symbol;
  }
  return null;
}

/**
 * Deterministic culinary number formatting.
 * Uses Unicode vulgar fractions (Mesa seed convention: `1½`, `½`).
 * Falls back to short decimals when no culinary fraction is close enough.
 */
export function formatCulinaryNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  if (value < 0) return String(value);

  // Avoid FP noise before fraction snap (e.g. 0.30000000000000004)
  const cleaned = Math.round(value * 1e9) / 1e9;
  const whole = Math.floor(cleaned + 1e-9);
  let fraction = cleaned - whole;
  if (fraction < 0) fraction = 0;
  if (fraction < 1e-9) return String(whole);

  const symbol = nearestCulinaryFraction(fraction);
  if (symbol) {
    return whole > 0 ? `${whole}${symbol}` : symbol;
  }

  // Very small positive remainders after near-integer — treat as whole
  if (fraction < 0.02 && whole > 0) return String(whole);

  const rounded = Math.round(cleaned * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  // Trim trailing zeros without long tails
  return String(rounded);
}

export function parseQuantityToken(raw: string): number | null {
  const token = raw.trim().replace(/\s+/g, " ");
  if (!token) return null;

  // Unicode alone
  if (token.length === 1 && UNICODE_TO_VALUE[token] != null) {
    return UNICODE_TO_VALUE[token]!;
  }

  // Mixed unicode: 1½ / 1 ½
  const mixedUnicode = token.match(/^(\d+)\s*([⅛¼⅓⅜½⅝⅔¾⅞])$/);
  if (mixedUnicode) {
    return Number(mixedUnicode[1]) + UNICODE_TO_VALUE[mixedUnicode[2]!]!;
  }

  // ASCII mixed: 1 1/2
  const mixedAscii = token.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedAscii) {
    const whole = Number(mixedAscii[1]);
    const num = Number(mixedAscii[2]);
    const den = Number(mixedAscii[3]);
    if (!den || !Number.isFinite(whole) || !Number.isFinite(num)) return null;
    return whole + num / den;
  }

  // Simple fraction: 1/2
  const simple = token.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (simple) {
    const num = Number(simple[1]);
    const den = Number(simple[2]);
    if (!den || !Number.isFinite(num)) return null;
    return num / den;
  }

  // Decimal / integer
  if (/^\d*\.\d+$|^\d+$/.test(token)) {
    const n = Number(token);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function isNonScalableAmount(trimmed: string): boolean {
  return NON_SCALABLE_EXACT.has(trimmed.toLowerCase());
}

/**
 * Detect temperatures / dimension-like ranges that should not be treated as yield amounts.
 * e.g. 350-400°F — if present in an amount string, leave unchanged.
 */
function looksLikeTemperatureOrOpaque(text: string): boolean {
  return /\d\s*[-\u2013]\s*\d+\s*\u00B0/.test(text) || /\d+\s*\u00B0\s*[FC]\b/.test(text);
}

/**
 * Packaging with a parenthetical size: "1 can (15 ounces)".
 * Scale only the leading count; leave the parenthetical untouched.
 */
function parsePackagingCount(trimmed: string, original: string): ParsedIngredientAmount | null {
  const match = trimmed.match(new RegExp(`^(${QUANTITY_TOKEN})(\\s+)(\\([^)]*\\)[\\s\\S]*)$`));
  if (!match) return null;
  const value = parseQuantityToken(match[1]!);
  if (value == null) return null;
  // Require that the parenthesis looks like a size, not an editorial aside mid-sentence
  if (!/\(\s*\d/.test(match[3]!)) return null;
  return {
    kind: "quantity",
    original,
    prefix: "",
    value,
    suffix: `${match[2]}${match[3]}`,
  };
}

export function parseIngredientAmount(amount: unknown): ParsedIngredientAmount {
  if (amount == null) return { kind: "text", original: "" };
  const original = typeof amount === "string" ? amount : String(amount);
  const trimmed = original.trim();
  if (!trimmed) return { kind: "text", original };

  if (isNonScalableAmount(trimmed)) {
    return { kind: "text", original };
  }

  if (looksLikeTemperatureOrOpaque(trimmed)) {
    return { kind: "text", original };
  }

  let rest = trimmed;
  let prefix = "";
  const mod = rest.match(MODIFIER_PREFIX);
  if (mod) {
    prefix = mod[0]!;
    rest = rest.slice(mod[0]!.length);
  }

  const packaging = parsePackagingCount(rest, original);
  if (packaging && packaging.kind === "quantity") {
    return { ...packaging, prefix: prefix + packaging.prefix };
  }

  // Range: qty sep qty + optional suffix
  const rangeRe = new RegExp(
    `^(${QUANTITY_TOKEN})(${RANGE_SEPARATOR})(${QUANTITY_TOKEN})(\\b|[\\s\\S]*)$`,
    "i",
  );
  const rangeMatch = rest.match(rangeRe);
  if (rangeMatch) {
    const low = parseQuantityToken(rangeMatch[1]!);
    const high = parseQuantityToken(rangeMatch[3]!);
    if (low != null && high != null && high >= low) {
      const suffix = rangeMatch[4] ?? "";
      // Reject ranges that look like years or odd opaque codes (no unit/text and huge)
      return {
        kind: "range",
        original,
        prefix,
        low,
        high,
        separator: rangeMatch[2]!,
        suffix,
      };
    }
  }

  // Single quantity + optional safe suffix (units, "large", "packed cup", etc.)
  const singleRe = new RegExp(`^(${QUANTITY_TOKEN})(\\b|[\\s\\S]*)$`);
  const single = rest.match(singleRe);
  if (single) {
    const value = parseQuantityToken(single[1]!);
    if (value != null) {
      const suffix = single[2] ?? "";
      // If suffix itself starts with another digit (failed range), don't guess
      if (/^\d/.test(suffix.trim())) {
        return { kind: "text", original };
      }
      return {
        kind: "quantity",
        original,
        prefix,
        value,
        suffix,
      };
    }
  }

  return { kind: "text", original };
}

export function scaleParsedAmount(
  parsed: ParsedIngredientAmount,
  factor: number,
): string {
  if (!Number.isFinite(factor) || factor <= 0) return parsed.original;
  if (factor === 1) return parsed.original;

  if (parsed.kind === "text") return parsed.original;

  if (parsed.kind === "quantity") {
    const scaled = parsed.value * factor;
    // Never collapse a positive amount to zero via formatting
    if (parsed.value > 0 && scaled > 0 && formatCulinaryNumber(scaled) === "0") {
      return parsed.original;
    }
    return `${parsed.prefix}${formatCulinaryNumber(scaled)}${parsed.suffix}`;
  }

  const low = parsed.low * factor;
  const high = parsed.high * factor;
  if (parsed.low > 0 && (low <= 0 || high <= 0)) return parsed.original;
  return `${parsed.prefix}${formatCulinaryNumber(low)}${parsed.separator}${formatCulinaryNumber(high)}${parsed.suffix}`;
}

/**
 * Scale a recipe amount string for display.
 * Unknown / ambiguous amounts are returned unchanged.
 */
export function scaleAmount(amount: string, factor: number): string {
  if (amount == null) return "";
  if (!Number.isFinite(factor) || factor <= 0) return amount;
  if (factor === 1) return amount;
  return scaleParsedAmount(parseIngredientAmount(amount), factor);
}

/** Alias for Print / shared consumers — same implementation as scaleAmount. */
export const scaleIngredientAmount = scaleAmount;
