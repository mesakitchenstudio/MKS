/**
 * Shopping List quantity normalization (ING-7).
 * Reuses culinary-format primitives; does not redesign scaleAmount.
 */

import {
  formatCulinaryNumber,
  parseIngredientAmount,
  parseQuantityToken,
} from "@/lib/culinary-format";

export type ShoppingCanonicalUnit =
  | "g"
  | "kg"
  | "ml"
  | "l"
  | "tsp"
  | "tbsp"
  | "cup"
  | "oz"
  | "lb"
  | "count";

const UNIT_ALIASES: Record<string, ShoppingCanonicalUnit> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tbs: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cup",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  pound: "lb",
  pounds: "lb",
};

export type ShoppingParsedQuantity =
  | {
      kind: "aggregatable";
      value: number;
      unit: ShoppingCanonicalUnit;
      /** Exact package parenthetical when present, e.g. "(15 ounces)". */
      packageDetail?: string;
      prefix: string;
    }
  | {
      kind: "nonnumeric";
      text: string;
    }
  | {
      kind: "nonaggregatable";
      reason: "range" | "unknown_unit" | "opaque";
      original: string;
    };

function normalizeUnitToken(raw: string): ShoppingCanonicalUnit | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  if (!key) return "count";
  return UNIT_ALIASES[key] ?? null;
}

/**
 * Split a quantity suffix into optional unit + optional package detail.
 * Examples:
 * - " g" → unit g
 * - " cups" → unit cup
 * - " can (15 ounces)" → unknown unit "can" → nonaggregatable unless we treat package specially
 * - " (15 ounces) tomatoes leftover" handled via parseIngredientAmount packaging path
 */
function parseUnitAndPackage(suffix: string): {
  unit: ShoppingCanonicalUnit | null;
  packageDetail?: string;
  unknownUnit?: string;
} {
  const trimmed = suffix.trim();
  if (!trimmed) return { unit: "count" };

  const packageMatch = trimmed.match(/^([^(]*?)\s*(\([^)]+\))\s*$/);
  if (packageMatch) {
    const before = packageMatch[1]!.trim();
    const detail = packageMatch[2]!.replace(/\s+/g, " ").toLowerCase();
    const unitToken = before.replace(/\s+/g, " ").toLowerCase();
    // "can (15 ounces)" — unit token is packaging noun, not a mass/volume unit
    if (unitToken && !normalizeUnitToken(unitToken)) {
      return { unit: "count", packageDetail: detail, unknownUnit: unitToken };
    }
    const unit = normalizeUnitToken(unitToken);
    if (unit) return { unit, packageDetail: detail };
    return { unit: null, packageDetail: detail, unknownUnit: unitToken || undefined };
  }

  // Bare unit word(s) at start of suffix (ignore trailing descriptive words after unit)
  const unitWord = trimmed.match(/^([a-zA-Z]+)\b/);
  if (unitWord) {
    const unit = normalizeUnitToken(unitWord[1]!);
    if (unit) {
      const rest = trimmed.slice(unitWord[0]!.length).trim();
      // Trailing descriptors after a known unit ("packed", "large") → treat as opaque for merge
      if (rest && !/^\([^)]+\)$/.test(rest)) {
        return { unit: null, unknownUnit: trimmed };
      }
      const pkg = rest.match(/^\(([^)]+)\)$/);
      return {
        unit,
        packageDetail: pkg ? `(${pkg[1]!.replace(/\s+/g, " ").toLowerCase()})` : undefined,
      };
    }
    return { unit: null, unknownUnit: unitWord[1] };
  }

  return { unit: null, unknownUnit: trimmed };
}

export function parseShoppingQuantity(amountText: string): ShoppingParsedQuantity {
  const original = String(amountText ?? "").trim();
  if (!original) return { kind: "nonaggregatable", reason: "opaque", original: "" };

  const parsed = parseIngredientAmount(original);
  if (parsed.kind === "text") {
    return { kind: "nonnumeric", text: original.toLowerCase().replace(/\s+/g, " ") };
  }
  if (parsed.kind === "range") {
    return { kind: "nonaggregatable", reason: "range", original };
  }

  const { unit, packageDetail, unknownUnit } = parseUnitAndPackage(parsed.suffix);
  // Packaging counts like "1 can (15 ounces)" — unknownUnit is "can"/etc., unit forced count
  if (packageDetail && unknownUnit) {
    return {
      kind: "aggregatable",
      value: parsed.value,
      unit: "count",
      packageDetail,
      prefix: parsed.prefix.trim(),
    };
  }
  if (unit == null) {
    return { kind: "nonaggregatable", reason: "unknown_unit", original };
  }
  if (parsed.prefix.trim()) {
    // "about 2 cups" — keep separate; modifiers make merge ambiguous
    return { kind: "nonaggregatable", reason: "opaque", original };
  }

  return {
    kind: "aggregatable",
    value: parsed.value,
    unit,
    packageDetail,
    prefix: "",
  };
}

type Dimension = "mass" | "volume" | "tsp" | "tbsp" | "cup" | "oz" | "lb" | "count";

function dimensionOf(unit: ShoppingCanonicalUnit): Dimension {
  if (unit === "g" || unit === "kg") return "mass";
  if (unit === "ml" || unit === "l") return "volume";
  return unit;
}

/** Convert to aggregation base: g, ml, or same unit. */
export function toAggregationBase(
  value: number,
  unit: ShoppingCanonicalUnit,
): { value: number; base: ShoppingCanonicalUnit } | null {
  if (unit === "kg") return { value: value * 1000, base: "g" };
  if (unit === "l") return { value: value * 1000, base: "ml" };
  if (unit === "g") return { value, base: "g" };
  if (unit === "ml") return { value, base: "ml" };
  return { value, base: unit };
}

export function quantitiesCompatible(
  a: Extract<ShoppingParsedQuantity, { kind: "aggregatable" }>,
  b: Extract<ShoppingParsedQuantity, { kind: "aggregatable" }>,
): boolean {
  if ((a.packageDetail || "") !== (b.packageDetail || "")) return false;
  if (dimensionOf(a.unit) !== dimensionOf(b.unit)) return false;
  // count with package vs count without are different (already packageDetail check)
  return true;
}

export function sumCompatibleQuantities(
  items: Array<Extract<ShoppingParsedQuantity, { kind: "aggregatable" }>>,
): Extract<ShoppingParsedQuantity, { kind: "aggregatable" }> | null {
  if (!items.length) return null;
  const first = items[0]!;
  for (let i = 1; i < items.length; i += 1) {
    if (!quantitiesCompatible(first, items[i]!)) return null;
  }
  let sum = 0;
  let base: ShoppingCanonicalUnit | null = null;
  for (const item of items) {
    const converted = toAggregationBase(item.value, item.unit);
    if (!converted) return null;
    if (base == null) base = converted.base;
    else if (base !== converted.base) return null;
    sum += converted.value;
  }
  if (base == null || !Number.isFinite(sum)) return null;
  return {
    kind: "aggregatable",
    value: sum,
    unit: base,
    packageDetail: first.packageDetail,
    prefix: "",
  };
}

const PLURAL_UNITS: Partial<Record<ShoppingCanonicalUnit, { one: string; other: string }>> = {
  g: { one: "g", other: "g" },
  kg: { one: "kg", other: "kg" },
  ml: { one: "ml", other: "ml" },
  l: { one: "l", other: "l" },
  tsp: { one: "tsp", other: "tsp" },
  tbsp: { one: "tbsp", other: "tbsp" },
  cup: { one: "cup", other: "cups" },
  oz: { one: "oz", other: "oz" },
  lb: { one: "lb", other: "lb" },
};

/**
 * Metric display preference:
 * - mass base g: use kg when value ≥ 1000 and divides evenly by 100 (readable tenths), else g
 * - volume base ml: same for l
 */
export function formatShoppingQuantity(
  qty: Extract<ShoppingParsedQuantity, { kind: "aggregatable" }>,
): string {
  let value = qty.value;
  let unit = qty.unit;

  if (unit === "g" && value >= 1000) {
    const asKg = value / 1000;
    // Prefer kg when clean to one culinary-friendly decimal (or whole)
    const formatted = formatCulinaryNumber(asKg);
    const back = parseQuantityToken(formatted.replace(/[^\d./⅛¼⅓⅜½⅝⅔¾⅞]/g, "")) ?? asKg;
    if (Math.abs(back * 1000 - value) < 1e-6) {
      value = asKg;
      unit = "kg";
    }
  }
  if (unit === "ml" && value >= 1000) {
    const asL = value / 1000;
    const formatted = formatCulinaryNumber(asL);
    const back = parseQuantityToken(formatted.replace(/[^\d./⅛¼⅓⅜½⅝⅔¾⅞]/g, "")) ?? asL;
    if (Math.abs(back * 1000 - value) < 1e-6) {
      value = asL;
      unit = "l";
    }
  }

  const numberText = formatCulinaryNumber(value);
  if (unit === "count") {
    if (qty.packageDetail) {
      const noun = value === 1 ? "can" : "cans";
      // Preserve package detail; assume can-style for parenthetical packages
      const detail = qty.packageDetail;
      // Reconstruct generic package noun from common pattern — use "package" free text from detail only
      // Spec examples use "cans" — we detect via prior unknown packaging by storing packageDetail only.
      // Display: "{n} {detail}" is wrong; prefer "{n} cans {detail}" when detail looks like size.
      return `${numberText} ${noun} ${detail}`.replace(/\s+/g, " ").trim();
    }
    return numberText;
  }

  const labels = PLURAL_UNITS[unit];
  const unitLabel = labels ? (value === 1 ? labels.one : labels.other) : unit;
  if (qty.packageDetail) {
    return `${numberText} ${unitLabel} ${qty.packageDetail}`.replace(/\s+/g, " ").trim();
  }
  return `${numberText} ${unitLabel}`.replace(/\s+/g, " ").trim();
}

/**
 * Format package-count aggregations when we know the packaging noun from originals.
 * Fallback helper used by aggregate when packageDetail is set.
 */
export function formatPackageCount(
  value: number,
  packageDetail: string,
  sampleOriginal?: string,
): string {
  const numberText = formatCulinaryNumber(value);
  const detail = packageDetail.replace(/\s+/g, " ").trim();
  const sample = String(sampleOriginal ?? "").toLowerCase();
  let noun = "package";
  if (/\bcan\b/.test(sample)) noun = value === 1 ? "can" : "cans";
  else if (/\bjars?\b/.test(sample)) noun = value === 1 ? "jar" : "jars";
  else if (/\bbox(?:es)?\b/.test(sample)) noun = value === 1 ? "box" : "boxes";
  else noun = value === 1 ? "package" : "packages";
  return `${numberText} ${noun} ${detail}`.replace(/\s+/g, " ").trim();
}
