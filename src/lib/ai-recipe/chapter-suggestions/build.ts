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
import {
  YOUTUBE_CHAPTER_MIN_SECONDS,
  youtubeChapterGapIssue,
} from "@/lib/youtube-chapter-sync/validity";

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

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "with",
  "is",
  "this",
  "that",
  "into",
  "from",
]);

function stemToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

function tokenSet(value: string) {
  return new Set(
    normalizeTitle(value)
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !TITLE_STOP_WORDS.has(token))
      .map(stemToken),
  );
}

/** Exported for tests — semantic / normalized title similarity for chapter labels. */
export function titleMatchScore(sectionTitle: string, chapterLabel: string): number {
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
    [/slice|starch|rinse|soak|peel|wash/, /slice|starch|rinse|soak|peel|wash|prepar|potato|thin/],
    [/blanch|shock|dry|cool|boil/, /blanch|shock|dry|cool|boil|drain|pat/],
    [/fry|chip|deep.?fry|oil/, /fry|chip|deep.?fry|oil|crisp|golden/],
    [/season|toss|mix seasoning|salt/, /season|toss|mix|salt|spice|flavor|flavour/],
    [/caesar|dressing/, /caesar|dressing/],
    [/grill|chicken|season/, /grill|chicken|season/],
    [/crouton|garlic|bread|bake|toast/, /crouton|garlic|bread|bake|toast|crispy/],
    [/assembl|serve|finish|plate/, /assembl|masterpiece|finish|serve|plate|final/],
  ];
  for (const [sectionRe, chapterRe] of keywordPairs) {
    if (sectionRe.test(section) && chapterRe.test(chapter)) return 7;
  }

  return 0;
}

/** Score a chapter label against section title plus instruction step text. */
export function sectionSemanticMatchScore(input: {
  sectionTitle: string;
  steps?: string[];
  chapterLabel: string;
}): number {
  const titleScore = titleMatchScore(input.sectionTitle, input.chapterLabel);
  if (titleScore >= 6) return titleScore;

  const stepBlob = (input.steps ?? []).join(" ");
  if (!stepBlob.trim()) return titleScore;

  const stepScore = titleMatchScore(stepBlob, input.chapterLabel);
  return Math.max(titleScore, Math.min(stepScore, 7));
}

const YOUTUBE_MATCH_MIN_SCORE = 4;

/**
 * Global monotonic one-to-one assignment of YouTube description chapters to sections.
 * Prevents greedy per-section matching from letting a late chapter steal an early section.
 */
export function assignYoutubeDescriptionChapters(input: {
  groups: InstructionGroupWithChapters[];
  chapters: NormalizedAiYoutubeChapter[];
  mode: ChapterSuggestionMode;
}): Map<number, NormalizedAiYoutubeChapter> {
  const { groups, chapters, mode } = input;
  const assignments = new Map<number, NormalizedAiYoutubeChapter>();
  if (!chapters.length || !groups.length) return assignments;

  const sectionIndexes: number[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (mode === "missing" && hasCanonicalStartTimestamp(group)) continue;
    sectionIndexes.push(index);
  }
  if (!sectionIndexes.length) return assignments;

  const scoreMatrix = sectionIndexes.map((sectionIndex) => {
    const group = groups[sectionIndex]!;
    const sectionTitle = String(group.name ?? "").trim() || `Section ${sectionIndex + 1}`;
    const steps = Array.isArray(group.steps) ? group.steps.map((step) => String(step ?? "")) : [];
    return chapters.map((chapter) =>
      sectionSemanticMatchScore({
        sectionTitle,
        steps,
        chapterLabel: chapter.label,
      }),
    );
  });

  // Equal-count ordered prior: if every ordered pair is semantically compatible, prefer it.
  if (sectionIndexes.length === chapters.length) {
    const orderedScores = scoreMatrix.map((row, index) => row[index] ?? 0);
    const orderedCompatible = orderedScores.every((score) => score >= YOUTUBE_MATCH_MIN_SCORE);
    if (orderedCompatible) {
      for (let i = 0; i < sectionIndexes.length; i += 1) {
        assignments.set(sectionIndexes[i]!, chapters[i]!);
      }
      return assignments;
    }
  }

  type SearchResult = { score: number; picks: Array<{ sectionPos: number; chapterIndex: number }> };
  const memo = new Map<string, SearchResult>();

  function search(sectionPos: number, minChapterIndex: number): SearchResult {
    const key = `${sectionPos}:${minChapterIndex}`;
    const cached = memo.get(key);
    if (cached) return cached;

    if (sectionPos >= sectionIndexes.length) {
      const empty = { score: 0, picks: [] as Array<{ sectionPos: number; chapterIndex: number }> };
      memo.set(key, empty);
      return empty;
    }

    // Option: leave this section unmatched.
    let best = search(sectionPos + 1, minChapterIndex);

    for (let chapterIndex = minChapterIndex; chapterIndex < chapters.length; chapterIndex += 1) {
      const pairScore = scoreMatrix[sectionPos]![chapterIndex] ?? 0;
      if (pairScore < YOUTUBE_MATCH_MIN_SCORE) continue;
      const rest = search(sectionPos + 1, chapterIndex + 1);
      const total = pairScore + rest.score;
      if (
        total > best.score ||
        (total === best.score && rest.picks.length + 1 > best.picks.length)
      ) {
        best = {
          score: total,
          picks: [{ sectionPos, chapterIndex }, ...rest.picks],
        };
      }
    }

    memo.set(key, best);
    return best;
  }

  const best = search(0, 0);
  for (const pick of best.picks) {
    assignments.set(sectionIndexes[pick.sectionPos]!, chapters[pick.chapterIndex]!);
  }
  return assignments;
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
  steps?: string[],
): MatchCandidate | null {
  const matched = matchCachedChapter(sectionTitle, chapters, steps);
  if (!matched) return null;
  return {
    ...matched,
    source: "youtube_chapter_hint",
    confidence: "high",
    reason: "Matched YouTube description chapter",
  };
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
  steps?: string[],
): MatchCandidate | null {
  let best: (MatchCandidate & { score: number }) | null = null;
  for (const chapter of chapters) {
    const score = sectionSemanticMatchScore({
      sectionTitle,
      steps,
      chapterLabel: chapter.label,
    });
    if (score < YOUTUBE_MATCH_MIN_SCORE) continue;
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
  const { score: unusedScore, ...rest } = best;
  void unusedScore;
  return rest;
}

function youtubeHintFromChapter(chapter: NormalizedAiYoutubeChapter): MatchCandidate {
  return {
    startTimestamp: chapter.time,
    confidence: "high",
    source: "youtube_chapter_hint",
    evidence: `${formatTimestampInput(chapter.time)} — ${chapter.label}`,
    reason: "Matched YouTube description chapter",
    suggestedChapterLabel: chapter.label,
  };
}

function pickBestCandidate(candidates: MatchCandidate[]): MatchCandidate | null {
  const rank = { high: 3, medium: 2, low: 1 };
  const sourceRank: Record<ChapterSuggestionSource, number> = {
    youtube_chapter_hint: 6,
    stage_alignment: 5,
    ai_video: 4,
    cached_video: 4,
    transcript: 4,
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

  const youtubeAssignments = assignYoutubeDescriptionChapters({
    groups,
    chapters: evidence.youtubeDescriptionChapters,
    mode,
  });

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    const sectionTitle = String(group.name ?? "").trim() || `Section ${index + 1}`;
    const hasCanonical = hasCanonicalStartTimestamp(group);
    const include = mode === "all" || !hasCanonical;

    if (!include) {
      continue;
    }

    const fingerprint = instructionSectionFingerprint(group, index);
    const candidates: MatchCandidate[] = [];

    const youtubeChapter = youtubeAssignments.get(index);
    if (youtubeChapter) {
      candidates.push(youtubeHintFromChapter(youtubeChapter));
    } else {
      // Stage alignments fill gaps only when YouTube description did not map this section.
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
    }

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
      proposedStarts.delete(index);
    }

    suggestions.push({
      instructionIndex: index,
      sectionFingerprint: fingerprint,
      sectionTitle,
      chapterLabel: resolveChapterLabel(group),
      suggestedChapterLabel: best.suggestedChapterLabel,
      startTimestamp: status === "suggested" ? startTimestamp : undefined,
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
      const steps = Array.isArray(group.steps) ? group.steps.map((step) => String(step ?? "")) : [];

      const assigned = youtubeAssignments.get(index);
      if (assigned) {
        candidates.push(youtubeHintFromChapter(assigned));
      } else {
        const youtubeChapter = matchYoutubeDescriptionChapter(
          sectionTitle,
          evidence.youtubeDescriptionChapters,
          steps,
        );
        if (youtubeChapter) candidates.push(youtubeChapter);

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
      }

      const best = pickBestCandidate(candidates);
      if (!best) continue;

      const startTimestamp = roundPlayheadToSeconds(best.startTimestamp);
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
      } else {
        proposedStarts.set(index, startTimestamp);
      }

      suggestions.push({
        instructionIndex: index,
        sectionFingerprint: fingerprint,
        sectionTitle,
        chapterLabel: resolveChapterLabel(group),
        suggestedChapterLabel: best.suggestedChapterLabel,
        startTimestamp: status === "suggested" ? startTimestamp : undefined,
        confidence: best.confidence,
        source: best.source,
        evidence: best.evidence,
        reason: best.reason,
        status,
        conflictReason,
        stageAlignmentLineage: best.stageAlignmentLineage,
      });
    }
  }

  return suggestions.sort((a, b) => a.instructionIndex - b.instructionIndex);
}

/** @deprecated Use YOUTUBE_CHAPTER_MIN_SECONDS from youtube-chapter-sync/validity. */
export const AI_VIDEO_MIN_SECTION_GAP_SECONDS = YOUTUBE_CHAPTER_MIN_SECONDS;

type AiVideoSectionMatch = {
  sectionIndex: number;
  chapterIndex: number;
  score: number;
  chapter: NormalizedAiYoutubeChapter;
};

function assignAiVideoChapterMatches(input: {
  groups: InstructionGroupWithChapters[];
  chapters: NormalizedAiYoutubeChapter[];
  mode: ChapterSuggestionMode;
}): Map<number, NormalizedAiYoutubeChapter> {
  const assignments = new Map<number, NormalizedAiYoutubeChapter>();
  const pairs: AiVideoSectionMatch[] = [];

  for (let sectionIndex = 0; sectionIndex < input.groups.length; sectionIndex += 1) {
    const group = input.groups[sectionIndex]!;
    if (input.mode === "missing" && hasCanonicalStartTimestamp(group)) continue;

    const sectionTitle = String(group.name ?? "").trim() || `Section ${sectionIndex + 1}`;
    const steps = Array.isArray(group.steps) ? group.steps.map((step) => String(step ?? "")) : [];
    for (let chapterIndex = 0; chapterIndex < input.chapters.length; chapterIndex += 1) {
      const chapter = input.chapters[chapterIndex]!;
      const score = sectionSemanticMatchScore({
        sectionTitle,
        steps,
        chapterLabel: chapter.label,
      });
      if (score < 4) continue;
      pairs.push({ sectionIndex, chapterIndex, score, chapter });
    }
  }

  pairs.sort((a, b) => b.score - a.score || a.sectionIndex - b.sectionIndex);

  const usedSections = new Set<number>();
  const usedChapters = new Set<number>();
  for (const pair of pairs) {
    if (usedSections.has(pair.sectionIndex) || usedChapters.has(pair.chapterIndex)) continue;
    usedSections.add(pair.sectionIndex);
    usedChapters.add(pair.chapterIndex);
    assignments.set(pair.sectionIndex, pair.chapter);
  }

  return assignments;
}

function aiVideoEvidenceText(chapter: NormalizedAiYoutubeChapter): string {
  const clock = formatTimestampInput(chapter.time);
  if (chapter.sourceNote.trim()) {
    return `${clock} — ${chapter.sourceNote.trim()}`;
  }
  return `Video analysis chapter at ${clock}: ${chapter.label}`;
}

function detectAiVideoMinGapConflict(input: {
  instructionIndex: number;
  startTimestamp: number;
  proposedStarts: Map<number, number>;
}): string | null {
  let previousIndex = -1;
  let previousStart = -1;
  for (const [index, start] of [...input.proposedStarts.entries()].sort((a, b) => a[0] - b[0])) {
    if (index >= input.instructionIndex) break;
    if (start > previousStart) {
      previousIndex = index;
      previousStart = start;
    }
  }
  if (previousIndex < 0) return null;
  const gapIssue = youtubeChapterGapIssue({
    previousTimestamp: previousStart,
    currentTimestamp: input.startTimestamp,
  });
  if (gapIssue?.hardInvalid) {
    return `Suggested timestamp is too close to section ${previousIndex + 1} (minimum ${YOUTUBE_CHAPTER_MIN_SECONDS}s gap).`;
  }
  return null;
}

function aiVideoEditorialGapNote(input: {
  instructionIndex: number;
  startTimestamp: number;
  proposedStarts: Map<number, number>;
}): string | undefined {
  let previousStart = -1;
  for (const [index, start] of [...input.proposedStarts.entries()].sort((a, b) => a[0] - b[0])) {
    if (index >= input.instructionIndex) break;
    previousStart = start;
  }
  if (previousStart < 0) return undefined;
  return youtubeChapterGapIssue({
    previousTimestamp: previousStart,
    currentTimestamp: input.startTimestamp,
  })?.editorialWarning;
}

/**
 * Match instruction sections to Gemini video-analysis chapters / section hits.
 * Uses real temporal segments from video analysis — never duration interpolation.
 * One invalid section does not discard other valid suggestions.
 */
export function buildAiVideoChapterSuggestions(input: {
  groups: InstructionGroupWithChapters[];
  evidence: ChapterSuggestionEvidenceBundle;
  mode: ChapterSuggestionMode;
  sectionHits?: import("@/lib/ai-recipe/chapter-suggestions/parse-video-chapter-analysis").VideoChapterSectionHit[];
}): ChapterTimestampSuggestionItem[] {
  const { groups, evidence, mode } = input;
  const chapters = evidence.cachedGeminiChapters;
  const sectionHits = input.sectionHits ?? [];

  const hitBySection = new Map(
    sectionHits
      .filter((hit) => hit.matched && hit.startTimestamp != null)
      .map((hit) => [hit.sectionIndex, hit] as const),
  );

  const assignments =
    chapters.length > 0
      ? assignAiVideoChapterMatches({ groups, chapters, mode })
      : new Map<number, NormalizedAiYoutubeChapter>();

  if (!chapters.length && !hitBySection.size) return [];

  const suggestions: ChapterTimestampSuggestionItem[] = [];
  const proposedStarts = new Map<number, number>();

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    const hasCanonical = hasCanonicalStartTimestamp(group);
    const include = mode === "all" || !hasCanonical;
    if (!include) continue;

    const sectionTitle = String(group.name ?? "").trim() || `Section ${index + 1}`;
    const fingerprint = instructionSectionFingerprint(group, index);
    const hit = hitBySection.get(index);
    const chapter = assignments.get(index);

    const startFromHit = hit?.startTimestamp;
    const startFromChapter = chapter?.time;
    const startTimestampRaw = startFromHit ?? startFromChapter;

    if (startTimestampRaw == null) {
      suggestions.push({
        instructionIndex: index,
        sectionFingerprint: fingerprint,
        sectionTitle,
        chapterLabel: resolveChapterLabel(group),
        suggestedChapterLabel: resolveChapterLabel(group) || sectionTitle,
        confidence: "low",
        source: "semantic_inference",
        status: "no_evidence",
        reason: "Needs input — section not located in video analysis",
      });
      continue;
    }

    const startTimestamp = roundPlayheadToSeconds(startTimestampRaw);
    proposedStarts.set(index, startTimestamp);

    let status: ChapterTimestampSuggestionItem["status"] = "suggested";
    let conflictReason: string | undefined;

    const conflict =
      detectSuggestionConflict({
        instructionIndex: index,
        startTimestamp,
        groups,
        videoDurationSeconds: evidence.videoDurationSeconds,
        otherStarts: proposedStarts,
      }) ??
      detectAiVideoMinGapConflict({
        instructionIndex: index,
        startTimestamp,
        proposedStarts,
      });

    if (conflict) {
      status = "conflict";
      conflictReason = conflict;
      proposedStarts.delete(index);
    }

    const evidenceText = hit?.evidence
      ? `${formatTimestampInput(startTimestamp)} — ${hit.evidence}`
      : chapter
        ? aiVideoEvidenceText(chapter)
        : `Video analysis chapter at ${formatTimestampInput(startTimestamp)}`;

    suggestions.push({
      instructionIndex: index,
      sectionFingerprint: fingerprint,
      sectionTitle,
      chapterLabel: resolveChapterLabel(group),
      suggestedChapterLabel: (hit?.label || chapter?.label || sectionTitle).trim(),
      startTimestamp: status === "suggested" ? startTimestamp : undefined,
      confidence: aiConfidenceToSuggestion(hit?.confidence ?? chapter?.confidence ?? "HIGH_CONFIDENCE_INFERENCE"),
      source: "ai_video",
      evidence: [
        evidenceText,
        status === "suggested"
          ? aiVideoEditorialGapNote({
              instructionIndex: index,
              startTimestamp,
              proposedStarts,
            })
          : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      reason: hit
        ? "Located section start via targeted video analysis"
        : "Matched section to AI video analysis chapter",
      status,
      conflictReason,
    });
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
