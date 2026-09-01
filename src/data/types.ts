import type { RecipeYoutube } from "@/data/youtube-types";

export type Ingredient = {
  item: string;
  amount: string;
  grams?: number;
  notes?: string;
};

export type IngredientGroup = {
  name?: string;
  items: Ingredient[];
};

export type InstructionGroup = {
  name?: string;
  steps: string[];
  /** Optional shorter video-facing chapter title; falls back to `name`. */
  chapterLabel?: string;
  /** Video chapter start in seconds. */
  startTimestamp?: number;
  /** Optional explicit end in seconds; otherwise derived at runtime. */
  endTimestamp?: number;
};

export type Nutrition = {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;
  sugar?: number;
};

export type Faq = {
  question: string;
  answer: string;
};

export type Recipe = {
  slug: string;
  title: string;
  excerpt: string;
  intro: string;
  whyItWorks: string;
  keyIngredients: { name: string; note: string }[];
  tips: string[];
  faqs: Faq[];
  image: string;
  imageAlt: string;
  youtubeUrl?: string;
  floatingYoutubeUrl?: string;
  youtube?: RecipeYoutube;
  publishedAt: string;
  updatedAt: string;
  prepMinutes: number;
  cookMinutes: number;
  bakeMinutes?: number;
  restMinutes?: number;
  difficulty?: string;
  utensils?: string[];
  servings: number;
  servingsUnit: string;
  course: string;
  method: string;
  holiday?: string;
  cuisine: string;
  /** Optional dish identity when `title` is a topic/SEO headline. */
  dishName?: string;
  /** Recipe type name from CMS (e.g. Bread), when available. */
  typeName?: string;
  categories: string[];
  tags: string[];
  featured?: boolean;
  seasonal?: boolean;
  ingredients: IngredientGroup[];
  instructions: InstructionGroup[];
  notes: string[];
  nutrition: Nutrition;
};

export type Category = {
  slug: string;
  name: string;
  description: string;
  group: "desserts" | "course" | "method" | "holiday";
};

import type { StudioLessonType } from "@/lib/studio-types";

export type Lesson = {
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  /** One primary editorial type per lesson. */
  type: StudioLessonType;
  /** Draft lessons stay internal until intentionally published. */
  status: "draft" | "published";
  featured?: boolean;
  /** Legacy curated links; merged with database associations when present. */
  relatedRecipeSlugs?: string[];
};
