/**
 * Visual section orientation for Recipe Type field ledgers.
 *
 * Source of truth: Recipe Editor *placement* in RecipeEditor.tsx
 * (Basics / Details / Content / Media / Advanced), not completeness
 * fallbacks alone. Type-specific / ungrouped keys follow specialistFields → Advanced.
 *
 * Does not mutate sortOrder. Markers are derived from field keys in the
 * existing flat sequence (section labels may repeat when order is non-contiguous).
 */

import type { EditorSectionId } from "@/lib/recipe-editor-completeness";
import { CORE_FIELDS } from "@/lib/fields";

export type { EditorSectionId };

/** Mirrors RecipeEditor DETAILS_KEYS + cookMinutes (completeness/details timing). */
const DETAILS_KEYS = new Set([
  "servings",
  "servingsUnit",
  "difficulty",
  "prepMinutes",
  "bakeMinutes",
  "cookMinutes",
  "restMinutes",
  "utensils",
  "course",
  "method",
  "holiday",
  "cuisine",
  "tags",
]);

/** Mirrors RecipeEditor CONTENT_KEYS. */
const CONTENT_KEYS = new Set([
  "intro",
  "whyItWorks",
  "ingredients",
  "instructions",
  "notes",
  "tips",
  "keyIngredients",
  "faqs",
]);

/** Mirrors RecipeEditor MEDIA_PRIMARY_KEYS (hero + main video URL). */
const MEDIA_KEYS = new Set(["image", "imageAlt", "youtubeUrl"]);

/**
 * Mirrors RecipeEditor ADVANCED_KEYS.
 * floatingYoutubeUrl / youtube sit in Advanced in the editor UI
 * (completeness sectionForFieldKey still labels them media — intentional divergence).
 */
const ADVANCED_EXPLICIT_KEYS = new Set(["floatingYoutubeUrl", "youtube", "nutrition"]);

export const TYPE_FIELD_SECTION_ORDER: EditorSectionId[] = [
  "basics",
  "details",
  "content",
  "media",
  "advanced",
];

export const TYPE_FIELD_SECTION_LABELS: Record<EditorSectionId, string> = {
  basics: "Basics",
  details: "Details",
  content: "Content",
  media: "Media",
  advanced: "Advanced",
};

/** Short copy aligned with Recipe Editor section descriptions. */
export const TYPE_FIELD_SECTION_DESCRIPTIONS: Record<EditorSectionId, string> = {
  basics: "Identity and discovery fields.",
  details: "Yield, timing, and classification.",
  content: "Story, ingredients, and method.",
  media: "Hero image and main video connection.",
  advanced: "Optional metadata and type-specific fields.",
};

/**
 * Map a Recipe Type field key to the Recipe Editor section where it is placed.
 * Unknown / type-specific keys → Advanced (same as specialistFields in RecipeEditor).
 */
export function editorSectionForTypeFieldKey(key: string): EditorSectionId {
  if (key === "title" || key === "excerpt" || key === "categoryIds" || key === "dishName") {
    return "basics";
  }
  if (DETAILS_KEYS.has(key)) return "details";
  if (CONTENT_KEYS.has(key)) return "content";
  if (MEDIA_KEYS.has(key)) return "media";
  if (ADVANCED_EXPLICIT_KEYS.has(key)) return "advanced";
  return "advanced";
}

export type TypeFieldSectionRun<T extends { key: string }> = {
  field: T;
  section: EditorSectionId;
  /** True when this field starts a new section run in the current flat sequence. */
  showSectionMarker: boolean;
  /**
   * True when this run is the first time `section` appears in the annotated list.
   * False for later returns to the same section (continuation markers).
   * Only meaningful when `showSectionMarker` is true.
   */
  isFirstSectionOccurrence: boolean;
};

/** Annotate an already-ordered field list with section-run markers. Does not reorder. */
export function annotateTypeFieldSectionRuns<T extends { key: string }>(
  orderedFields: T[],
): TypeFieldSectionRun<T>[] {
  let previousSection: EditorSectionId | null = null;
  const seenSections = new Set<EditorSectionId>();
  return orderedFields.map((field) => {
    const section = editorSectionForTypeFieldKey(field.key);
    const showSectionMarker = previousSection !== section;
    const isFirstSectionOccurrence = showSectionMarker && !seenSections.has(section);
    if (showSectionMarker) {
      seenSections.add(section);
    }
    previousSection = section;
    return { field, section, showSectionMarker, isFirstSectionOccurrence };
  });
}

/** Section id sequence for CORE_FIELDS default sortOrder (for diagnostics/tests). */
export function coreFieldsDefaultSectionSequence(): EditorSectionId[] {
  return CORE_FIELDS.map((field) => editorSectionForTypeFieldKey(field.key));
}

/** True when each section id appears in at most one contiguous run. */
export function isSectionSequenceContiguous(sections: EditorSectionId[]): boolean {
  const seen = new Set<EditorSectionId>();
  let current: EditorSectionId | null = null;
  for (const section of sections) {
    if (section !== current) {
      if (seen.has(section)) return false;
      seen.add(section);
      current = section;
    }
  }
  return true;
}
