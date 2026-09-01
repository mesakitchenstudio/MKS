import type { RecipeInstructionStage } from "@/lib/recipe-instructions";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import { isConfidentStageAlignment } from "@/lib/ai-recipe/stage-alignments";
import {
  type InstructionGroupWithChapters,
  hasCanonicalInstructionChapters,
  normalizeInstructionGroups,
  resolveInstructionChapter,
} from "@/lib/instruction-chapters";

export type StageVideoHelp = {
  time: number;
  label: string;
  chapterLabel: string;
  linkLabel: string;
};

/**
 * Attach at most one chapter timestamp to each technique-heavy stage.
 * Prefer explicit Mesa stageAlignments; otherwise strong semantic matches only.
 */
export function selectStageVideoHelp(
  stages: RecipeInstructionStage[],
  timestamps: RecipeYoutubeTimestamp[] | undefined,
  stageAlignments?: RecipeStageAlignment[] | undefined,
  instructions?: InstructionGroupWithChapters[] | readonly InstructionGroupWithChapters[],
  videoDurationSeconds?: number,
): Record<string, StageVideoHelp> {
  const normalizedInstructions = instructions
    ? normalizeInstructionGroups(instructions).filter((group) =>
        group.steps.some((step) => step.trim()),
      )
    : [];

  if (normalizedInstructions.length && hasCanonicalInstructionChapters(normalizedInstructions)) {
    const fromCanonical = helpFromCanonicalInstructions(
      stages,
      normalizedInstructions,
      videoDurationSeconds,
    );
    if (Object.keys(fromCanonical).length) return fromCanonical;
  }

  if (stageAlignments?.length) {
    const fromAlignments = helpFromStageAlignments(stages, stageAlignments);
    if (Object.keys(fromAlignments).length) return fromAlignments;
  }

  const chapters = [...(timestamps ?? [])]
    .filter((item) => item.label.trim() && item.time >= 0)
    .sort((a, b) => a.time - b.time);
  if (!chapters.length) return {};

  const used = new Set<number>();
  const result: Record<string, StageVideoHelp> = {};
  const techniqueStages = stages.filter((stage) => isTechniqueStage(stage.name));

  for (const stage of techniqueStages) {
    const ranked = chapters
      .map((chapter, index) => ({
        chapter,
        index,
        score: chapterStageScore(stage, chapter),
      }))
      .filter((entry) => entry.score >= 4 && !used.has(entry.index))
      .sort((a, b) => b.score - a.score || a.chapter.time - b.chapter.time);

    const best = ranked[0];
    if (!best) continue;
    used.add(best.index);
    result[stage.id] = toHelp(best.chapter);
  }

  return result;
}

function helpFromCanonicalInstructions(
  stages: RecipeInstructionStage[],
  groups: InstructionGroupWithChapters[],
  videoDurationSeconds?: number,
): Record<string, StageVideoHelp> {
  const result: Record<string, StageVideoHelp> = {};
  for (const stage of stages) {
    const match = stage.id.match(/^stage-(\d+)$/);
    const groupIndex = match ? Number(match[1]) : -1;
    const group = groups[groupIndex];
    if (!group) continue;
    const resolved = resolveInstructionChapter({
      group,
      groupIndex,
      allGroups: groups,
      videoDurationSeconds,
    });
    if (resolved.startTimestamp == null) continue;
    result[stage.id] = {
      time: resolved.startTimestamp,
      label: resolved.label,
      chapterLabel: resolved.label,
      linkLabel: buildLinkLabel(resolved.label, resolved.startTimestamp),
    };
  }
  return result;
}

function helpFromStageAlignments(
  stages: RecipeInstructionStage[],
  alignments: RecipeStageAlignment[],
): Record<string, StageVideoHelp> {
  const result: Record<string, StageVideoHelp> = {};
  const byId = new Map(alignments.map((row) => [row.instructionStageId, row]));
  const byTitle = new Map(
    alignments.map((row) => [row.instructionSectionTitle.toLowerCase().trim(), row]),
  );

  for (const stage of stages) {
    const match =
      byId.get(stage.id) ||
      byTitle.get(stage.name.toLowerCase().trim()) ||
      null;
    if (!match || !isConfidentStageAlignment(match)) continue;
    result[stage.id] = {
      time: match.videoStartSeconds,
      label: match.chapterTitle,
      chapterLabel: match.chapterTitle,
      linkLabel: `Watch: ${match.chapterTitle} · ${formatClock(match.videoStartSeconds)}`,
    };
  }
  return result;
}

function toHelp(chapter: RecipeYoutubeTimestamp): StageVideoHelp {
  return {
    time: chapter.time,
    label: chapter.label,
    chapterLabel: chapter.label,
    linkLabel: buildLinkLabel(chapter.label, chapter.time),
  };
}

export function isTechniqueStage(name: string) {
  return /activat|yeast|autolys|stretch|fold|incorporat|divid|pre.?shap|shap|proof|scor|steam|bak|knead|laminat|piping|temper|whip|mix(?:ing)? (?:the )?dough|gluten/i.test(
    name,
  );
}

function chapterStageScore(stage: RecipeInstructionStage, chapter: RecipeYoutubeTimestamp) {
  const stageName = stage.name.toLowerCase();
  const label = chapter.label.toLowerCase();
  let score = 0;

  const pairs: [RegExp, RegExp, number][] = [
    [
      /activat|yeast|autolys|mix(?:ing)?(?:\b|.*dough)|foundat|preferment|levain|starter/i,
      /foundat|dough|mix|autolys|yeast|preferment|levain|starter|beginning|start/i,
      5,
    ],
    [/stretch|fold|gluten|knead/i, /stretch|fold|gluten|knead|develop/i, 6],
    [/divid|pre.?shap|portion|scale/i, /divid|pre.?shap|portion|scale|ball/i, 5],
    [/shap|proof|crumb/i, /shap|proof|form|pre.?shape|baguette|crumb/i, 5],
    [/scor|steam|bak|oven/i, /scor|steam|bak|oven|crust/i, 6],
  ];

  for (const [stageRe, labelRe, weight] of pairs) {
    if (stageRe.test(stageName) && labelRe.test(label)) {
      score = Math.max(score, weight);
    }
  }

  if (
    chapter.stepIndex != null &&
    stage.steps.some((step) => step.globalIndex === chapter.stepIndex)
  ) {
    score = Math.max(score, 7);
  }

  return score;
}

function buildLinkLabel(chapterLabel: string, time: number) {
  const clock = formatClock(time);
  const title = chapterLabel.trim().replace(/^\d{1,2}(?::\d{2}){1,2}\s*[-–—]?\s*/, "");
  if (!title) return `Watch this step · ${clock}`;
  const display = title.length <= 48 ? title : `${title.slice(0, 45).trim()}…`;
  return `Watch: ${display} · ${clock}`;
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
