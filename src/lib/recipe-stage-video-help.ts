import type { RecipeInstructionStage } from "@/lib/recipe-instructions";
import type { RecipeYoutubeTimestamp } from "@/data/youtube-types";

export type StageVideoHelp = {
  time: number;
  label: string;
  chapterLabel: string;
  linkLabel: string;
};

/** Minimum pair score required before attaching an inline chapter CTA. */
const MIN_MATCH_SCORE = 4;

/**
 * Attach at most one chapter timestamp to each technique-heavy stage.
 * Only strong semantic matches — omit uncertain inline CTAs rather than guess.
 * Full chapter lists still render under “In this video”.
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
      .filter((entry) => entry.score >= MIN_MATCH_SCORE && !used.has(entry.index))
      .sort((a, b) => b.score - a.score || a.chapter.time - b.chapter.time);

    const best = ranked[0];
    if (!best) continue;
    used.add(best.index);
    result[stage.id] = toHelp(best.chapter);
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

/**
 * Strong semantic pairs only. Loose keyword overlap is not enough.
 * Order matters for ties within a stage — earlier pairs are more specific.
 */
function chapterStageScore(stage: RecipeInstructionStage, chapter: RecipeYoutubeTimestamp) {
  const stageName = stage.name.toLowerCase();
  const label = chapter.label.toLowerCase();
  let score = 0;

  const pairs: [RegExp, RegExp, number][] = [
    // Early dough / yeast / foundation
    [
      /activat|yeast|autolys|mix(?:ing)?(?:\b|.*dough)|foundat|preferment|levain|starter/i,
      /foundat|dough|mix|autolys|yeast|preferment|levain|starter|beginning|start/i,
      5,
    ],
    // Gluten development / stretch & fold (not mere “incorporate”)
    [
      /stretch|fold|gluten|knead/i,
      /stretch|fold|gluten|knead|develop/i,
      6,
    ],
    // Divide / pre-shape
    [/divid|pre.?shap|portion|scale/i, /divid|pre.?shap|portion|scale|ball/i, 5],
    // Final shape / proof
    [/shap|proof|crumb/i, /shap|proof|form|pre.?shape|baguette|crumb/i, 5],
    // Score / steam / bake
    [/scor|steam|bak|oven/i, /scor|steam|bak|oven|crust/i, 6],
  ];

  for (const [stageRe, labelRe, weight] of pairs) {
    if (stageRe.test(stageName) && labelRe.test(label)) {
      score = Math.max(score, weight);
    }
  }

  // Explicit stepIndex grounding from metadata (when present).
  if (
    chapter.stepIndex != null &&
    stage.steps.some((step) => step.globalIndex === chapter.stepIndex)
  ) {
    score = Math.max(score, 7);
  }

  return score;
}

/** Prefer the real YouTube chapter title so CTAs stay truthful. */
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
