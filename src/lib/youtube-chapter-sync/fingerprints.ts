import { createHash } from "node:crypto";
import type { InstructionGroupWithChapters } from "@/lib/instruction-chapters";
import { hasCanonicalStartTimestamp } from "@/lib/instruction-chapters";
import type { YoutubeChapterExportItem } from "@/lib/youtube-chapter-sync/types";

/** Fingerprint of canonical chapter fields only (for sync stale detection). */
export function canonicalChapterFingerprint(groups: InstructionGroupWithChapters[]): string {
  const payload = groups
    .map((group, index) => {
      const name = String(group.name ?? "").trim();
      const label = String(group.chapterLabel ?? "").trim();
      const start = hasCanonicalStartTimestamp(group) ? String(group.startTimestamp) : "";
      const end =
        typeof group.endTimestamp === "number" && group.endTimestamp >= 0
          ? String(group.endTimestamp)
          : "";
      return `${index}|${name}|${label}|${start}|${end}`;
    })
    .join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function descriptionContentHash(description: string): string {
  return createHash("sha256").update(description).digest("hex").slice(0, 32);
}

export function chapterBlockHash(block: string): string {
  if (!block) return "";
  return createHash("sha256").update(block).digest("hex").slice(0, 24);
}

/** Deterministic fingerprint of the export used for preview/apply reconciliation. */
export function youtubeExportFingerprint(
  introLabel: string,
  items: YoutubeChapterExportItem[],
): string {
  const payload = [
    introLabel.trim(),
    ...items.map(
      (item) =>
        `${item.timestamp}|${item.label.trim()}|${item.source}|${item.instructionIndex ?? ""}`,
    ),
  ].join("\n");
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}
