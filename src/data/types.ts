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

export type Lesson = {
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
};
