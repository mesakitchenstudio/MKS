import type { ChapterSuggestionCapability } from "@/lib/ai-recipe/chapter-suggestions/types";

/** True when a chapter-suggestion request may invoke Gemini / consume AI quota. */
export function chapterSuggestionsRequireAiQuota(input: {
  capability: ChapterSuggestionCapability;
  titlesOnly?: boolean;
  forceRefresh?: boolean;
}): boolean {
  if (input.titlesOnly) return false;
  if (input.capability === "youtube_chapters") return false;
  if (input.capability === "titles") return false;
  return true;
}
