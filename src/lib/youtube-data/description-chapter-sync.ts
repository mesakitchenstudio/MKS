import type { RecipeYoutubeTimestamp } from "@/data/youtube-types";
import {
  formatYoutubeChapterBlock as formatExportChapterBlock,
  buildYoutubeChapterExport,
} from "@/lib/youtube-chapter-sync/export";
import {
  buildDescriptionPatchPlan,
  detectChapterBlocks,
  LEGACY_MESA_BLOCK_END,
  LEGACY_MESA_BLOCK_START,
} from "@/lib/youtube-chapter-sync/description-patch";
import { youtubeChapterSyncEnabled } from "@/lib/youtube-chapter-sync/sync-metadata";

export {
  LEGACY_MESA_BLOCK_START as MESA_CHAPTER_BLOCK_START,
  LEGACY_MESA_BLOCK_END as MESA_CHAPTER_BLOCK_END,
} from "@/lib/youtube-chapter-sync/description-patch";

/** @deprecated Use `youtubeChapterSyncEnabled` from sync-metadata. */
export { youtubeChapterSyncEnabled };

/**
 * Legacy preview helper — no HTML markers in PR6 exports.
 */
export function formatYoutubeChapterBlockFromTimestamps(chapters: RecipeYoutubeTimestamp[]) {
  const items = chapters
    .filter((row) => row.label.trim() && row.time >= 0)
    .sort((a, b) => a.time - b.time)
    .map((row) => ({
      timestamp: row.time,
      label: row.label.trim(),
      source: "mesa_section" as const,
    }));
  return formatExportChapterBlock(items);
}

/** @deprecated Use formatYoutubeChapterBlockFromTimestamps */
export function formatYoutubeChapterBlock(chapters: RecipeYoutubeTimestamp[]) {
  return formatYoutubeChapterBlockFromTimestamps(chapters);
}

/** Strip legacy Mesa HTML blocks and leading native chapter runs (read paths only). */
export function stripManagedChapterBlocks(description: string) {
  const next = description.replace(
    new RegExp(
      `${escapeRegExp(LEGACY_MESA_BLOCK_START)}[\\s\\S]*?${escapeRegExp(LEGACY_MESA_BLOCK_END)}\\s*`,
      "g",
    ),
    "",
  );

  const blocks = detectChapterBlocks(next);
  if (!blocks.length) return next.trim();

  let result = next;
  for (const block of [...blocks].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, block.start) + result.slice(block.end);
  }
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildYoutubeDescriptionChapterPreview(input: {
  currentDescription: string;
  chapters: RecipeYoutubeTimestamp[];
  videoId?: string;
}) {
  const exportResult = buildYoutubeChapterExport({
    videoId: input.videoId ?? "preview",
    instructions: input.chapters.map((chapter) => ({
      name: chapter.label,
      steps: [""],
      startTimestamp: chapter.time,
      chapterLabel: chapter.label,
    })),
  });

  const patch = buildDescriptionPatchPlan({
    currentDescription: input.currentDescription,
    exportItems: exportResult.items,
  });

  return {
    currentDescription: input.currentDescription,
    nextDescription: patch.proposedDescription,
    bodyPreserved: stripManagedChapterBlocks(input.currentDescription),
    chapterBlock: patch.generatedChapterBlock,
    currentChapterCount: input.chapters.length,
    nextChapterCount: exportResult.items.length,
    wouldChange: patch.proposedDescription !== input.currentDescription.trim(),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
