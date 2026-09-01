import type { Lesson } from "@/data/types";

export const STUDIO_LESSON_TYPES = ["technique", "ingredient", "equipment", "habit"] as const;

export type StudioLessonType = (typeof STUDIO_LESSON_TYPES)[number];

export type StudioLessonSummary = Pick<Lesson, "slug" | "title" | "excerpt" | "type">;

export type StudioRecipeLinkRow = {
  slug: string;
  title: string;
  image: string;
  imageAlt: string;
};

const STUDIO_LESSON_TYPE_LABELS: Record<StudioLessonType, string> = {
  technique: "Technique",
  ingredient: "Ingredient",
  equipment: "Equipment",
  habit: "Habit",
};

export function isStudioLessonType(value: string): value is StudioLessonType {
  return (STUDIO_LESSON_TYPES as readonly string[]).includes(value);
}

export function studioLessonTypeLabel(type: StudioLessonType): string {
  return STUDIO_LESSON_TYPE_LABELS[type];
}

export function parseStudioLessonType(value: unknown, fallback: StudioLessonType = "technique"): StudioLessonType {
  const raw = String(value || "").trim().toLowerCase();
  return isStudioLessonType(raw) ? raw : fallback;
}
