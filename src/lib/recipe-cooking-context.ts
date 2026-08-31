import type { Recipe } from "@/data/types";
import type { RecipeInstructionStage } from "@/lib/recipe-instructions";

export type CookingContextPlan = {
  beforeYouStart: string[];
  /** Tips keyed by stage id */
  stageTips: Record<string, string[]>;
};

type PrefixedNote =
  | { kind: "before"; text: string }
  | { kind: "stage"; stageHint: string; text: string }
  | { kind: "plain"; text: string };

/**
 * Split recipe notes into "Before you start" and stage-specific studio tips.
 *
 * Supported optional prefixes (no schema change):
 * - `before: …`
 * - `stage:Stage Name|…` or `stage:Stage Name: …`
 *
 * Unprefixed notes are assigned by keyword heuristics when possible.
 */
export function planCookingContext(
  recipe: Pick<Recipe, "notes" | "tips">,
  stages: RecipeInstructionStage[],
): CookingContextPlan {
  const beforeYouStart: string[] = [];
  const stageTips: Record<string, string[]> = Object.fromEntries(
    stages.map((stage) => [stage.id, [] as string[]]),
  );

  const notes = recipe.notes.map((note) => note.trim()).filter(Boolean);
  for (const note of notes) {
    const parsed = parsePrefixedNote(note);
    if (parsed.kind === "before") {
      beforeYouStart.push(parsed.text);
      continue;
    }
    if (parsed.kind === "stage") {
      const stage = matchStage(stages, parsed.stageHint);
      if (stage) {
        stageTips[stage.id].push(parsed.text);
        continue;
      }
    }

    const text = parsed.kind === "plain" ? parsed.text : parsed.text;
    const assigned = assignByHeuristic(text, stages, beforeYouStart, stageTips);
    if (!assigned) {
      // Prefer not to invent a late Notes block — keep mild prep notes up top.
      if (looksPreparatory(text) || stages.length === 0) {
        beforeYouStart.push(text);
      } else {
        const last = stages[stages.length - 1];
        stageTips[last.id].push(text);
      }
    }
  }

  // Studio tips from Learn are intentionally NOT duplicated here.

  return {
    beforeYouStart: unique(beforeYouStart),
    stageTips: Object.fromEntries(
      Object.entries(stageTips).map(([id, tips]) => [id, unique(tips)]),
    ),
  };
}

function parsePrefixedNote(note: string): PrefixedNote {
  const before = note.match(/^before\s*:\s*(.+)$/i);
  if (before?.[1]) return { kind: "before", text: before[1].trim() };

  const stagePipe = note.match(/^stage\s*:\s*([^|]+)\|\s*(.+)$/i);
  if (stagePipe?.[1] && stagePipe[2]) {
    return { kind: "stage", stageHint: stagePipe[1].trim(), text: stagePipe[2].trim() };
  }

  const stageColon = note.match(/^stage\s*:\s*([^:]+):\s*(.+)$/i);
  if (stageColon?.[1] && stageColon[2]) {
    return { kind: "stage", stageHint: stageColon[1].trim(), text: stageColon[2].trim() };
  }

  return { kind: "plain", text: note };
}

function assignByHeuristic(
  text: string,
  stages: RecipeInstructionStage[],
  beforeYouStart: string[],
  stageTips: Record<string, string[]>,
): boolean {
  if (looksPreparatory(text)) {
    beforeYouStart.push(text);
    return true;
  }

  const scored = stages
    .map((stage) => ({ stage, score: stageMatchScore(stage.name, text) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored[0]) {
    stageTips[scored[0].stage.id].push(text);
    return true;
  }
  return false;
}

function looksPreparatory(text: string) {
  return /\b(before you start|mise en place|water temperature|room temperature|~?\d+\s*°\s*c|fahrenheit|weigh|scale|read through|prepare|set aside|bring to)\b/i.test(
    text,
  );
}

function stageMatchScore(stageName: string, text: string) {
  const stage = stageName.toLowerCase();
  const body = text.toLowerCase();
  let score = 0;

  const pairs: [RegExp, RegExp][] = [
    [/stretch|fold|incorporat/i, /stretch|fold|incorporat|dough develop/i],
    [/shap|proof|final/i, /shap|proof|bench|batard|baguette shape/i],
    [/scor|steam|bak/i, /scor|steam|bak|oven|crust|tray/i],
    [/mix|autolys|ferment/i, /mix|autolys|ferment|preferment|levain/i],
    [/knead/i, /knead/i],
  ];

  for (const [stageRe, textRe] of pairs) {
    if (stageRe.test(stage) && textRe.test(body)) score += 3;
  }

  for (const token of stage.split(/[^a-z0-9]+/).filter((t) => t.length > 3)) {
    if (body.includes(token)) score += 1;
  }

  return score;
}

function matchStage(stages: RecipeInstructionStage[], hint: string) {
  const needle = hint.trim().toLowerCase();
  if (!needle) return null;
  return (
    stages.find((stage) => stage.name.trim().toLowerCase() === needle) ||
    stages.find((stage) => stage.name.toLowerCase().includes(needle)) ||
    stages.find((stage) => needle.includes(stage.name.toLowerCase())) ||
    null
  );
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
