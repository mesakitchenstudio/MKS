import type { AiConfidence } from "@/lib/ai-recipe/types";
import type { NormalizedAiYoutubeChapter } from "@/lib/ai-recipe/youtube-chapters";
import {
  formatTimestampInput,
  hasCanonicalStartTimestamp,
  resolveChapterLabel,
  type InstructionGroupWithChapters,
} from "@/lib/instruction-chapters";
import { roundPlayheadToSeconds } from "@/lib/instruction-video-workspace";
import { instructionSectionFingerprint } from "@/lib/ai-recipe/chapter-suggestions/fingerprints";
import type {
  ChapterSuggestionConfidence,
  ChapterSuggestionMode,
  ChapterSuggestionSource,
  ChapterTimestampSuggestionItem,
} from "@/lib/ai-recipe/chapter-suggestions/types";
import type { ChapterSuggestionEvidenceBundle } from "@/lib/ai-recipe/chapter-suggestions/evidence";
import type { StageAlignmentEvidenceLineage, ClassifiedStageAlignmentEvidence } from "@/lib/ai-recipe/chapter-suggestions/stage-alignment-evidence";

type MatchCandidate = {
  startTimestamp: number;
  endTimestamp?: number;
  confidence: ChapterSuggestionConfidence;
  source: ChapterSuggestionSource;
  evidence?: string;
  reason?: string;
  suggestedChapterLabel?: string;
  alignmentConfidence?: AiConfidence;
  stageAlignmentLineage?: StageAlignmentEvidenceLineage;
};

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenSet(value: string) {
  return new Set(normalizeTitle(value).split(/\s+/).filter(Boolean));
}

function titleMatchScore(sectionTitle: string, chapterLabel: string): number {
  const section = normalizeTitle(sectionTitle);
  const chapter = normalizeTitle(chapterLabel);
  if (!section || !chapter) return 0;
  if (section === chapter) return 10;
  if (section.includes(chapter) || chapter.includes(section)) return 8;

  const sectionTokens = tokenSet(sectionTitle);
  const chapterTokens = tokenSet(chapterLabel);
  let overlap = 0;
  for (const token of sectionTokens) {
    if (chapterTokens.has(token)) overlap += 1;
  }
  if (overlap >= 2) return 6 + overlap;
  if (overlap === 1) return 4;

  const keywordPairs: [RegExp, RegExp][] = [
    [/stretch|fold|ferment|gluten/, /stretch|fold|ferment|gluten|develop/],
    [/shap|proof|baguette/, /shap|proof|baguette|form|crumb/],
    [/scor|steam|bak|oven/, /scor|steam|bak|oven|crust/],
    [/activat|yeast|autolys|mix|initial/, /foundat|dough|mix|yeast|autolys|initial/],
    [/divid|pre.?shap|portion/, /divid|portion|pre.?shap|ball/],
  ];
  for (const [sectionRe, chapterRe] of keywordPairs) {
    if (sectionRe.test(section) && chapterRe.test(chapter)) return 7;
  }
  return 0;
}

function aiConfidenceToSuggestion(confidence: AiConfidence): ChapterSuggestionConfidence {
  if (confidence === "VERIFIED") return "high";
  if (confidence === "HIGH_CONFIDENCE_INFERENCE") return "medium";
  return "low";
}

function findTrustworthyStageAlignment(
  groupIndex: number,
  group: InstructionGroupWithChapters,
  classified: ClassifiedStageAlignmentEvidence[],
) {
  const id = `stage-${groupIndex}`;
  const title = String(group.name ?? "").trim().toLowerCase();
  return (
    classified.find(
      (row) =>
        row.groupIndex === groupIndex ||
        row.alignment.instructionStageId === id ||
        row.alignment.instructionSectionTitle.toLowerCase().trim() === title,
    ) ?? null
  );
}

function matchYoutubeDescriptionChapter(
  sectionTitle: string,
  chapters: NormalizedAiYoutubeChapter[],
): MatchCandidate | null {
  return matchCachedChapter(sectionTitle, chapters);
}

function stageAlignmentEvidenceText(
  lineage: StageAlignmentEvidenceLineage,
  seconds: number,
): string {
  const clock = formatTimestampInput(seconds);
  switch (lineage) {
    case "legacy_ai_video":
      return `AI video analysis stage alignment at ${clock}`;
    case "youtube_description_hint":
      return `Stage alignment from YouTube description near ${clock}`;
    case "manual_unknown":
      return `Legacy manual stage alignment at ${clock}`;
    default:
      return `Legacy stage alignment reference at ${clock}`;
  }
}

function matchCachedChapter(
  sectionTitle: string,
  chapters: NormalizedAiYoutubeChapter[],
): MatchCandidate | null {
  let best: (MatchCandidate & { score: number }) | null = null;
  for (const chapter of chapters) {
    const score = titleMatchScore(sectionTitle, chapter.label);
    if (score < 4) continue;
    const candidate: MatchCandidate & { score: number } = {
      score,
      startTimestamp: chapter.time,
      confidence: aiConfidenceToSuggestion(chapter.confidence),
      source: "cached_video",
      evidence: chapter.sourceNote
        ? `${formatTimestampInput(chapter.time)} — ${chapter.sourceNote}`
        : `Video chapter near ${formatTimestampInput(chapter.time)}: ${chapter.label}`,
      reason: "Matched cached video chapter timing",
      suggestedChapterLabel: chapter.label,
    };
    if (!best || score > best.score || (score === best.score && chapter.confidence === "VERIFIED")) {
      best = candidate;
    }
  }
  if (!best) return null;
  const { score: _score, ...rest } = best;
  return rest;
}

function matchYoutubeHint(
  sectionTitle: string,
  chapters: NormalizedAiYoutubeChapter[],
): MatchCandidate | null {
  const matched = matchCachedChapter(sectionTitle, chapters);
  if (!matched) return null;
  return {
    ...matched,
    source: "youtube_chapter_hint",
    confidence: "high",
    reason: "Matched YouTube description chapter",
  };
}

function pickBestCandidate(candidates: MatchCandidate[]): MatchCandidate | null {
  const rank = { high: 3, medium: 2, low: 1 };
  const sourceRank: Record<ChapterSuggestionSource, number> = {
    stage_alignment: 6,
    cached_video: 5,
    transcript: 5,
    youtube_chapter_hint: 4,
    legacy_timing: 2,
    semantic_inference: 1,
  };
  return (
    candidates.sort((a, b) => {
      const conf = rank[b.confidence] - rank[a.confidence];
      if (conf !== 0) return conf;
      return sourceRank[b.source] - sourceRank[a.source];
    })[0] ?? null
  );
}

function detectSuggestionConflict(input: {
  instructionIndex: number;
  startTimestamp: number;
  groups: InstructionGroupWithChapters[];
  videoDurationSeconds?: number;
  otherStarts: Map<number, number>;
}): string | null {
  const start = input.startTimestamp;
  if (input.videoDurationSeconds != null && start > input.videoDurationSeconds) {
    return "Suggested timestamp is beyond video duration.";
  }
  for (let index = 0; index < input.instructionIndex; index += 1) {
    const group = input.groups[index]!;
    if (hasCanonicalStartTimestamp(group) && start <= group.startTimestamp!) {
      return `Suggested timestamp occurs before section ${index + 1}.`;
    }
  }
  for (const [otherIndex, otherStart] of input.otherStarts) {
    if (otherIndex !== input.instructionIndex && otherStart === start) {
      return "Duplicate timestamp with another section suggestion.";
    }
  }
  return null;
}

export function buildDeterministicChapterSuggestions(input: {
  groups: InstructionGroupWithChapters[];
  evidence: ChapterSuggestionEvidenceBundle;
  mode: ChapterSuggestionMode;
}): ChapterTimestampSuggestionItem[] {
  const { groups, evidence, mode } = input;
  const suggestions: ChapterTimestampSuggestionItem[] = [];
  const proposedStarts = new Map<number, number>();

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    const sectionTitle = String(group.name ?? "").trim() || `Section ${index + 1}`;
    const hasCanonical = hasCanonicalStartTimestamp(group);
    const include =
      mode === "all" || !hasCanonical;

    if (!include) {
      continue;
    }

    const fingerprint = instructionSectionFingerprint(group, index);
    const candidates: MatchCandidate[] = [];

    const classifiedAlignment = findTrustworthyStageAlignment(
      index,
      group,
      evidence.trustworthyStageAlignments,
    );
    if (classifiedAlignment && classifiedAlignment.alignment.videoStartSeconds >= 0) {
      const alignment = classifiedAlignment.alignment;
      candidates.push({
        startTimestamp: alignment.videoStartSeconds,
        confidence: aiConfidenceToSuggestion(alignment.confidence),
        source: "stage_alignment",
        alignmentConfidence: alignment.confidence,
        stageAlignmentLineage: classifiedAlignment.lineage,
        evidence: stageAlignmentEvidenceText(
          classifiedAlignment.lineage,
          alignment.videoStartSeconds,
        ),
        reason: "Instruction-stage alignment evidence",
        suggestedChapterLabel: alignment.chapterTitle || alignment.instructionSectionTitle,
      });
    }

    const youtubeHint = matchYoutubeHint(sectionTitle, evidence.youtubeDescriptionChapters);
    if (youtubeHint) candidates.push(youtubeHint);

    const best = pickBestCandidate(candidates);

    if (!best) {
      suggestions.push({
        instructionIndex: index,
        sectionFingerprint: fingerprint,
        sectionTitle,
        chapterLabel: resolveChapterLabel(group),
        confidence: "low",
        source: "semantic_inference",
        status: "no_evidence",
        reason: "No reliable timestamp suggestion",
      });
      continue;
    }

    const startTimestamp = roundPlayheadToSeconds(best.startTimestamp);
    proposedStarts.set(index, startTimestamp);

    let status: ChapterTimestampSuggestionItem["status"] = "suggested";
    let conflictReason: string | undefined;
    const conflict = detectSuggestionConflict({
      instructionIndex: index,
      startTimestamp,
      groups,
      videoDurationSeconds: evidence.videoDurationSeconds,
      otherStarts: proposedStarts,
    });
    if (conflict) {
      status = "conflict";
      conflictReason = conflict;
    }

    suggestions.push({
      instructionIndex: index,
      sectionFingerprint: fingerprint,
      sectionTitle,
      chapterLabel: resolveChapterLabel(group),
      suggestedChapterLabel: best.suggestedChapterLabel,
      startTimestamp,
      endTimestamp: best.endTimestamp,
      confidence: best.confidence,
      source: best.source,
      evidence: best.evidence,
      reason: best.reason,
      status,
      conflictReason,
      stageAlignmentLineage: best.stageAlignmentLineage,
    });
  }

  if (mode === "all") {
    for (let index = 0; index < groups.length; index += 1) {
      if (suggestions.some((row) => row.instructionIndex === index)) continue;
      const group = groups[index]!;
      if (!hasCanonicalStartTimestamp(group)) continue;

      const sectionTitle = String(group.name ?? "").trim() || `Section ${index + 1}`;
      const fingerprint = instructionSectionFingerprint(group, index);
      const candidates: MatchCandidate[] = [];

      const classifiedAlignment = findTrustworthyStageAlignment(
        index,
        group,
        evidence.trustworthyStageAlignments,
      );
      if (classifiedAlignment && classifiedAlignment.alignment.videoStartSeconds >= 0) {
        const alignment = classifiedAlignment.alignment;
        candidates.push({
          startTimestamp: alignment.videoStartSeconds,
          confidence: aiConfidenceToSuggestion(alignment.confidence),
          source: "stage_alignment",
          alignmentConfidence: alignment.confidence,
          stageAlignmentLineage: classifiedAlignment.lineage,
          evidence: `Comparison reference at ${formatTimestampInput(alignment.videoStartSeconds)}`,
          reason: "Comparison against current canonical timestamp",
        });
      }
      const youtubeChapter = matchYoutubeDescriptionChapter(sectionTitle, evidence.youtubeDescriptionChapters);
      if (youtubeChapter) candidates.push(youtubeChapter);

      const best = pickBestCandidate(candidates);
      if (!best) continue;

      const startTimestamp = roundPlayheadToSeconds(best.startTimestamp);
      let status: ChapterTimestampSuggestionItem["status"] = "suggested";
      let conflictReason: string | undefined;
      if (group.startTimestamp === startTimestamp) {
        status = "suggested";
      }
      const conflict = detectSuggestionConflict({
        instructionIndex: index,
        startTimestamp,
        groups,
        videoDurationSeconds: evidence.videoDurationSeconds,
        otherStarts: proposedStarts,
      });
      if (conflict) {
        status = "conflict";
        conflictReason = conflict;
      }

      suggestions.push({
        instructionIndex: index,
        sectionFingerprint: fingerprint,
        sectionTitle,
        chapterLabel: resolveChapterLabel(group),
        suggestedChapterLabel: best.suggestedChapterLabel,
        startTimestamp,
        confidence: best.confidence,
        source: best.source,
        evidence: best.evidence,
        reason: best.reason,
        status,
        conflictReason,
        stageAlignmentLineage: best.stageAlignmentLineage,
      });
      proposedStarts.set(index, startTimestamp);
    }
  }

  return suggestions.sort((a, b) => a.instructionIndex - b.instructionIndex);
}

export function buildChapterTitleSuggestions(input: {
  groups: InstructionGroupWithChapters[];
  mode: ChapterSuggestionMode;
}): ChapterTimestampSuggestionItem[] {
  const suggestions: ChapterTimestampSuggestionItem[] = [];

  for (let index = 0; index < input.groups.length; index += 1) {
    const group = input.groups[index]!;
    const sectionTitle = String(group.name ?? "").trim() || `Section ${index + 1}`;
    const currentLabel = String(group.chapterLabel ?? "").trim();
    const hasCanonical = hasCanonicalStartTimestamp(group);

    if (input.mode === "missing" && hasCanonical && currentLabel) continue;
    if (input.mode === "missing" && currentLabel && currentLabel === sectionTitle) continue;

    const suggestedLabel = currentLabel || sectionTitle;
    if (input.mode === "all" && currentLabel === suggestedLabel) continue;

    suggestions.push({
      instructionIndex: index,
      sectionFingerprint: instructionSectionFingerprint(group, index),
      sectionTitle,
      chapterLabel: resolveChapterLabel(group),
      suggestedChapterLabel: suggestedLabel,
      confidence: "low",
      source: "semantic_inference",
      status: "suggested",
      reason: "Section title can be used as the chapter label",
      evidence: "No trustworthy timestamp source — label only",
    });
  }

  return suggestions;
}

export function timestampComparisonLabel(current?: number, suggested?: number): string | null {
  if (current == null || suggested == null) return null;
  if (current === suggested) return "Matches current";
  const delta = suggested - current;
  const abs = Math.abs(delta);
  if (abs <= 2) return "Close match";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${abs} sec`;
}
