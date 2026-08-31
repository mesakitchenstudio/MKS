import type { RecipeInstructionStage } from "@/lib/recipe-instructions";
import type { RecipeYoutubeTimestamp } from "@/data/youtube-types";

export type StageVideoHelp = {
  time: number;
  label: string;
  chapterLabel: string;
  linkLabel: string;
};

/**
 * Attach at most one chapter timestamp to each technique-heavy stage.
 * Prefer label/step matches; then assign remaining non-intro chapters in order
 * so cooks still get useful helpers when chapter wording differs from stage names.
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
  const techniqueStages = stages.filter((stage) => isTechniqueStage(stage.name));

  for (const stage of techniqueStages) {
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
    result[stage.id] = toHelp(stage.name, best.chapter);
  }

  // Second pass: unused non-intro chapters → remaining technique stages in order.
  const leftoverChapters = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter((entry) => !used.has(entry.index) && !isIntroChapter(entry.chapter));

  for (const stage of techniqueStages) {
    if (result[stage.id]) continue;
    const next = leftoverChapters.shift();
    if (!next) break;
    used.add(next.index);
    result[stage.id] = toHelp(stage.name, next.chapter);
  }

  return result;
}

function toHelp(stageName: string, chapter: RecipeYoutubeTimestamp): StageVideoHelp {
  return {
    time: chapter.time,
    label: chapter.label,
    chapterLabel: chapter.label,
    linkLabel: buildLinkLabel(stageName, chapter.label, chapter.time),
  };
}

function isIntroChapter(chapter: RecipeYoutubeTimestamp) {
  if (chapter.time === 0 && /intro|overview|welcome|hello|start here/i.test(chapter.label)) {
    return true;
  }
  return /^(intro|overview|welcome)\b/i.test(chapter.label.trim());
}

export function isTechniqueStage(name: string) {
  return /stretch|fold|incorporat|divid|pre.?shap|shap|proof|scor|steam|bak|knead|laminat|piping|temper|whip|mix(?:ing)? (?:the )?dough/i.test(
    name,
  );
}

function chapterStageScore(stage: RecipeInstructionStage, chapter: RecipeYoutubeTimestamp) {
  const stageName = stage.name.toLowerCase();
  const label = chapter.label.toLowerCase();
  let score = 0;

  const pairs: [RegExp, RegExp][] = [
    [/stretch|fold|incorporat/i, /stretch|fold|incorporat/i],
    [/divid|pre.?shap/i, /divid|pre.?shap|portion|scale|ball/i],
    [/shap|proof/i, /shap|proof|form|pre.?shape|baguette/i],
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
  if (/divid|pre.?shap/i.test(stage) || /divid|pre.?shap|portion/i.test(chapter)) {
    return `See how to divide & pre-shape · ${clock}`;
  }
  if (/shap|proof/i.test(stage) || /shap|proof|form/i.test(chapter)) {
    if (/baguette/i.test(`${stageName} ${chapterLabel}`)) {
      return `See how to shape the baguettes · ${clock}`;
    }
    return `See how to shape · ${clock}`;
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
