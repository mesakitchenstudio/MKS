const UNICODE_FRACTIONS: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.333, "⅓"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [0.667, "⅔"],
  [0.75, "¾"],
  [0.875, "⅞"],
];

function nearestFraction(value: number) {
  for (const [decimal, symbol] of UNICODE_FRACTIONS) {
    if (Math.abs(value - decimal) < 0.06) return symbol;
  }
  const quarter = Math.round(value * 4) / 4;
  if (quarter > 0 && quarter < 1) {
    return UNICODE_FRACTIONS.find(([d]) => Math.abs(d - quarter) < 0.01)?.[1] ?? null;
  }
  return null;
}

export function formatCulinaryNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return String(value);
  const whole = Math.floor(value);
  const fraction = value - whole;
  if (fraction < 0.04) return String(whole);
  const symbol = nearestFraction(fraction);
  if (symbol) return whole > 0 ? `${whole} ${symbol}` : symbol;
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

export function scaleAmount(amount: string, factor: number): string {
  if (factor === 1) return amount;
  return amount.replace(/(\d+\s*\/\s*\d+|\d+\.\d+|\d+)/g, (match) => {
    const value = match.includes("/")
      ? match.split("/").map(Number).reduce((n, d, i) => (i === 0 ? n : n / d))
      : Number(match);
    if (Number.isNaN(value)) return match;
    return formatCulinaryNumber(value * factor);
  });
}
