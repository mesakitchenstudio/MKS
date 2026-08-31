import type { NormalizedAiDraft } from "@/lib/ai-recipe/normalize";
import type { RecipeAiVideoContext } from "@/lib/ai-recipe/types";
import { youtubeVideoId } from "@/lib/youtube";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";

/**
 * Build a compact reusable analysis summary from a full-video draft.
 * Targeted fills read this instead of re-sending the video to Gemini.
 */
export function buildRecipeAiVideoContext(input: {
  youtubeUrl: string;
  model: string;
  schemaVersion: string;
  draft: NormalizedAiDraft;
  generatedAt?: string;
}): RecipeAiVideoContext | undefined {
  const linkedVideoId = youtubeVideoId(input.youtubeUrl);
  if (!linkedVideoId) return undefined;

  const values = input.draft.values;
  const youtube = parseRecipeYoutubeBlob(values.youtube);
  const dishName = String(values.dishName ?? input.draft.title ?? "").trim();
  const intro = String(values.intro ?? "").trim();
  const why = String(values.whyItWorks ?? "").trim();
  const excerpt = String(input.draft.excerpt ?? "").trim();

  const ingredientEvidence: string[] = [];
  if (Array.isArray(values.ingredients)) {
    for (const group of values.ingredients as { name?: string; items?: { item?: string; amount?: string }[] }[]) {
      for (const item of group.items ?? []) {
        const label = [item.amount, item.item].filter(Boolean).join(" ").trim();
        if (label) ingredientEvidence.push(label);
        if (ingredientEvidence.length >= 30) break;
      }
      if (ingredientEvidence.length >= 30) break;
    }
  }

  const instructionStageEvidence: { title: string; notes?: string }[] = [];
  if (Array.isArray(values.instructions)) {
    for (const group of values.instructions as { name?: string; steps?: string[] }[]) {
      const title = String(group.name ?? "").trim();
      if (!title) continue;
      const firstStep = (group.steps ?? []).map((step) => String(step).trim()).find(Boolean);
      instructionStageEvidence.push({
        title,
        notes: firstStep ? firstStep.slice(0, 160) : undefined,
      });
      if (instructionStageEvidence.length >= 16) break;
    }
  }

  const timingParts = [
    values.prepMinutes != null ? `prep ${values.prepMinutes}m` : "",
    values.cookMinutes != null ? `cook ${values.cookMinutes}m` : "",
    values.restMinutes != null ? `rest ${values.restMinutes}m` : "",
  ].filter(Boolean);

  const semanticSummary = [excerpt, intro.slice(0, 400), why.slice(0, 280)].filter(Boolean).join("\n\n").slice(0, 900);

  return {
    linkedVideoId,
    schemaVersion: input.schemaVersion,
    model: input.model,
    videoDuration: youtube?.duration ? String(youtube.duration) : undefined,
    semanticSummary: semanticSummary || undefined,
    dishContext: dishName || undefined,
    ingredientEvidence: ingredientEvidence.length ? ingredientEvidence : undefined,
    instructionStageEvidence: instructionStageEvidence.length ? instructionStageEvidence : undefined,
    timingNotes: timingParts.length ? timingParts.join(" · ") : undefined,
    generatedAt: input.generatedAt || new Date().toISOString(),
  };
}
