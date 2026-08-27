/** Editorial sentence case for video display titles (not recipe route names). */
export function toDisplayTitle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
