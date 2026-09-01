/**
 * Editorial content corrections for published recipe values (DB `values` JSON).
 * Does not change public UI — only canonical recipe field data.
 *
 * Production apply uses planProductionRecipeContentPatch() compare-and-swap guards.
 * mergeProductionRecipeContentPatches() is for local seed only (unconditional).
 */

export type PatchFieldAction = "APPLY" | "SKIP" | "CONFLICT";

export type PatchFieldDecision = {
  field: string;
  currentValue: unknown;
  legacyBaseline: unknown;
  proposedValue: unknown;
  action: PatchFieldAction;
  reason: string;
};

export type RecipePatchPlan = {
  slug: string;
  decisions: PatchFieldDecision[];
};

export type PatchRunSummary = {
  recipesInspected: number;
  fieldsProposed: number;
  fieldsApplied: number;
  fieldsAlreadyCorrect: number;
  fieldsSkipped: number;
  fieldsConflict: number;
};

/** Known mismatched Unsplash heroes this pass replaces (exact URL match required to clear). */
export const LEGACY_MISMATCHED_STOCK_IMAGES: Record<string, string> = {
  "breakfast-tortillas":
    "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1600&q=80",
  "roasted-market-vegetables":
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1600&q=80",
};

export const PRODUCTION_RECIPE_VALUE_PATCHES: Record<string, Record<string, unknown>> = {
  "iced-horchata-coffee": {
    restMinutes: 240,
  },
  "herb-focaccia": {
    riseHours: 8,
    restMinutes: 75,
  },
  "lemon-sesame-bars": {
    restMinutes: 120,
  },
  "breakfast-tortillas": {
    image: "",
  },
  "roasted-market-vegetables": {
    image: "",
  },
};

export function patchedProductionRecipeSlugs(): string[] {
  return Object.keys(PRODUCTION_RECIPE_VALUE_PATCHES).sort();
}

export function isLegacyUnsetNumber(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number" && (Number.isNaN(value) || value === 0)) return true;
  return false;
}

function planImageClear(slug: string, current: unknown, proposed: unknown): PatchFieldDecision {
  const legacyUrl = LEGACY_MISMATCHED_STOCK_IMAGES[slug];
  const currentStr = String(current ?? "").trim();
  const baseline = legacyUrl ?? "";

  if (proposed !== "") {
    return {
      field: "image",
      currentValue: current,
      legacyBaseline: baseline,
      proposedValue: proposed,
      action: "CONFLICT",
      reason: "unsupported image patch shape",
    };
  }

  if (!legacyUrl) {
    return {
      field: "image",
      currentValue: current,
      legacyBaseline: baseline,
      proposedValue: proposed,
      action: "CONFLICT",
      reason: "no legacy mismatched stock URL registered for slug",
    };
  }

  if (currentStr === "") {
    return {
      field: "image",
      currentValue: current,
      legacyBaseline: legacyUrl,
      proposedValue: proposed,
      action: "SKIP",
      reason: "already cleared",
    };
  }

  if (currentStr === legacyUrl) {
    return {
      field: "image",
      currentValue: current,
      legacyBaseline: legacyUrl,
      proposedValue: proposed,
      action: "APPLY",
      reason: "matches legacy mismatched stock URL",
    };
  }

  return {
    field: "image",
    currentValue: current,
    legacyBaseline: legacyUrl,
    proposedValue: proposed,
    action: "CONFLICT",
    reason: "current image differs from legacy mismatched stock (blob, Mesa, or manual correction)",
  };
}

function planNumericField(
  field: string,
  current: unknown,
  proposed: unknown,
): PatchFieldDecision {
  const proposedNum = typeof proposed === "number" ? proposed : Number(proposed);
  const currentNum =
    typeof current === "number" ? current : current === null || current === undefined ? NaN : Number(current);

  if (!Number.isFinite(proposedNum)) {
    return {
      field,
      currentValue: current,
      legacyBaseline: 0,
      proposedValue: proposed,
      action: "CONFLICT",
      reason: "invalid proposed numeric value",
    };
  }

  if (Number.isFinite(currentNum) && currentNum === proposedNum) {
    return {
      field,
      currentValue: current,
      legacyBaseline: 0,
      proposedValue: proposed,
      action: "SKIP",
      reason: "already correct",
    };
  }

  if (isLegacyUnsetNumber(current)) {
    return {
      field,
      currentValue: current,
      legacyBaseline: 0,
      proposedValue: proposed,
      action: "APPLY",
      reason: "legacy unset or zero",
    };
  }

  return {
    field,
    currentValue: current,
    legacyBaseline: 0,
    proposedValue: proposed,
    action: "CONFLICT",
    reason: "nonzero editorial value differs from proposed correction",
  };
}

/** Compare-and-swap plan for one recipe slug. Returns null when slug is not targeted. */
export function planProductionRecipeContentPatch(
  slug: string,
  values: Record<string, unknown>,
): RecipePatchPlan | null {
  const patch = PRODUCTION_RECIPE_VALUE_PATCHES[slug];
  if (!patch) return null;

  const decisions: PatchFieldDecision[] = [];
  for (const [field, proposed] of Object.entries(patch)) {
    const current = values[field];
    if (field === "image") {
      decisions.push(planImageClear(slug, current, proposed));
    } else if (typeof proposed === "number") {
      decisions.push(planNumericField(field, current, proposed));
    } else {
      decisions.push({
        field,
        currentValue: current,
        legacyBaseline: null,
        proposedValue: proposed,
        action: "CONFLICT",
        reason: "unsupported field patch type",
      });
    }
  }

  return { slug, decisions };
}

export function summarizePatchPlans(plans: RecipePatchPlan[]): PatchRunSummary {
  const summary: PatchRunSummary = {
    recipesInspected: plans.length,
    fieldsProposed: 0,
    fieldsApplied: 0,
    fieldsAlreadyCorrect: 0,
    fieldsSkipped: 0,
    fieldsConflict: 0,
  };

  for (const plan of plans) {
    for (const decision of plan.decisions) {
      switch (decision.action) {
        case "APPLY":
          summary.fieldsProposed += 1;
          break;
        case "SKIP":
          if (decision.reason === "already correct") {
            summary.fieldsAlreadyCorrect += 1;
          } else {
            summary.fieldsSkipped += 1;
          }
          break;
        case "CONFLICT":
          summary.fieldsConflict += 1;
          break;
      }
    }
  }

  return summary;
}

/** Apply only APPLY decisions; SKIP and CONFLICT values are preserved. */
export function applyProductionRecipeContentPatchPlan(
  values: Record<string, unknown>,
  plan: RecipePatchPlan,
): Record<string, unknown> {
  const out = { ...values };
  for (const decision of plan.decisions) {
    if (decision.action === "APPLY") {
      out[decision.field] = decision.proposedValue;
    }
  }
  return out;
}

/** Unconditional merge for local seed from static catalog (not for production apply). */
export function mergeProductionRecipeContentPatches(
  slug: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const patch = PRODUCTION_RECIPE_VALUE_PATCHES[slug];
  if (!patch) return values;
  return { ...values, ...patch };
}

export function countAppliedFields(plans: RecipePatchPlan[]): number {
  return plans.reduce(
    (count, plan) => count + plan.decisions.filter((d) => d.action === "APPLY").length,
    0,
  );
}
