import { parseRecipeAiMeta, type RecipeAiMeta } from "@/lib/ai-recipe/types";
import { evaluateRecipeFields } from "@/lib/recipe-editor-field-state";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";

export type StaffVerifyValidation = {
  ok: boolean;
  blockingMissing: number;
  needsReview: number;
  message?: string;
};

export function validateStaffVerification(input: {
  title: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  fields: SchemaField[];
  aiMeta: RecipeAiMeta | null;
}): StaffVerifyValidation {
  const editorFields = input.fields.map((field) => ({
    key: field.key,
    label: field.label,
    kind: field.kind,
    required: field.required,
  }));

  const evaluation = evaluateRecipeFields({
    fields: editorFields,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
    values: input.values,
    aiMeta: input.aiMeta,
    typeFields: input.fields,
  });

  if (evaluation.counts.blockingMissing > 0) {
    return {
      ok: false,
      blockingMissing: evaluation.counts.blockingMissing,
      needsReview: evaluation.counts.needsReview,
      message: "Resolve all required missing fields before verifying this recipe.",
    };
  }

  return {
    ok: true,
    blockingMissing: 0,
    needsReview: evaluation.counts.needsReview,
  };
}

export function applyServerStaffVerification(input: {
  aiMetaRaw: string;
  previousAiMetaRaw: string | null | undefined;
  staffIdentity: string;
  title: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  fields: SchemaField[];
}): { aiMeta: string; rejected: boolean; message?: string } {
  let parsed = parseRecipeAiMeta(input.aiMetaRaw);
  const previous = parseRecipeAiMeta(input.previousAiMetaRaw);

  if (!parsed || parsed.verificationStatus !== "verified") {
    return { aiMeta: input.aiMetaRaw, rejected: false };
  }

  const wasVerified = previous?.verificationStatus === "verified";
  if (wasVerified) {
    return {
      aiMeta: JSON.stringify({
        ...parsed,
        verifiedBy: previous?.verifiedBy ?? input.staffIdentity,
        verifiedAt: previous?.verifiedAt ?? parsed.verifiedAt,
      }),
      rejected: false,
    };
  }

  const validation = validateStaffVerification({
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
    values: input.values,
    fields: input.fields,
    aiMeta: parsed,
  });

  if (!validation.ok) {
    const reverted: RecipeAiMeta = {
      ...parsed,
      verificationStatus: "unverified",
      verifiedAt: undefined,
      verifiedBy: undefined,
    };
    return {
      aiMeta: JSON.stringify(reverted),
      rejected: true,
      message: validation.message,
    };
  }

  return {
    aiMeta: JSON.stringify({
      ...parsed,
      verificationStatus: "verified",
      verifiedAt: new Date().toISOString(),
      verifiedBy: input.staffIdentity,
    }),
    rejected: false,
  };
}
