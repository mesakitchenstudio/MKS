export const FIELD_KINDS = [
  { id: "text", label: "Short text" },
  { id: "textarea", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "minutes", label: "Minutes" },
  { id: "boolean", label: "Yes / no" },
  { id: "select", label: "Select" },
  { id: "image", label: "Image" },
  { id: "gallery", label: "Image gallery" },
  { id: "ingredients", label: "Ingredients" },
  { id: "instructions", label: "Instructions" },
  { id: "list", label: "List" },
  { id: "namedNotes", label: "Named notes / FAQs" },
  { id: "nutrition", label: "Nutrition" },
  { id: "tags", label: "Tags" },
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number]["id"];

export type FieldDefinition = {
  key: string;
  label: string;
  helpText?: string;
  kind: FieldKind | string;
  required?: boolean;
  options?: string[];
  sortOrder?: number;
};

export const DIFFICULTY_OPTIONS = ["Easy", "Medium", "Hard"] as const;

export const RECIPE_MEDIA_KEYS = ["youtubeUrl", "floatingYoutubeUrl", "youtube"] as const;

export const RECIPE_OVERVIEW_KEYS = [
  "difficulty",
  "prepMinutes",
  "bakeMinutes",
  "restMinutes",
  "utensils",
] as const;

export const CORE_VALUE_KEYS = [
  "image",
  "imageAlt",
  "youtubeUrl",
  "floatingYoutubeUrl",
  "youtube",
  "intro",
  "whyItWorks",
  "keyIngredients",
  "tips",
  "faqs",
  "difficulty",
  "prepMinutes",
  "bakeMinutes",
  "restMinutes",
  "utensils",
  "cookMinutes",
  "servings",
  "servingsUnit",
  "course",
  "method",
  "holiday",
  "cuisine",
  "tags",
  "ingredients",
  "instructions",
  "notes",
  "nutrition",
] as const;

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function keyFromLabel(label: string) {
  const parts = slugify(label).split("-").filter(Boolean);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  return first + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

export function emptyValue(kind: string) {
  switch (kind) {
    case "number":
    case "minutes":
      return 0;
    case "boolean":
      return false;
    case "gallery":
    case "list":
    case "tags":
      return [];
    case "ingredients":
      return [{ name: "", items: [{ item: "", amount: "", notes: "" }] }];
    case "instructions":
      return [{ name: "", steps: [""] }];
    case "namedNotes":
      return [{ name: "", note: "" }];
    case "nutrition":
      return { calories: 0, carbs: 0, protein: 0, fat: 0 };
    default:
      return "";
  }
}

export const CORE_FIELDS: FieldDefinition[] = [
  { key: "image", label: "Hero image", kind: "image", required: true },
  { key: "imageAlt", label: "Image description", kind: "text", required: true },
  {
    key: "youtubeUrl",
    label: "Main YouTube video",
    kind: "text",
    helpText: "Shown in the recipe article under the hero image.",
  },
  {
    key: "floatingYoutubeUrl",
    label: "Floating YouTube video (legacy)",
    kind: "text",
    helpText: "Deprecated — the site now uses the main recipe video with a contextual floating card.",
  },
  {
    key: "youtube",
    label: "YouTube metadata (JSON)",
    kind: "textarea",
    helpText:
      "Optional rich data: hook, videoCtaDescription, duration, playlistUrl, timestamps[], relatedVideos[]. Main video URL still uses the field above.",
  },
  { key: "intro", label: "Introduction", kind: "textarea", required: true },
  { key: "whyItWorks", label: "Why this works", kind: "textarea" },
  { key: "keyIngredients", label: "Key ingredients", kind: "namedNotes" },
  { key: "tips", label: "Studio tips", kind: "list" },
  { key: "faqs", label: "Frequently asked", kind: "namedNotes" },
  {
    key: "difficulty",
    label: "Difficulty",
    kind: "select",
    required: true,
    options: [...DIFFICULTY_OPTIONS],
    helpText: "Shown above the recipe times.",
  },
  { key: "prepMinutes", label: "Preparation time", kind: "minutes", required: true },
  { key: "bakeMinutes", label: "Baking time", kind: "minutes", helpText: "Oven time. Use 0 if the recipe is not baked." },
  { key: "restMinutes", label: "Resting time", kind: "minutes", helpText: "Chill, proof, or rest. Use 0 if none." },
  { key: "utensils", label: "Utensils", kind: "list", helpText: "Bowls, pans, mixers, and other tools." },
  { key: "servings", label: "Servings", kind: "number", required: true },
  { key: "servingsUnit", label: "Servings unit", kind: "text" },
  { key: "course", label: "Course", kind: "text" },
  { key: "method", label: "Method", kind: "text" },
  { key: "holiday", label: "Season / holiday", kind: "text" },
  { key: "cuisine", label: "Cuisine", kind: "text" },
  { key: "tags", label: "Tags", kind: "tags" },
  { key: "ingredients", label: "Ingredients", kind: "ingredients", required: true },
  { key: "instructions", label: "Instructions", kind: "instructions", required: true },
  { key: "notes", label: "Notes", kind: "list" },
  { key: "nutrition", label: "Nutrition", kind: "nutrition" },
];
