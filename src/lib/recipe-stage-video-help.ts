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
      .filter((entry) => entry.score >= 2 && !used.has(entry.index))
      .sort((a, b) => b.score - a.score || a.chapter.time - b.chapter.time);

    const best = ranked[0];
    if (!best) continue;
    used.add(best.index);

    result[stage.id] = {
      time: best.chapter.time,
      label: best.chapter.label,
      chapterLabel: best.chapter.label,
      linkLabel: buildLinkLabel(stage.name, best.chapter.label, best.chapter.time),
    };
  }

  return result;
}

function isTechniqueStage(name: string) {
  return /stretch|fold|incorporat|shap|proof|scor|steam|bak|knead|mix|laminat|piping|temper|whip/i.test(
    name,
  );
}

function chapterStageScore(stage: RecipeInstructionStage, chapter: RecipeYoutubeTimestamp) {
  const stageName = stage.name.toLowerCase();
  const label = chapter.label.toLowerCase();
  let score = 0;

  const pairs: [RegExp, RegExp][] = [
    [/stretch|fold|incorporat/i, /stretch|fold|incorporat/i],
    [/shap|proof/i, /shap|proof|form|pre.?shape/i],
    [/scor|steam|bak/i, /scor|steam|bak|oven|crust/i],
    [/knead|mix/i, /knead|mix|dough/i],
  ];

  for (const [stageRe, labelRe] of pairs) {
    if (stageRe.test(stageName) && labelRe.test(label)) score += 4;
  }

  for (const token of stageName.split(/[^a-z0-9]+/).filter((t) => t.length > 3)) {
    if (label.includes(token)) score += 2;
  }

  if (
    chapter.stepIndex != null &&
    stage.steps.some((step) => step.globalIndex === chapter.stepIndex)
  ) {
    score += 5;
  }

  return score;
}

function buildLinkLabel(stageName: string, chapterLabel: string, time: number) {
  const clock = formatClock(time);
  const stage = stageName.toLowerCase();
  const chapter = chapterLabel.toLowerCase();

  if (/stretch|fold|incorporat/i.test(stage) || /stretch|fold/i.test(chapter)) {
    return `Watch the stretch-and-fold technique · ${clock}`;
  }
  if (/shap|proof/i.test(stage) || /shap|proof|form/i.test(chapter)) {
    return `Watch the shaping technique · ${clock}`;
  }
  if (/scor|steam|bak/i.test(stage) || /scor|steam|bak/i.test(chapter)) {
    return `Watch scoring & baking · ${clock}`;
  }

  const short = shortenChapterLabel(chapterLabel);
  return short ? `Watch ${short} · ${clock}` : `Watch this step · ${clock}`;
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
