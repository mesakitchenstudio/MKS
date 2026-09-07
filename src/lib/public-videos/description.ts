/**
 * Derive a concise, viewer-safe supporting line from a synced YouTube description.
 * Escaped as plain text by callers — never treat as HTML.
 * Returns undefined when the description is too thin or mostly noise.
 */
export function summarizePublicVideoDescription(
  raw?: string | null,
  maxLength = 180,
): string | undefined {
  const source = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!source) return undefined;

  const text = source
    // Strip URLs
    .replace(/https?:\/\/\S+/gi, " ")
    // Strip common www links without scheme
    .replace(/\bwww\.\S+/gi, " ")
    // Strip timestamp chapter lines (0:00 Intro)
    .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s+.+$/gm, "")
    // Strip hashtags
    .replace(/#\w+/g, " ")
    // Strip leftover dense symbol noise
    .replace(/[|•·]+/g, " ");

  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12);

  const candidate =
    paragraphs.find((line) => line.length >= 40) ??
    paragraphs.find((line) => line.length >= 24) ??
    null;

  if (!candidate) return undefined;

  // Reject lines that are mostly punctuation / leftovers after stripping
  const letters = (candidate.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  if (letters < 18) return undefined;

  if (candidate.length <= maxLength) return candidate;

  const sliced = candidate.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const trimmed = (lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim();
  if (trimmed.length < 24) return undefined;
  return `${trimmed.replace(/[.,;:!\-–—]+$/, "")}…`;
}
