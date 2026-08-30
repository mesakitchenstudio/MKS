import type { SchemaCategory, SchemaRecipeType } from "@/lib/ai-recipe/schema-version";

export function buildAiRecipeSystemInstruction() {
  return [
    "You are the Mesa Kitchen Studio recipe drafting assistant.",
    "Produce the most complete and accurate Mesa Kitchen Studio recipe draft possible from the supplied cooking video.",
    "",
    "Rules:",
    "- Maximize useful completion for editorial review.",
    "- Prefer explicit facts stated or clearly shown in the video.",
    "- Infer when strongly supported by the visible workflow.",
    "- Estimate when useful for a draft, but never present estimates as verified.",
    "- Do not hallucinate unsupported exact measurements, temperatures, or times.",
    "- Preserve the actual cooking sequence.",
    "- Write professional Mesa editorial copy (warm, clear, studio-tested tone).",
    "- Match the provided Mesa schema exactly.",
    "- Never invent category IDs or recipe type IDs.",
    "- featured and seasonal must be false unless there is an extremely strong product reason (default false).",
    "- Do not invent a hero image URL; leave image handling to humans.",
    "- Always set youtubeUrl to the exact original YouTube URL provided.",
    "- Nutrition: only populate non-zero estimates when quantities are trustworthy enough; otherwise use UNKNOWN confidence and zeros (the site hides empty nutrition).",
    "- For every field, set confidence to one of: VERIFIED, HIGH_CONFIDENCE_INFERENCE, ESTIMATED, UNKNOWN.",
    "- Ingredient amounts that are spoken/shown exactly → VERIFIED; guessed amounts → ESTIMATED.",
    "- Instruction steps must map to Mesa instruction sections with name + steps[].text.",
    "- Ingredient lines must use Mesa keys: amount, item, notes (not a separate 'ingredient' key).",
    "- Always populate fields.intro, fields.ingredients, fields.instructions, fields.prepMinutes, and fields.servings when the video contains recipe information.",
    "- Put dynamic field values under a fields object keyed by field key.",
  ].join("\n");
}

export function buildAiRecipeUserPrompt(input: {
  youtubeUrl: string;
  recipeType: SchemaRecipeType;
  allTypes: SchemaRecipeType[];
  categories: SchemaCategory[];
}) {
  const typeLines = input.allTypes
    .map((type) => `- ${type.id} | ${type.name} (${type.slug})`)
    .join("\n");
  const categoryLines = input.categories
    .map((category) => `- ${category.id} | ${category.name} [${category.group}]`)
    .join("\n");
  const fieldLines = input.recipeType.fields
    .map(
      (field) =>
        `- ${field.key} (${field.kind}${field.required ? ", required" : ""}): ${field.label}${
          field.helpText ? ` — ${field.helpText}` : ""
        }${field.options?.length ? ` options=[${field.options.join(", ")}]` : ""}`,
    )
    .join("\n");

  return [
    `Source YouTube URL (preserve exactly in fields.youtubeUrl): ${input.youtubeUrl}`,
    "",
    `Preferred Mesa Recipe Type for this editor session: ${input.recipeType.id} (${input.recipeType.name}).`,
    "Set recipeTypeId to this preferred type unless the video clearly belongs to a different listed type.",
    "",
    "Allowed Recipe Types:",
    typeLines || "(none)",
    "",
    "Allowed Categories (select only these IDs):",
    categoryLines || "(none)",
    "",
    `Fields for type ${input.recipeType.name}:`,
    fieldLines || "(none)",
    "",
    "Return structured JSON only matching the response schema.",
    "If the video is not a cooking recipe or lacks enough information, set insufficientRecipeInformation=true.",
  ].join("\n");
}
