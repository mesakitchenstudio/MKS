import type { RecipeYoutubeTimestamp } from "@/data/youtube-types";
import { formatClock } from "@/lib/recipe-stage-video-help";
import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";

export const MESA_CHAPTER_BLOCK_START = "<!-- mesa-chapters:start -->";
export const MESA_CHAPTER_BLOCK_END = "<!-- mesa-chapters:end -->";

/**
 * YouTube description chapter sync helpers.
 * Does NOT call the YouTube API — preview/diff only until write OAuth is enabled.
 */

export function youtubeChapterSyncEnabled() {
  return process.env.YOUTUBE_CHAPTER_SYNC_ENABLED === "true";
}

export function formatYoutubeChapterBlock(chapters: RecipeYoutubeTimestamp[]) {
  const lines = chapters
    .filter((row) => row.label.trim() && row.time >= 0)
    .sort((a, b) => a.time - b.time)
    .map((row) => `${formatClock(row.time)} ${row.label.trim()}`);
  if (!lines.length) return "";
  return [MESA_CHAPTER_BLOCK_START, ...lines, MESA_CHAPTER_BLOCK_END].join("\n");
}

/** Strip Mesa-managed blocks and any leading native timestamp chapter list. */
export function stripManagedChapterBlocks(description: string) {
  let next = description.replace(
    new RegExp(`${escapeRegExp(MESA_CHAPTER_BLOCK_START)}[\\s\\S]*?${escapeRegExp(MESA_CHAPTER_BLOCK_END)}\\s*`, "g"),
    "",
  );

  const lines = next.split(/\r?\n/);
  const kept: string[] = [];
  let skippingChapterRun = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const isChapterLine = Boolean(
      trimmed.match(/^(\d{1,2}(?::\d{2}){1,2})\s+.+/) ||
        trimmed.match(/^\[(\d{1,2}(?::\d{2}){1,2})\]\s+.+/),
    );
    if (isChapterLine) {
      skippingChapterRun = true;
      continue;
    }
    if (skippingChapterRun && !trimmed) {
      continue;
    }
    skippingChapterRun = false;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function buildYoutubeDescriptionChapterPreview(input: {
  currentDescription: string;
  chapters: RecipeYoutubeTimestamp[];
}) {
  const body = stripManagedChapterBlocks(input.currentDescription);
  const block = formatYoutubeChapterBlock(input.chapters);
  const nextDescription = block ? `${body}\n\n${block}`.trim() : body;
  const currentChapters = parseYoutubeDescriptionChapters(input.currentDescription).map((row) => ({
    time: row.time,
    label: row.label,
  }));

  return {
    currentDescription: input.currentDescription,
    nextDescription,
    bodyPreserved: body,
    chapterBlock: block,
    currentChapterCount: currentChapters.length,
    nextChapterCount: input.chapters.length,
    wouldChange: nextDescription !== input.currentDescription.trim(),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
