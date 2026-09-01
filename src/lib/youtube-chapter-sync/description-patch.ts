import { parseYoutubeDescriptionChapters } from "@/lib/youtube-description";
import type {
  ChapterBlockReplacementStrategy,
  DetectedChapterBlock,
} from "@/lib/youtube-chapter-sync/types";
import { formatYoutubeChapterBlock } from "@/lib/youtube-chapter-sync/export";
import type { YoutubeChapterExportItem } from "@/lib/youtube-chapter-sync/types";
import { utf8ByteLength, YOUTUBE_DESCRIPTION_BYTE_LIMIT } from "@/lib/youtube-chapter-sync/utf8-bytes";

const CHAPTER_LINE =
  /^(\d{1,2}(?::\d{2}){1,2})\s*[-–—:]?\s+(.+)$/;

function isChapterLine(line: string): boolean {
  const trimmed = line
    .trim()
    .replace(/^[-•*●▪︎]\s*/, "")
    .replace(/^\[(\d{1,2}(?::\d{2}){1,2})\]\s*/u, "$1 ")
    .replace(/^\((\d{1,2}(?::\d{2}){1,2})\)\s*/u, "$1 ");
  return CHAPTER_LINE.test(trimmed);
}

function parseChapterLineSeconds(line: string): number | null {
  const chapters = parseYoutubeDescriptionChapters(line);
  return chapters[0]?.time ?? null;
}

/** Legacy Mesa HTML marker blocks (strip only; never written in PR6). */
export const LEGACY_MESA_BLOCK_START = "<!-- mesa-chapters:start -->";
export const LEGACY_MESA_BLOCK_END = "<!-- mesa-chapters:end -->";

function stripLegacyMesaBlocks(description: string): string {
  return description.replace(
    new RegExp(
      `${escapeRegExp(LEGACY_MESA_BLOCK_START)}[\\s\\S]*?${escapeRegExp(LEGACY_MESA_BLOCK_END)}\\s*`,
      "g",
    ),
    "",
  );
}

/** Remove legacy Mesa HTML marker blocks only (never written in PR6). */
export function stripLegacyMesaHtmlMarkers(description: string): string {
  return stripLegacyMesaBlocks(description);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Detect contiguous runs of chapter-format lines (conservative).
 * Requires at least 3 consecutive chapter lines with ascending timestamps.
 */
export function detectChapterBlocks(description: string): DetectedChapterBlock[] {
  const normalized = stripLegacyMesaBlocks(description);
  const lineStarts: number[] = [];
  let offset = 0;
  const lines = normalized.split(/\r?\n/);
  const eol = normalized.includes("\r\n") ? "\r\n" : "\n";

  for (let i = 0; i < lines.length; i += 1) {
    lineStarts.push(offset);
    offset += lines[i]!.length + eol.length;
  }

  const blocks: DetectedChapterBlock[] = [];
  let runStart = -1;
  let runTimes: number[] = [];

  function flushRun(endLineExclusive: number) {
    if (runStart < 0) return;
    const lineCount = endLineExclusive - runStart;
    if (lineCount < 3) {
      runStart = -1;
      runTimes = [];
      return;
    }
    let ascending = true;
    for (let i = 1; i < runTimes.length; i += 1) {
      if (runTimes[i]! <= runTimes[i - 1]!) {
        ascending = false;
        break;
      }
    }
    if (!ascending) {
      runStart = -1;
      runTimes = [];
      return;
    }

    const start = lineStarts[runStart] ?? 0;
    let end = normalized.length;
    if (endLineExclusive < lines.length) {
      end = lineStarts[endLineExclusive] ?? normalized.length;
    } else {
      end = normalized.length;
    }
    let text = normalized.slice(start, end);
    text = text.replace(/(\r?\n)+$/, "");
    blocks.push({
      start,
      end: start + text.length,
      text,
      lineCount,
    });
    runStart = -1;
    runTimes = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (isChapterLine(line)) {
      const seconds = parseChapterLineSeconds(line);
      if (seconds == null) {
        flushRun(i);
        continue;
      }
      if (runStart < 0) {
        runStart = i;
        runTimes = [seconds];
      } else {
        runTimes.push(seconds);
      }
      continue;
    }
    if (runStart >= 0 && !line.trim()) {
      continue;
    }
    flushRun(i);
  }
  flushRun(lines.length);

  return blocks;
}

export function findExactBlockSpan(
  description: string,
  blockText: string,
): { start: number; end: number } | null {
  if (!blockText) return null;
  const index = description.indexOf(blockText);
  if (index < 0) return null;
  const second = description.indexOf(blockText, index + blockText.length);
  if (second >= 0) return null;
  return { start: index, end: index + blockText.length };
}

export type DescriptionPatchPlan = {
  strategy: ChapterBlockReplacementStrategy;
  beforeDescription: string;
  proposedDescription: string;
  generatedChapterBlock: string;
  existingChapterBlock?: string;
  existingBlockLineCount?: number;
  prefixBytes: number;
  suffixBytes: number;
  chapterBlockBytes: number;
  proposedBytes: number;
  unchangedDescriptionBytes: number;
};

function joinWithSeparator(before: string, block: string): string {
  if (!before.trim()) return block;
  if (!block.trim()) return before;
  const needsBlank = !before.endsWith("\n\n") && !before.endsWith("\r\n\r\n");
  if (before.endsWith("\n") || before.endsWith("\r\n")) {
    return needsBlank ? `${before}\n${block}` : `${before}${block}`;
  }
  return `${before}\n\n${block}`;
}

export function buildDescriptionPatchPlan(input: {
  currentDescription: string;
  exportItems: YoutubeChapterExportItem[];
  lastSyncedChapterBlock?: string;
}): DescriptionPatchPlan {
  const generatedChapterBlock = formatYoutubeChapterBlock(input.exportItems);
  const current = input.currentDescription;

  if (current.trim() === joinWithSeparator("", generatedChapterBlock).trim()) {
    return finishPlan({
      strategy: "already_in_sync",
      current,
      proposed: current,
      generatedChapterBlock,
      existingBlock: generatedChapterBlock,
    });
  }

  if (input.lastSyncedChapterBlock) {
    const span = findExactBlockSpan(current, input.lastSyncedChapterBlock);
    if (span) {
      const proposed =
        current.slice(0, span.start) + generatedChapterBlock + current.slice(span.end);
      return finishPlan({
        strategy: "replace_previous_mesa",
        current,
        proposed,
        generatedChapterBlock,
        existingBlock: input.lastSyncedChapterBlock,
      });
    }
  }

  const blocks = detectChapterBlocks(current);
  if (blocks.length > 1) {
    return finishPlan({
      strategy: "ambiguous",
      current,
      proposed: current,
      generatedChapterBlock,
    });
  }

  if (blocks.length === 1) {
    const block = blocks[0]!;
    const proposed =
      current.slice(0, block.start) + generatedChapterBlock + current.slice(block.end);
    return finishPlan({
      strategy: "replace_detected",
      current,
      proposed,
      generatedChapterBlock,
      existingBlock: block.text,
      existingBlockLineCount: block.lineCount,
    });
  }

  const proposed = joinWithSeparator(current, generatedChapterBlock);
  return finishPlan({
    strategy: "append",
    current,
    proposed,
    generatedChapterBlock,
  });
}

function finishPlan(input: {
  strategy: ChapterBlockReplacementStrategy;
  current: string;
  proposed: string;
  generatedChapterBlock: string;
  existingBlock?: string;
  existingBlockLineCount?: number;
}): DescriptionPatchPlan {
  const proposedBytes = utf8ByteLength(input.proposed);
  let prefixBytes = 0;
  let suffixBytes = 0;
  let chapterBlockBytes = utf8ByteLength(input.generatedChapterBlock);

  if (input.existingBlock) {
    const span = findExactBlockSpan(input.current, input.existingBlock);
    if (span) {
      prefixBytes = utf8ByteLength(input.current.slice(0, span.start));
      suffixBytes = utf8ByteLength(input.current.slice(span.end));
    }
  } else if (input.strategy === "append") {
    prefixBytes = utf8ByteLength(input.current);
    suffixBytes = 0;
    if (input.current.trim() && input.generatedChapterBlock.trim()) {
      chapterBlockBytes = utf8ByteLength(
        input.proposed.slice(input.current.length).replace(/^[\r\n]+/, ""),
      );
    }
  }

  const unchangedDescriptionBytes =
    input.strategy === "already_in_sync"
      ? proposedBytes
      : prefixBytes + suffixBytes;

  return {
    strategy: input.strategy,
    beforeDescription: input.current,
    proposedDescription: input.proposed,
    generatedChapterBlock: input.generatedChapterBlock,
    existingChapterBlock: input.existingBlock,
    existingBlockLineCount: input.existingBlockLineCount,
    prefixBytes,
    suffixBytes,
    chapterBlockBytes,
    proposedBytes,
    unchangedDescriptionBytes,
  };
}

export function validateProposedDescriptionBytes(proposedDescription: string): {
  ok: boolean;
  bytes: number;
  limit: number;
  message?: string;
} {
  const bytes = utf8ByteLength(proposedDescription);
  if (bytes > YOUTUBE_DESCRIPTION_BYTE_LIMIT) {
    return {
      ok: false,
      bytes,
      limit: YOUTUBE_DESCRIPTION_BYTE_LIMIT,
      message: `YouTube description would exceed the 5,000-byte limit (${bytes.toLocaleString()} bytes).`,
    };
  }
  return { ok: true, bytes, limit: YOUTUBE_DESCRIPTION_BYTE_LIMIT };
}

export function diffChapterBlockLines(before: string, after: string): {
  removed: string[];
  added: string[];
  unchanged: string[];
} {
  const beforeLines = before.split(/\r?\n/).filter((line) => line.trim());
  const afterLines = after.split(/\r?\n/).filter((line) => line.trim());
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  return {
    removed: beforeLines.filter((line) => !afterSet.has(line)),
    added: afterLines.filter((line) => !beforeSet.has(line)),
    unchanged: beforeLines.filter((line) => afterSet.has(line)),
  };
}
