import type { RecipeInstructionStage } from "@/lib/recipe-instructions";
import type { RecipeYoutubeTimestamp } from "@/data/youtube-types";

export type StageVideoHelp = {
  time: number;
  label: string;
  chapterLabel: string;
  linkLabel: string;
};

/**
 * Pick at most one contextual video chapter per stage when the chapter
 * clearly matches a technique-heavy stage. Skips stages without a strong match.
 */
export function selectStageVideoHelp(
  stages: RecipeInstructionStage[],
  timestamps: RecipeYoutubeTimestamp[] | undefined,
): Record<string, StageVideoHelp> {
  const chapters = [...(timestamps ?? [])]
    .filter((item) => item.label.trim() && item.time >= 0)
    .sort((a, b) => a.time - b.time);
  if (!chapters.length) return {};

  const used = new Set<number>();
  const result: Record<string, StageVideoHelp> = {};

  for (const stage of stages) {
    if (!isTechniqueStage(stage.name)) continue;

    const ranked = chapters
      .map((chapter, index) => ({
        chapter,
        index,
        score: chapterStageScore(stage, chapter),
      }))
      .filter((entry) => entry.score >= 3 && !used.has(entry.index))
      .sort((a, b) => b.score - a.score || a.chapter.time - b.chapter.time);

    const best = ranked[0];
    if (!best) continue;
    used.add(best.index);

    const short = shortenChapterLabel(best.chapter.label);
    result[stage.id] = {
      time: best.chapter.time,
      label: best.chapter.label,
      chapterLabel: best.chapter.label,
      linkLabel: short
        ? `See the ${short} · ${formatClock(best.chapter.time)}`
        : `Watch this step · ${formatClock(best.chapter.time)}`,
    };
  }

  return result;
}

function isTechniqueStage(name: string) {
  return /\b(stretch|fold|incorporat|shap|proof|scor|steam|bak|knead|mix|laminat|piping|temper|whip)\b/i.test(
    name,
  );
}

function chapterStageScore(stage: RecipeInstructionStage, chapter: RecipeYoutubeTimestamp) {
  const stageName = stage.name.toLowerCase();
  const label = chapter.label.toLowerCase();
  let score = 0;

  const pairs: [RegExp, RegExp][] = [
    [/stretch|fold|incorporat/i, /stretch|fold|incorporat/i],
    [/shap|proof/i, /shap|proof|form/i],
    [/scor|steam|bak/i, /scor|steam|bak|oven|crust/i],
    [/knead|mix/i, /knead|mix|dough/i],
  ];

  for (const [stageRe, labelRe] of pairs) {
    if (stageRe.test(stageName) && labelRe.test(label)) score += 4;
  }

  for (const token of stageName.split(/[^a-z0-9]+/).filter((t) => t.length > 3)) {
    if (label.includes(token)) score += 2;
  }

  // Prefer chapters that already target a step inside this stage.
  if (
    chapter.stepIndex != null &&
    stage.steps.some((step) => step.globalIndex === chapter.stepIndex)
  ) {
    score += 5;
  }

  return score;
}

function shortenChapterLabel(label: string) {
  const cleaned = label
    .replace(/^\d{1,2}:\d{2}\s*[-–—]?\s*/g, "")
    .replace(/\b(technique|method|demo|how to)\b/gi, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= 42) return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return `${cleaned.slice(0, 39).trim()}…`;
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
