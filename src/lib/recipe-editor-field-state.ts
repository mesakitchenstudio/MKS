import { nutritionHasPublicContent } from "@/lib/field-content";
import {
  fieldNeedsHumanReview,
  isFieldLocked,
  isFieldProtectedFromBulkAi,
  resolveFieldReviewState,
  resolveActiveFieldSource,
  type AttentionLevel,
  type FieldCompleteness,
  type FieldReviewState,
  type FieldSource,
} from "@/lib/ai-recipe/field-state";
import {
  getRecipeFieldAiDef,
  isRecipeFieldAiSupported,
  recipeFieldIsEmpty,
  type FieldAiStrategy,
} from "@/lib/ai-recipe/field-ai-registry";
import type { RecipeAiMeta } from "@/lib/ai-recipe/types";
import type { SchemaField } from "@/lib/ai-recipe/schema-version";
import {
  isRequiredFieldSatisfied,
  sectionForFieldKey,
  type EditorFieldShape,
  type EditorSectionId,
} from "@/lib/recipe-editor-completeness";

export type FieldNodeState = {
  path: string;
  /** Navigable editor key for scroll/focus (may be top-level or granular). */
  key: string;
  label: string;
  section: EditorSectionId;
  kind: string;
  completeness: FieldCompleteness;
  required: boolean;
  /** Blocks publish and staff verification when true and incomplete. */
  blocking: boolean;
  attentionLevel: AttentionLevel;
  source?: FieldSource;
  reviewState: FieldReviewState;
  needsReview: boolean;
  aiFillEligible: boolean;
  aiStrategy?: FieldAiStrategy | "none" | "source_owned";
};

export type RecipeFieldEvaluation = {
  nodes: FieldNodeState[];
  counts: {
    blockingMissing: number;
    needsReview: number;
    fromVideo: number;
    confirmed: number;
    aiFillableEmpty: number;
  };
};

type EvalInput = {
  fields: EditorFieldShape[];
  title: string;
  excerpt: string;
  categoryIds: string[];
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
  resolveSection?: (key: string) => EditorSectionId;
};

function pushNode(nodes: FieldNodeState[], node: FieldNodeState) {
  nodes.push(node);
}

function navigableKeyFromPath(path: string): string {
  if (path === "title" || path === "excerpt" || path === "categoryIds") return path;
  if (path.startsWith("values.")) {
    const rest = path.slice("values.".length);
    const top = rest.split(".")[0] ?? rest;
    return top;
  }
  return path;
}

function buildScalarNode(input: {
  path: string;
  key: string;
  label: string;
  kind: string;
  section: EditorSectionId;
  required: boolean;
  value: unknown;
  title: string;
  excerpt: string;
  categoryIds: string[];
  aiMeta?: RecipeAiMeta | null;
  typeFields: SchemaField[];
}): FieldNodeState {
  const empty = recipeFieldIsEmpty({
    path: input.path,
    kind: input.kind,
    value: input.value,
    title: input.title,
    excerpt: input.excerpt,
    categoryIds: input.categoryIds,
  });
  const required = input.required;
  const attentionLevel: AttentionLevel = required
    ? "required"
    : isRecipeFieldAiSupported(input.path, input.typeFields)
      ? "recommended"
      : "optional";
  const blocking = required && (empty || !isRequiredFieldSatisfied(
    { key: input.key, label: input.label, kind: input.kind, required: true },
    input.path === "title" ? input.title : input.value,
  ));
  const completeness: FieldCompleteness = empty ? "missing" : "filled";
  const def = getRecipeFieldAiDef(input.path, input.typeFields);
  const locked = isFieldLocked(input.path, input.aiMeta);
  const aiFillEligible =
    Boolean(def) &&
    isRecipeFieldAiSupported(input.path, input.typeFields) &&
    empty &&
    !locked;

  return {
    path: input.path,
    key: input.key,
    label: input.label,
    section: input.section,
    kind: input.kind,
    completeness,
    required,
    blocking,
    attentionLevel,
    source: resolveActiveFieldSource(input.path, input.aiMeta, empty),
    reviewState: resolveFieldReviewState(input.path, input.aiMeta),
    needsReview: fieldNeedsHumanReview({ path: input.path, meta: input.aiMeta, isEmpty: empty }),
    aiFillEligible,
    aiStrategy: def?.strategy,
  };
}

function expandNamedNotesNodes(input: {
  pathPrefix: string;
  key: string;
  label: string;
  section: EditorSectionId;
  rows: { name?: string; note?: string }[];
  required: boolean;
  aiMeta?: RecipeAiMeta | null;
  typeFields: SchemaField[];
  nameLabel?: string;
  noteLabel?: string;
}): FieldNodeState[] {
  const nodes: FieldNodeState[] = [];
  const def = getRecipeFieldAiDef(`values.${input.key}`, input.typeFields);

  input.rows.forEach((row, index) => {
    const hasQuestion = Boolean(String(row.name ?? "").trim());
    const hasAnswer = Boolean(String(row.note ?? "").trim());
    const namePath = `${input.pathPrefix}.${index}.name`;
    const notePath = `${input.pathPrefix}.${index}.note`;
    const rowLabel = hasQuestion ? `${input.label}: ${row.name}` : `${input.label} ${index + 1}`;

    if (!hasQuestion && !hasAnswer) return;

    if (hasQuestion && !hasAnswer) {
      nodes.push({
        path: notePath,
        key: input.key,
        label: `${rowLabel} — ${input.noteLabel ?? "answer"}`,
        section: input.section,
        kind: "namedNotes",
        completeness: "partial",
        required: false,
        blocking: false,
        attentionLevel: "recommended",
        source: resolveActiveFieldSource(notePath, input.aiMeta, true),
        reviewState: resolveFieldReviewState(notePath, input.aiMeta),
        needsReview: fieldNeedsHumanReview({ path: notePath, meta: input.aiMeta, isEmpty: true }),
        aiFillEligible:
          Boolean(def) &&
          !isFieldProtectedFromBulkAi(notePath, input.aiMeta),
        aiStrategy: def?.strategy,
      });
    }

    if (!hasQuestion && hasAnswer) {
      nodes.push({
        path: namePath,
        key: input.key,
        label: `${input.label} ${index + 1} — ${input.nameLabel ?? "question"}`,
        section: input.section,
        kind: "namedNotes",
        completeness: "partial",
        required: false,
        blocking: false,
        attentionLevel: "recommended",
        source: resolveActiveFieldSource(namePath, input.aiMeta, true),
        reviewState: resolveFieldReviewState(namePath, input.aiMeta),
        needsReview: fieldNeedsHumanReview({ path: namePath, meta: input.aiMeta, isEmpty: true }),
        aiFillEligible:
          Boolean(def) &&
          !isFieldProtectedFromBulkAi(namePath, input.aiMeta),
        aiStrategy: def?.strategy,
      });
    }
  });

  return nodes;
}

function expandInstructionNodes(input: {
  sections: { name?: string; steps?: string[] }[];
  section: EditorSectionId;
  aiMeta?: RecipeAiMeta | null;
  typeFields: SchemaField[];
}): FieldNodeState[] {
  const nodes: FieldNodeState[] = [];

  input.sections.forEach((group, groupIndex) => {
    const hasSteps = (group.steps ?? []).some((step) => String(step ?? "").trim());
    const hasName = Boolean(String(group.name ?? "").trim());
    const namePath = `values.instructions.${groupIndex}.name`;
    const sectionLabel = hasName ? String(group.name) : `Section ${groupIndex + 1}`;

    if (hasSteps && !hasName) {
      nodes.push({
        path: namePath,
        key: "instructions",
        label: `${sectionLabel} — section title`,
        section: input.section,
        kind: "instructions",
        completeness: "partial",
        required: false,
        blocking: false,
        attentionLevel: "recommended",
        source: resolveActiveFieldSource(namePath, input.aiMeta, true),
        reviewState: resolveFieldReviewState(namePath, input.aiMeta),
        needsReview: false,
        aiFillEligible: !isFieldProtectedFromBulkAi(namePath, input.aiMeta),
        aiStrategy: "gemini_semantic",
      });
    }

    (group.steps ?? []).forEach((step, stepIndex) => {
      const stepPath = `values.instructions.${groupIndex}.steps.${stepIndex}`;
      const empty = !String(step ?? "").trim();
      if (!empty) return;
      const priorStepsFilled = (group.steps ?? [])
        .slice(0, stepIndex)
        .some((prior) => String(prior ?? "").trim());
      if (!priorStepsFilled && stepIndex > 0) return;
      nodes.push({
        path: stepPath,
        key: "instructions",
        label: `${sectionLabel} — step ${stepIndex + 1}`,
        section: input.section,
        kind: "instructions",
        completeness: "missing",
        required: false,
        blocking: false,
        attentionLevel: "recommended",
        source: resolveActiveFieldSource(stepPath, input.aiMeta, true),
        reviewState: resolveFieldReviewState(stepPath, input.aiMeta),
        needsReview: false,
        aiFillEligible: !isFieldProtectedFromBulkAi(stepPath, input.aiMeta),
        aiStrategy: "gemini_semantic",
      });
    });
  });

  return nodes;
}

function expandIngredientNodes(input: {
  groups: { name?: string; items?: { item?: string; amount?: string; notes?: string }[] }[];
  section: EditorSectionId;
  aiMeta?: RecipeAiMeta | null;
  typeFields: SchemaField[];
}): FieldNodeState[] {
  const nodes: FieldNodeState[] = [];

  input.groups.forEach((group, groupIndex) => {
    const hasItems = (group.items ?? []).some(
      (row) =>
        String(row.amount ?? "").trim() ||
        String(row.item ?? "").trim() ||
        String(row.notes ?? "").trim(),
    );
    const hasName = Boolean(String(group.name ?? "").trim());
    const namePath = `values.ingredients.${groupIndex}.name`;
    const groupLabel = hasName ? String(group.name) : `Group ${groupIndex + 1}`;

    if (hasItems && !hasName && input.groups.length > 1) {
      const anyNamedGroup = input.groups.some((entry) => Boolean(String(entry.name ?? "").trim()));
      // Only recommend titles when the recipe already uses named sections.
      // All-unnamed multi-group stacks are a structure smell, not N missing titles.
      if (anyNamedGroup) {
      nodes.push({
        path: namePath,
        key: "ingredients",
        label: `${groupLabel} — group title`,
        section: input.section,
        kind: "ingredients",
        completeness: "partial",
        required: false,
        blocking: false,
        attentionLevel: "recommended",
        source: resolveActiveFieldSource(namePath, input.aiMeta, true),
        reviewState: resolveFieldReviewState(namePath, input.aiMeta),
        needsReview: false,
        aiFillEligible: !isFieldProtectedFromBulkAi(namePath, input.aiMeta),
        aiStrategy: "gemini_semantic",
      });
      }
    }

    (group.items ?? []).forEach((row, rowIndex) => {
      const cells = [
        { key: "amount", label: "amount", value: row.amount },
        { key: "item", label: "ingredient", value: row.item },
        { key: "notes", label: "notes", value: row.notes },
      ] as const;
      const rowHasContent = cells.some((cell) => String(cell.value ?? "").trim());
      if (!rowHasContent) return;

      for (const cell of cells) {
        if (String(cell.value ?? "").trim()) continue;
        const cellPath = `values.ingredients.${groupIndex}.items.${rowIndex}.${cell.key}`;
        nodes.push({
          path: cellPath,
          key: "ingredients",
          label: `${groupLabel} — row ${rowIndex + 1} ${cell.label}`,
          section: input.section,
          kind: "ingredients",
          completeness: "partial",
          required: false,
          blocking: false,
          attentionLevel: "recommended",
          source: resolveActiveFieldSource(cellPath, input.aiMeta, true),
          reviewState: resolveFieldReviewState(cellPath, input.aiMeta),
          needsReview: false,
          aiFillEligible: !isFieldProtectedFromBulkAi(cellPath, input.aiMeta),
          aiStrategy: "gemini_semantic",
        });
      }
    });
  });

  return nodes;
}

/** Central evaluator for completeness, review, and AI-fill eligibility. */
export function evaluateRecipeFields(input: EvalInput & { typeFields?: SchemaField[] }): RecipeFieldEvaluation {
  const nodes: FieldNodeState[] = [];
  const sectionFor = input.resolveSection ?? sectionForFieldKey;
  const typeFields = input.typeFields ?? input.fields;

  if (!String(input.title ?? "").trim()) {
    pushNode(
      nodes,
      buildScalarNode({
        path: "title",
        key: "title",
        label: "Title",
        kind: "text",
        section: "basics",
        required: true,
        value: input.title,
        title: input.title,
        excerpt: input.excerpt,
        categoryIds: input.categoryIds,
        aiMeta: input.aiMeta,
        typeFields,
      }),
    );
  }

  const basicsScalars = [
    { path: "excerpt", key: "excerpt", label: "Excerpt", kind: "textarea", required: false },
    { path: "categoryIds", key: "categoryIds", label: "Categories", kind: "categories", required: false },
  ] as const;

  for (const basic of basicsScalars) {
    const value = basic.path === "excerpt" ? input.excerpt : input.categoryIds;
    const empty = recipeFieldIsEmpty({
      path: basic.path,
      kind: basic.kind,
      value,
      title: input.title,
      excerpt: input.excerpt,
      categoryIds: input.categoryIds,
    });
    if (empty && isRecipeFieldAiSupported(basic.path, typeFields)) {
      pushNode(
        nodes,
        buildScalarNode({
          path: basic.path,
          key: basic.key,
          label: basic.label,
          kind: basic.kind,
          section: "basics",
          required: false,
          value,
          title: input.title,
          excerpt: input.excerpt,
          categoryIds: input.categoryIds,
          aiMeta: input.aiMeta,
          typeFields,
        }),
      );
    } else if (
      !empty &&
      input.aiMeta?.confidenceByPath?.[basic.path]?.confidence === "UNKNOWN" &&
      !isFieldProtectedFromBulkAi(basic.path, input.aiMeta)
    ) {
      pushNode(nodes, {
        path: basic.path,
        key: basic.key,
        label: basic.label,
        section: "basics",
        kind: basic.kind,
        completeness: "filled",
        required: false,
        blocking: false,
        attentionLevel: "recommended",
        source: resolveActiveFieldSource(basic.path, input.aiMeta, false),
        reviewState: resolveFieldReviewState(basic.path, input.aiMeta),
        needsReview: true,
        aiFillEligible: true,
        aiStrategy: getRecipeFieldAiDef(basic.path, typeFields)?.strategy,
      });
    }
  }

  for (const field of input.fields) {
    const path = field.key === "title" ? "title" : `values.${field.key}`;
    const value = field.key === "title" ? input.title : input.values[field.key];
    const section = sectionFor(field.key);

    if (field.key === "faqs" || field.key === "keyIngredients") {
      const rows = Array.isArray(value) ? (value as { name?: string; note?: string }[]) : [];
      nodes.push(
        ...expandNamedNotesNodes({
          pathPrefix: `values.${field.key}`,
          key: field.key,
          label: field.label,
          section,
          rows,
          required: field.required,
          aiMeta: input.aiMeta,
          typeFields,
          nameLabel: field.key === "faqs" ? "question" : "ingredient",
          noteLabel: field.key === "faqs" ? "answer" : "why it matters",
        }),
      );
      if (field.required && !isRequiredFieldSatisfied(field, value)) {
        pushNode(
          nodes,
          buildScalarNode({
            path,
            key: field.key,
            label: field.label,
            kind: field.kind,
            section,
            required: true,
            value,
            title: input.title,
            excerpt: input.excerpt,
            categoryIds: input.categoryIds,
            aiMeta: input.aiMeta,
            typeFields,
          }),
        );
      }
      continue;
    }

    if (field.key === "ingredients") {
      const groups = Array.isArray(value)
        ? (value as { name?: string; items?: { item?: string; amount?: string; notes?: string }[] }[])
        : [];
      nodes.push(
        ...expandIngredientNodes({
          groups,
          section,
          aiMeta: input.aiMeta,
          typeFields,
        }),
      );
      if (field.required && !isRequiredFieldSatisfied(field, value)) {
        pushNode(
          nodes,
          buildScalarNode({
            path,
            key: field.key,
            label: field.label,
            kind: field.kind,
            section,
            required: true,
            value,
            title: input.title,
            excerpt: input.excerpt,
            categoryIds: input.categoryIds,
            aiMeta: input.aiMeta,
            typeFields,
          }),
        );
      }
      continue;
    }

    if (field.key === "instructions") {
      const sections = Array.isArray(value) ? (value as { name?: string; steps?: string[] }[]) : [];
      nodes.push(
        ...expandInstructionNodes({
          sections,
          section,
          aiMeta: input.aiMeta,
          typeFields,
        }),
      );
      if (field.required && !isRequiredFieldSatisfied(field, value)) {
        pushNode(
          nodes,
          buildScalarNode({
            path,
            key: field.key,
            label: field.label,
            kind: field.kind,
            section,
            required: true,
            value,
            title: input.title,
            excerpt: input.excerpt,
            categoryIds: input.categoryIds,
            aiMeta: input.aiMeta,
            typeFields,
          }),
        );
      }
      continue;
    }

    if (field.key === "nutrition") {
      const empty = !nutritionHasPublicContent(value);
      if (field.required && empty) {
        pushNode(
          nodes,
          buildScalarNode({
            path,
            key: field.key,
            label: field.label,
            kind: field.kind,
            section,
            required: true,
            value,
            title: input.title,
            excerpt: input.excerpt,
            categoryIds: input.categoryIds,
            aiMeta: input.aiMeta,
            typeFields,
          }),
        );
      } else if (empty && isRecipeFieldAiSupported(path, typeFields)) {
        pushNode(
          nodes,
          buildScalarNode({
            path,
            key: field.key,
            label: field.label,
            kind: field.kind,
            section,
            required: false,
            value,
            title: input.title,
            excerpt: input.excerpt,
            categoryIds: input.categoryIds,
            aiMeta: input.aiMeta,
            typeFields,
          }),
        );
      }
      continue;
    }

    const empty = recipeFieldIsEmpty({
      path,
      kind: field.kind,
      value,
      title: input.title,
      excerpt: input.excerpt,
      categoryIds: input.categoryIds,
    });

    if (field.required && empty) {
      pushNode(
        nodes,
        buildScalarNode({
          path,
          key: field.key,
          label: field.label,
          kind: field.kind,
          section,
          required: true,
          value,
          title: input.title,
          excerpt: input.excerpt,
          categoryIds: input.categoryIds,
          aiMeta: input.aiMeta,
          typeFields,
        }),
      );
    } else if (!field.required && empty && isRecipeFieldAiSupported(path, typeFields)) {
      pushNode(
        nodes,
        buildScalarNode({
          path,
          key: field.key,
          label: field.label,
          kind: field.kind,
          section,
          required: false,
          value,
          title: input.title,
          excerpt: input.excerpt,
          categoryIds: input.categoryIds,
          aiMeta: input.aiMeta,
          typeFields,
        }),
      );
    } else if (
      !empty &&
      input.aiMeta?.confidenceByPath?.[path]?.confidence === "UNKNOWN" &&
      !isFieldProtectedFromBulkAi(path, input.aiMeta)
    ) {
      pushNode(nodes, {
        path,
        key: field.key,
        label: field.label,
        section,
        kind: field.kind,
        completeness: "filled",
        required: field.required,
        blocking: false,
        attentionLevel: field.required ? "required" : "recommended",
        source: resolveActiveFieldSource(path, input.aiMeta, false),
        reviewState: resolveFieldReviewState(path, input.aiMeta),
        needsReview: false,
        aiFillEligible: true,
        aiStrategy: getRecipeFieldAiDef(path, typeFields)?.strategy,
      });
    } else if (!empty && fieldNeedsHumanReview({ path, meta: input.aiMeta, isEmpty: false })) {
      pushNode(nodes, {
        path,
        key: field.key,
        label: field.label,
        section,
        kind: field.kind,
        completeness: "filled",
        required: field.required,
        blocking: false,
        attentionLevel: field.required ? "required" : "recommended",
        source: resolveActiveFieldSource(path, input.aiMeta, false),
        reviewState: resolveFieldReviewState(path, input.aiMeta),
        needsReview: true,
        aiFillEligible: false,
        aiStrategy: getRecipeFieldAiDef(path, typeFields)?.strategy,
      });
    }
  }

  const blockingMissing = nodes.filter((node) => node.blocking).length;
  const needsReview = nodes.filter((node) => node.needsReview).length;
  const fromVideo = nodes.filter((node) => node.source === "from_video" && node.completeness === "filled").length;
  const confirmed = nodes.filter((node) => node.reviewState === "confirmed").length;
  const aiFillableEmpty = nodes.filter((node) => node.aiFillEligible).length;

  return {
    nodes,
    counts: { blockingMissing, needsReview, fromVideo, confirmed, aiFillableEmpty },
  };
}

export function blockingMissingNodes(evaluation: RecipeFieldEvaluation): FieldNodeState[] {
  return evaluation.nodes.filter((node) => node.blocking);
}

export function reviewNodes(evaluation: RecipeFieldEvaluation): FieldNodeState[] {
  return evaluation.nodes.filter((node) => node.needsReview);
}

export function aiFillNodes(evaluation: RecipeFieldEvaluation): FieldNodeState[] {
  return evaluation.nodes.filter((node) => node.aiFillEligible);
}

export function navigableKeyForNode(node: FieldNodeState): string {
  return navigableKeyFromPath(node.path);
}
