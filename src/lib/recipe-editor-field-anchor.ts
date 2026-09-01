import { slugify } from "@/lib/fields";

/** Stable URL hash / DOM id for a top-level recipe editor field, e.g. `#field-holiday`. */
export function recipeFieldAnchorId(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
  return `field-${slugify(spaced)}`;
}

/** DOM id for granular nested paths, e.g. `values.instructions.0.steps.1` → `field-instructions-0-steps-1`. */
export function recipeGranularAnchorId(path: string): string {
  if (path === "title" || path === "excerpt" || path === "categoryIds") {
    return recipeFieldAnchorId(path);
  }
  const normalized = path.startsWith("values.") ? path.slice("values.".length) : path;
  const segments = normalized.split(".").map((segment) => slugify(segment.replace(/_/g, "-")));
  return `field-${segments.join("-")}`;
}

/** Resolve the DOM anchor id for any evaluator path (top-level or nested). */
export function recipeEditorAnchorId(path: string, fallbackKey?: string): string {
  if (!path.includes(".") || path === "categoryIds") {
    const key =
      path === "title" || path === "excerpt" || path === "categoryIds"
        ? path
        : path.startsWith("values.")
          ? path.slice("values.".length).split(".")[0] ?? fallbackKey ?? path
          : fallbackKey ?? path;
    return recipeFieldAnchorId(key);
  }
  return recipeGranularAnchorId(path);
}

export type GranularPathHints = {
  topKey: string;
  instructionGroupIndex?: number;
  instructionStepIndex?: number;
  faqIndex?: number;
  faqField?: "name" | "note";
  keyIngredientIndex?: number;
  keyIngredientField?: "name" | "note";
  ingredientGroupIndex?: number;
  ingredientRowIndex?: number;
  ingredientCell?: "amount" | "item" | "notes";
};

/** Parse nested editor paths for accordion expansion and focus targets. */
export function parseGranularEditorPath(path: string): GranularPathHints {
  const topKey =
    path === "title" || path === "excerpt" || path === "categoryIds"
      ? path
      : path.startsWith("values.")
        ? path.slice("values.".length).split(".")[0] ?? ""
        : path.split(".")[0] ?? "";

  const instructionSection = path.match(/^values\.instructions\.(\d+)\.name$/);
  if (instructionSection) {
    return { topKey: "instructions", instructionGroupIndex: Number(instructionSection[1]) };
  }

  const instructionStep = path.match(/^values\.instructions\.(\d+)\.steps\.(\d+)$/);
  if (instructionStep) {
    return {
      topKey: "instructions",
      instructionGroupIndex: Number(instructionStep[1]),
      instructionStepIndex: Number(instructionStep[2]),
    };
  }

  const faqChild = path.match(/^values\.faqs\.(\d+)\.(name|note)$/);
  if (faqChild) {
    return {
      topKey: "faqs",
      faqIndex: Number(faqChild[1]),
      faqField: faqChild[2] as "name" | "note",
    };
  }

  const keyIngredientChild = path.match(/^values\.keyIngredients\.(\d+)\.(name|note)$/);
  if (keyIngredientChild) {
    return {
      topKey: "keyIngredients",
      keyIngredientIndex: Number(keyIngredientChild[1]),
      keyIngredientField: keyIngredientChild[2] as "name" | "note",
    };
  }

  const ingredientCell = path.match(/^values\.ingredients\.(\d+)\.items\.(\d+)\.(amount|item|notes)$/);
  if (ingredientCell) {
    return {
      topKey: "ingredients",
      ingredientGroupIndex: Number(ingredientCell[1]),
      ingredientRowIndex: Number(ingredientCell[2]),
      ingredientCell: ingredientCell[3] as "amount" | "item" | "notes",
    };
  }

  const ingredientGroupName = path.match(/^values\.ingredients\.(\d+)\.name$/);
  if (ingredientGroupName) {
    return { topKey: "ingredients", ingredientGroupIndex: Number(ingredientGroupName[1]) };
  }

  return { topKey };
}
