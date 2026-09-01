import {
  normalizeInstructionGroups,
  resolveChapterLabel,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";

export type ChapterLabelOverrideInfo = {
  sectionTitle: string;
  chapterLabel: string;
  youtubeLabel: string;
  hasOverride: boolean;
};

export function chapterLabelOverrideInfo(group: InstructionGroupWithChapters): ChapterLabelOverrideInfo {
  const sectionTitle = String(group.name ?? "").trim();
  const chapterLabel = String(group.chapterLabel ?? "").trim();
  const youtubeLabel = resolveChapterLabel(group);
  return {
    sectionTitle,
    chapterLabel,
    youtubeLabel,
    hasOverride: Boolean(chapterLabel && chapterLabel !== sectionTitle),
  };
}

/** Adjacent sections whose chapterLabel equals the other section's title (stale swap). */
export function detectSwappedAdjacentChapterLabels(
  groups: InstructionGroupWithChapters[],
): { indexA: number; indexB: number } | null {
  for (let index = 0; index < groups.length - 1; index += 1) {
    const a = groups[index]!;
    const b = groups[index + 1]!;
    const titleA = String(a.name ?? "").trim();
    const titleB = String(b.name ?? "").trim();
    const labelA = String(a.chapterLabel ?? "").trim();
    const labelB = String(b.chapterLabel ?? "").trim();
    if (!titleA || !titleB || !labelA || !labelB) continue;
    if (labelA === titleB && labelB === titleA && labelA !== labelB) {
      return { indexA: index, indexB: index + 1 };
    }
  }
  return null;
}

export function clearChapterLabelAtIndex(
  groups: InstructionGroupWithChapters[],
  index: number,
): InstructionGroupWithChapters[] {
  const next = [...groups];
  const current = { ...next[index]! };
  delete current.chapterLabel;
  next[index] = current;
  return next;
}

/** Clear chapterLabel overrides on a detected adjacent swap pair. */
export function clearSwappedAdjacentChapterLabels(
  groups: InstructionGroupWithChapters[],
): InstructionGroupWithChapters[] {
  const swap = detectSwappedAdjacentChapterLabels(groups);
  if (!swap) return groups;
  let next = clearChapterLabelAtIndex(groups, swap.indexA);
  next = clearChapterLabelAtIndex(next, swap.indexB);
  return next;
}

export function listChapterLabelOverrides(
  instructions: unknown,
): Array<ChapterLabelOverrideInfo & { groupIndex: number }> {
  const groups = normalizeInstructionGroups(instructions);
  return groups
    .map((group, groupIndex) => ({ groupIndex, ...chapterLabelOverrideInfo(group) }))
    .filter((row) => row.hasOverride);
}
