"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { saveRecipeAction } from "@/app/admin/actions";
import { AiConfidenceBadge } from "@/components/admin/AiConfidenceBadge";
import {
  AiRecipeAssistant,
  type AiGenerateApplyPayload,
  type AiTargetedFillApplyPayload,
} from "@/components/admin/AiRecipeAssistant";
import { DeleteRecipeButton } from "@/components/admin/DeleteRecipeButton";
import { EditorIssueNavigator } from "@/components/admin/EditorIssueNavigator";
import { EditorDragHandle, EditorRowActions } from "@/components/admin/EditorRowActions";
import { EditorStickyActionBar } from "@/components/admin/EditorStickyActionBar";
import { FaqAccordionEditor } from "@/components/admin/FaqAccordionEditor";
import { FieldOverflowMenu } from "@/components/admin/FieldOverflowMenu";
import { InstructionsAccordionEditor } from "@/components/admin/InstructionsAccordionEditor";
import { InstructionsVideoVerificationLayout } from "@/components/admin/InstructionsVideoVerificationLayout";
import { KeyIngredientsCompactEditor } from "@/components/admin/KeyIngredientsCompactEditor";
import { StudioTipsCompactEditor } from "@/components/admin/StudioTipsCompactEditor";
import { UtensilsChipEditor } from "@/components/admin/UtensilsChipEditor";
import { FieldAiFieldActions } from "@/components/admin/FieldAiFieldActions";
import { FieldAiSuggestionPanel } from "@/components/admin/FieldAiSuggestionPanel";
import { MissingRequiredFieldFrame } from "@/components/admin/MissingRequiredFieldFrame";
import { SectionCompletenessBanner } from "@/components/admin/SectionCompletenessBanner";
import { TagsChipEditor } from "@/components/admin/TagsChipEditor";
import { YoutubeMetadataEditor } from "@/components/admin/YoutubeMetadataEditor";
import { RecipeYoutubeConnection } from "@/components/admin/RecipeYoutubeConnection";
import {
  fillEmptyHeroImageFromYoutubeThumbnail,
  markHeroImageManual,
} from "@/lib/youtube-data/recipe-link";
import {
  RecipeEditorSectionNav,
  type RecipeEditorSectionLink,
} from "@/components/admin/RecipeEditorSectionNav";
import {
  emptyAiSummary,
  serializeRecipeAiMeta,
  tallyConfidence,
  type RecipeAiMeta,
} from "@/lib/ai-recipe/types";
import { recipeFieldAnchorId, parseGranularEditorPath, recipeEditorAnchorId } from "@/lib/recipe-editor-field-anchor";
import {
  buildEditorIssueQueues,
  defaultInstructionGroupToExpand,
  editorSectionDomId,
  firstIssueForSection,
  type EditorIssue,
  type EditorIssueKind,
} from "@/lib/recipe-editor-navigation";
import {
  countMissingRequiredBySection,
  countReviewableBySection,
  evaluateEditorRecipeFields,
  listMissingRequiredFields,
  listReviewableFields,
  missingRequiredForSection,
  sectionForFieldKey,
  validateRecipeForPublish,
} from "@/lib/recipe-editor-completeness";
import { listPublishContentWarnings } from "@/lib/recipe-catalog-integrity";
import {
  listMissingAiFillableFields,
} from "@/lib/ai-recipe/missing-fields";
import {
  editorHasContent,
  mergeAiDraftIntoEditor,
} from "@/lib/ai-recipe/normalize";
import { mergeTargetedFillIntoEditor, extractTargetedFieldValue } from "@/lib/ai-recipe/targeted-merge";
import { readCurrentEditorFieldValue } from "@/lib/apply-editor-path";
import { coerceStringList, isPlainStringListKind } from "@/lib/coerce-string-list";
import {
  fieldPathHasContent,
  getRecipeFieldAiDef,
  isRecipeFieldAiSupported,
  recipeFieldIsEmpty,
  resolveFieldAiActionLabel,
  type FieldAiIntent,
} from "@/lib/ai-recipe/field-ai-registry";
import {
  resolveActiveFieldAiAnnotation,
  resolveFieldReviewState,
  buildProvenanceAfterConfirm,
  buildProvenanceAfterLock,
  buildProvenanceAfterUnlock,
  isFieldLocked,
} from "@/lib/ai-recipe/field-state";
import { buildProvenanceAfterChapterSuggestionApply } from "@/lib/ai-recipe/chapter-suggestions/apply";
import type { AiFieldProvenance } from "@/lib/ai-recipe/field-tracking";
import { buildProvenanceAfterStaffEdit } from "@/lib/ai-recipe/field-state";
import { noteHumanEditorChange, noteHumanYoutubeMetadataChange } from "@/lib/ai-recipe/field-tracking";
import { FieldAiActionButton } from "@/components/admin/FieldAiActionButton";
import {
  adminCompactPrimaryButtonClass,
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
  adminRecipeEditorStickyBleedClass,
  adminSecondaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import {
  ADMIN_IMAGE_FORMAT_HELP,
  RECIPE_HERO_IMAGE_HELP,
  resolveAdminImageUploadPolicy,
  validateAdminImageFile,
} from "@/lib/admin-upload";
import { partitionCategoriesByGroup } from "@/lib/category-admin";
import { emptyValue, RECIPE_MEDIA_KEYS, RECIPE_OVERVIEW_KEYS, slugify } from "@/lib/fields";
import { fieldValueHasContent } from "@/lib/field-content";
import { readEditorialDishName } from "@/lib/recipe-editor-dish-name";
import type { RecipeStageAlignment, RecipeYoutubeTimestamp } from "@/data/youtube-types";
import {
  hasCanonicalInstructionChapters,
  normalizeInstructionGroups,
  validateInstructionChapters,
  type InstructionChapterValidationIssue,
} from "@/lib/instruction-chapters";
import { parseRecipeYoutubeBlob } from "@/lib/recipe-youtube";
import { youtubeVideoId } from "@/lib/youtube";
import {
  parseTimestampInput,
  serializeYoutubeMetadataEditorState,
  validateYoutubeMetadataEditorState,
  youtubeMetadataToEditorState,
  type YoutubeMetadataEditorState,
} from "@/lib/youtube-metadata-editor";

type Field = {
  key: string;
  label: string;
  helpText: string;
  kind: string;
  required: boolean;
  options: string[];
};

type CategoryOption = { id: string; name: string; group: string };

const SECTION_BASICS = "recipe-section-basics";
const SECTION_DETAILS = "recipe-section-details";
const SECTION_CONTENT = "recipe-section-content";
const SECTION_MEDIA = "recipe-section-media";
const SECTION_ADVANCED = "recipe-section-advanced";

const SECTION_ID_TO_EDITOR: Record<
  string,
  "basics" | "details" | "content" | "media" | "advanced"
> = {
  [SECTION_BASICS]: "basics",
  [SECTION_DETAILS]: "details",
  [SECTION_CONTENT]: "content",
  [SECTION_MEDIA]: "media",
  [SECTION_ADVANCED]: "advanced",
};

const YIELD_KEYS = ["servings", "servingsUnit"] as const;
const TIMING_KEYS = ["prepMinutes", "bakeMinutes", "restMinutes"] as const;
const CLASSIFICATION_KEYS = ["difficulty", "course", "method", "holiday", "cuisine"] as const;
const TOOLS_KEYS = ["utensils"] as const;
const TAG_KEYS = ["tags"] as const;

const DETAILS_KEYS = [
  "servings",
  "servingsUnit",
  "difficulty",
  "prepMinutes",
  "bakeMinutes",
  "restMinutes",
  "utensils",
  "course",
  "method",
  "holiday",
  "cuisine",
  "tags",
] as const;

const CONTENT_KEYS = [
  "intro",
  "whyItWorks",
  "ingredients",
  "instructions",
  "notes",
  "tips",
  "keyIngredients",
  "faqs",
] as const;

const MEDIA_PRIMARY_KEYS = ["image", "imageAlt", "youtubeUrl"] as const;

const ADVANCED_KEYS = ["floatingYoutubeUrl", "youtube", "nutrition"] as const;

/** Keys with dedicated AI UI (tags use TagsChipEditor). */
const FIELD_AI_UI_EXCLUDED = new Set(["tags"]);

const ALL_GROUPED = new Set<string>([
  ...DETAILS_KEYS,
  ...CONTENT_KEYS,
  ...MEDIA_PRIMARY_KEYS,
  ...ADVANCED_KEYS,
  ...RECIPE_OVERVIEW_KEYS,
  ...RECIPE_MEDIA_KEYS,
  "cookMinutes",
  /** Identity field — rendered in Basics, not Details/specialist. */
  "dishName",
]);

const compactInputClass =
  "h-9 w-full rounded-sm border border-line bg-paper px-3 text-sm text-ink outline-none transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 focus-visible:border-olive focus-visible:ring-2 focus-visible:ring-olive/15";

const inputErrorClass = "border-terracotta/60 focus:border-terracotta focus:ring-terracotta/15 focus-visible:border-terracotta focus-visible:ring-terracotta/15";

const editorTextAction =
  "inline-flex items-center gap-0.5 self-start rounded-sm px-0.5 py-1 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const removeActionClass =
  "shrink-0 self-center text-xs font-semibold text-muted/75 transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const fieldErrorClass = "mt-1.5 text-xs font-semibold text-terracotta";

function bakeTimeDisplayLabel(typeName: string, fieldLabel: string) {
  const lower = typeName.toLowerCase();
  if (
    lower.includes("drink") ||
    lower.includes("condiment") ||
    lower.includes("sauce") ||
    lower.includes("salad")
  ) {
    return "Cooking time";
  }
  return fieldLabel;
}

function moveArrayItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function hydrateEditorValues(
  fields: Field[],
  rawValues: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.key === "bakeMinutes") {
      next[field.key] = rawValues.bakeMinutes ?? emptyValue(field.kind);
    } else if (field.key === "cookMinutes") {
      next[field.key] = rawValues.cookMinutes ?? emptyValue(field.kind);
    } else if (field.key === "difficulty") {
      next[field.key] = rawValues.difficulty || "Easy";
    } else if (field.key === "youtube") {
      next[field.key] = youtubeMetadataToEditorState(rawValues.youtube);
    } else if (isPlainStringListKind(field.kind)) {
      next[field.key] = coerceStringList(rawValues[field.key] ?? emptyValue(field.kind));
    } else if (field.key === "dishName") {
      next.dishName = readEditorialDishName(rawValues);
    } else {
      next[field.key] = rawValues[field.key] ?? emptyValue(field.kind);
    }
  }
  // Always keep editorial dish name even when the type has no dishName field.
  if (!Object.prototype.hasOwnProperty.call(next, "dishName")) {
    next.dishName = readEditorialDishName(rawValues);
  }
  return next;
}

function editorFormSnapshot(payload: {
  title: string;
  slug: string;
  excerpt: string;
  typeId: string;
  featured: boolean;
  seasonal: boolean;
  categoryIds: string[];
  values: Record<string, unknown>;
  aiMeta?: RecipeAiMeta | null;
}) {
  return JSON.stringify({
    ...payload,
    categoryIds: [...payload.categoryIds].sort(),
    aiMeta: payload.aiMeta ?? null,
  });
}

function pickFieldsOrdered(fields: Field[], keys: readonly string[]) {
  const map = new Map(fields.map((field) => [field.key, field]));
  return keys.map((key) => map.get(key)).filter((field): field is Field => Boolean(field));
}

function EditorSection({
  id,
  title,
  description,
  children,
  scrollTargetStyle,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  emphasis?: boolean;
  scrollTargetStyle?: React.CSSProperties;
}) {
  return (
    <section id={id} style={scrollTargetStyle} className="pt-1">
      <header className="mb-5 border-b border-line/70 pb-3">
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">{title}</h2>
        {description ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function DetailSubgroup({
  label,
  children,
  layout = "default",
  description,
}: {
  label: string;
  children: React.ReactNode;
  layout?: "default" | "yield" | "timing" | "classification" | "medium";
  description?: string;
}) {
  const gridClass =
    layout === "yield"
      ? "grid max-w-lg grid-cols-1 gap-4 min-[480px]:grid-cols-2"
      : layout === "timing"
        ? "grid min-w-0 gap-5 sm:grid-cols-2 2xl:grid-cols-3"
        : layout === "classification"
          ? "grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3"
          : layout === "medium"
            ? "grid max-w-3xl gap-4"
            : "grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3";

  /** Subgrid aligns label / meta / helper / control baselines across sibling fields. */
  const alignFieldsClass =
    layout === "yield"
      ? "min-[480px]:[&>*]:row-span-3 min-[480px]:[&>*]:grid min-[480px]:[&>*]:grid-rows-subgrid min-[480px]:[&>*]:gap-y-0.5"
      : layout === "timing" || layout === "classification"
        ? "sm:[&>*]:row-span-4 sm:[&>*]:grid sm:[&>*]:grid-rows-subgrid sm:[&>*]:gap-y-0.5"
        : "";

  return (
    <div className="border-t border-line/70 pb-3 pt-5 first:border-t-0 first:pt-0 sm:pb-4">
      <h3 className="mb-1 text-sm font-semibold text-ink">{label}</h3>
      {description ? <p className="mb-3 text-xs text-muted">{description}</p> : null}
      <div
        className={`${gridClass} ${alignFieldsClass} ${description ? "" : "mt-3"}`.trim()}
        data-details-align={
          layout === "yield" || layout === "timing" || layout === "classification"
            ? layout
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  required,
  helpText,
  compact = false,
  confidence,
  sourceNote,
  aiAction,
  overflow,
  alignSlots = false,
  reserveHelper = false,
}: {
  label: string;
  required?: boolean;
  helpText?: string;
  compact?: boolean;
  confidence?: import("@/lib/ai-recipe/types").AiConfidence;
  sourceNote?: string;
  aiAction?: ReactNode;
  overflow?: ReactNode;
  /** Split into label / meta / helper slots for Details row subgrid alignment. */
  alignSlots?: boolean;
  /** Keep an empty helper cell so sibling helpers share a baseline (timing / classification). */
  reserveHelper?: boolean;
}) {
  const labelRow = (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        <p className={`min-w-0 font-semibold text-ink ${compact ? "text-sm" : ""}`}>
          {label}
          {required ? <span className="text-terracotta"> *</span> : null}
        </p>
        {aiAction}
      </div>
      {alignSlots ? (
        <div className="flex shrink-0 items-center justify-end">{overflow}</div>
      ) : (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5">
          <AiConfidenceBadge confidence={confidence} sourceNote={sourceNote} />
          {overflow}
        </div>
      )}
    </div>
  );

  const metaRow = (
    <div className="flex min-h-0 min-w-0 items-center">
      <AiConfidenceBadge confidence={confidence} sourceNote={sourceNote} />
    </div>
  );

  const helperRow = helpText ? (
    <p className="text-xs leading-snug text-muted">{helpText}</p>
  ) : reserveHelper ? (
    <p className="hidden sm:block" aria-hidden="true" />
  ) : null;

  if (alignSlots) {
    return (
      <>
        <div className="min-w-0 self-start" data-field-slot="label">
          {labelRow}
        </div>
        <div className="min-w-0 self-start" data-field-slot="meta">
          {metaRow}
        </div>
        {reserveHelper || helpText ? (
          <div className="min-w-0 self-start" data-field-slot="help">
            {helperRow}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className={`min-w-0 ${compact ? "mb-1.5" : "mb-2"}`}>
      {labelRow}
      {helpText ? <p className="mt-0.5 text-xs text-muted">{helpText}</p> : null}
    </div>
  );
}

function normalizeStatus(status: string) {
  return status.toLowerCase();
}

export function RecipeEditor({
  recipeId,
  typeId: initialTypeId,
  typeName: initialTypeName,
  recipeTypes = [],
  initial,
  fields,
  categories,
  saved,
  aiNotice,
}: {
  recipeId?: string;
  typeId: string;
  typeName: string;
  recipeTypes?: { id: string; name: string }[];
  initial: {
    title: string;
    slug: string;
    excerpt: string;
    status: string;
    featured: boolean;
    seasonal: boolean;
    categoryIds: string[];
    values: Record<string, unknown>;
    aiMeta?: RecipeAiMeta | null;
  };
  fields: Field[];
  categories: CategoryOption[];
  saved?: boolean;
  aiNotice?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLInputElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const sectionNavRef = useRef<HTMLElement>(null);
  const headerSentinelRef = useRef<HTMLDivElement>(null);
  const actionBarSentinelRef = useRef<HTMLDivElement>(null);
  const moveToDraftCancelRef = useRef<HTMLButtonElement>(null);
  const moveToDraftTitleId = useId();
  const [headerHeight, setHeaderHeight] = useState(84);
  const [scrollOffset, setScrollOffset] = useState(96);
  const [mobileHeaderCompact, setMobileHeaderCompact] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(SECTION_BASICS);
  const [moveToDraftOpen, setMoveToDraftOpen] = useState(false);
  const [publishAiWarningOpen, setPublishAiWarningOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [fieldAiBusy, setFieldAiBusy] = useState<string | null>(null);
  const [fieldAiNotice, setFieldAiNotice] = useState<Record<string, string>>({});
  const [fieldSuggestions, setFieldSuggestions] = useState<
    Record<
      string,
      {
        currentValue: unknown;
        suggestion: unknown;
        pending: AiTargetedFillApplyPayload;
      }
    >
  >({});
  const [tagOptimizeProposal, setTagOptimizeProposal] = useState<string[] | null>(null);
  const [tagOptimizeBusy, setTagOptimizeBusy] = useState(false);
  const tagOptimizePendingRef = useRef<AiTargetedFillApplyPayload | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [typeId, setTypeId] = useState(initialTypeId);
  const [status, setStatus] = useState(initial.status);
  const [featured, setFeatured] = useState(initial.featured);
  const [seasonal, setSeasonal] = useState(initial.seasonal);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pulsingFieldKey, setPulsingFieldKey] = useState<string | null>(null);
  const [pulsingPath, setPulsingPath] = useState<string | null>(null);
  const [instructionExpandedGroups, setInstructionExpandedGroups] = useState<Record<number, boolean>>({});
  const [faqExpandedRows, setFaqExpandedRows] = useState<Record<number, boolean>>({});
  const [keyIngredientExpandedIndex, setKeyIngredientExpandedIndex] = useState<number | null>(null);
  const [issueWorkflow, setIssueWorkflow] = useState<{ kind: EditorIssueKind; index: number } | null>(null);
  const [stickyActionsVisible, setStickyActionsVisible] = useState(false);
  const [categoryGroupCollapsed, setCategoryGroupCollapsed] = useState<Record<string, boolean>>({});
  const instructionsInitializedRef = useRef(false);
  const pulseTimeoutRef = useRef<number | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [publishAlert, setPublishAlert] = useState("");
  const [aiMeta, setAiMeta] = useState<RecipeAiMeta | null>(initial.aiMeta ?? null);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    hydrateEditorValues(fields, initial.values),
  );

  const baselineSnapshot = useMemo(
    () =>
      editorFormSnapshot({
        title: initial.title,
        slug: initial.slug,
        excerpt: initial.excerpt,
        typeId: initialTypeId,
        featured: initial.featured,
        seasonal: initial.seasonal,
        categoryIds: initial.categoryIds,
        values: hydrateEditorValues(fields, initial.values),
        aiMeta: initial.aiMeta ?? null,
      }),
    [fields, initial, initialTypeId],
  );

  const detailFields = pickFieldsOrdered(fields, DETAILS_KEYS);
  const contentFields = pickFieldsOrdered(fields, CONTENT_KEYS);
  const mediaFields = pickFieldsOrdered(fields, MEDIA_PRIMARY_KEYS).filter(
    (field) => field.key !== "youtubeUrl",
  );
  const advancedFields = pickFieldsOrdered(fields, ADVANCED_KEYS);
  const specialistFields = fields.filter((field) => !ALL_GROUPED.has(field.key));

  const categoryGroups = useMemo(
    () =>
      partitionCategoriesByGroup(
        categories.map((category) => ({
          ...category,
          slug: category.id,
          description: "",
          recipeCount: 0,
        })),
      ).filter((group) => group.categories.length > 0),
    [categories],
  );

  const missingFields = useMemo(
    () =>
      listMissingAiFillableFields({
        fields,
        title,
        slug,
        excerpt,
        categoryIds,
        values,
        aiMeta,
      }),
    [aiMeta, categoryIds, excerpt, fields, slug, title, values],
  );

  const specialistKeySet = useMemo(
    () => new Set(specialistFields.map((field) => field.key)),
    [specialistFields],
  );

  const resolveEditorSection = useMemo(
    () => (key: string) =>
      specialistKeySet.has(key)
        ? ("advanced" as const)
        : sectionForFieldKey(key),
    [specialistKeySet],
  );

  const fieldEvaluation = useMemo(
    () =>
      evaluateEditorRecipeFields({
        fields,
        title,
        excerpt,
        categoryIds,
        values,
        aiMeta,
        resolveSection: resolveEditorSection,
        typeFields: fields,
      }),
    [aiMeta, categoryIds, excerpt, fields, resolveEditorSection, title, values],
  );

  function activeAiAnnotation(path: string, kind: string, value: unknown) {
    const isEmpty = recipeFieldIsEmpty({
      path,
      kind,
      value,
      title,
      excerpt,
      categoryIds,
    });
    return resolveActiveFieldAiAnnotation(path, aiMeta, isEmpty);
  }

  const requiredMissing = useMemo(
    () =>
      listMissingRequiredFields({
        fields,
        title,
        values,
        resolveSection: resolveEditorSection,
      }),
    [fields, resolveEditorSection, title, values],
  );

  const requiredMissingBySection = useMemo(
    () => countMissingRequiredBySection(requiredMissing),
    [requiredMissing],
  );

  const reviewableFields = useMemo(
    () =>
      listReviewableFields({
        fields,
        title,
        excerpt,
        categoryIds,
        values,
        aiMeta,
        resolveSection: resolveEditorSection,
      }),
    [aiMeta, categoryIds, excerpt, fields, resolveEditorSection, title, values],
  );

  const reviewableBySection = useMemo(
    () => countReviewableBySection(reviewableFields),
    [reviewableFields],
  );

  function missingLabelsForSection(section: "basics" | "details" | "content" | "media" | "advanced") {
    return missingRequiredForSection(requiredMissing, section).map((row) => row.label);
  }

  function reviewLabelsForSection(section: "basics" | "details" | "content" | "media" | "advanced") {
    return fieldEvaluation.nodes
      .filter((node) => node.needsReview && node.section === section)
      .map((node) => node.label);
  }

  const issueQueues = useMemo(
    () => buildEditorIssueQueues(fieldEvaluation.nodes),
    [fieldEvaluation.nodes],
  );

  const evaluatorMissingPaths = useMemo(
    () => new Set(fieldEvaluation.nodes.filter((node) => node.blocking).map((node) => node.path)),
    [fieldEvaluation.nodes],
  );

  const evaluatorReviewPaths = useMemo(
    () => new Set(fieldEvaluation.nodes.filter((node) => node.needsReview).map((node) => node.path)),
    [fieldEvaluation.nodes],
  );

  const activeIssueList = issueWorkflow
    ? issueWorkflow.kind === "missing"
      ? issueQueues.missing
      : issueQueues.review
    : [];

  const missingFieldKeySet = useMemo(
    () => new Set(requiredMissing.map((row) => row.key)),
    [requiredMissing],
  );

  const sectionLinks = useMemo(() => {
    const links: RecipeEditorSectionLink[] = [
      {
        id: SECTION_BASICS,
        label: "Basics",
        missingCount: requiredMissingBySection.basics,
        missingLabels: missingLabelsForSection("basics"),
        reviewCount: reviewableBySection.basics,
        reviewLabels: reviewLabelsForSection("basics"),
      },
    ];
    if (detailFields.length) {
      links.push({
        id: SECTION_DETAILS,
        label: "Details",
        missingCount: requiredMissingBySection.details,
        missingLabels: missingLabelsForSection("details"),
        reviewCount: reviewableBySection.details,
        reviewLabels: reviewLabelsForSection("details"),
      });
    }
    if (contentFields.length) {
      links.push({
        id: SECTION_CONTENT,
        label: "Content",
        missingCount: requiredMissingBySection.content,
        missingLabels: missingLabelsForSection("content"),
        reviewCount: reviewableBySection.content,
        reviewLabels: reviewLabelsForSection("content"),
      });
    }
    if (mediaFields.length) {
      links.push({
        id: SECTION_MEDIA,
        label: "Media",
        missingCount: requiredMissingBySection.media,
        missingLabels: missingLabelsForSection("media"),
        reviewCount: reviewableBySection.media,
        reviewLabels: reviewLabelsForSection("media"),
      });
    }
    if (advancedFields.length || specialistFields.length) {
      links.push({
        id: SECTION_ADVANCED,
        label: "Advanced",
        missingCount: requiredMissingBySection.advanced,
        missingLabels: missingLabelsForSection("advanced"),
        reviewCount: reviewableBySection.advanced,
        reviewLabels: reviewLabelsForSection("advanced"),
      });
    }
    return links;
  }, [
    advancedFields.length,
    contentFields.length,
    detailFields.length,
    fieldEvaluation.nodes,
    mediaFields.length,
    requiredMissing,
    requiredMissingBySection,
    reviewableBySection,
    specialistFields.length,
  ]);

  const isPublished = normalizeStatus(status) === "published";

  const publishContentWarnings = useMemo(
    () => listPublishContentWarnings({ values }),
    [values],
  );

  const isDirty = useMemo(
    () =>
      editorFormSnapshot({
        title,
        slug,
        excerpt,
        typeId,
        featured,
        seasonal,
        categoryIds,
        values,
        aiMeta,
      }) !== baselineSnapshot,
    [aiMeta, baselineSnapshot, categoryIds, excerpt, featured, seasonal, title, slug, typeId, values],
  );

  const draftActionLabel = isPublished ? "Move to draft" : "Save draft";

  const publishButtonLabel = isPublished ? "Update recipe" : "Publish";

  const mobileCompactPublishLabel = isPublished ? "Update" : "Publish";

  const encoded = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of fields) {
      if (field.key === "youtube") {
        const blob = serializeYoutubeMetadataEditorState(
          (values.youtube as YoutubeMetadataEditorState) ?? youtubeMetadataToEditorState(undefined),
        );
        out[field.key] = JSON.stringify(blob ?? {});
      } else if (isPlainStringListKind(field.kind)) {
        out[field.key] = JSON.stringify(coerceStringList(values[field.key]));
      } else if (field.key === "dishName") {
        out.dishName = JSON.stringify(String(values.dishName ?? ""));
      } else {
        out[field.key] = JSON.stringify(values[field.key] ?? emptyValue(field.kind));
      }
    }
    if (!Object.prototype.hasOwnProperty.call(out, "dishName")) {
      out.dishName = JSON.stringify(String(values.dishName ?? ""));
    }
    return out;
  }, [fields, values]);

  const typeOptions = useMemo(() => {
    const byId = new Map(recipeTypes.map((type) => [type.id, type]));
    if (!byId.has(typeId) && typeId) {
      byId.set(typeId, { id: typeId, name: initialTypeName });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [initialTypeName, recipeTypes, typeId]);

  const typeName =
    typeOptions.find((type) => type.id === typeId)?.name || initialTypeName;

  const pageTitle = title.trim() || (recipeId ? "Untitled recipe" : `New ${typeName.toLowerCase()}`);

  useEffect(() => {
    const header = stickyHeaderRef.current;
    if (!header) return;

    function updateScrollOffset() {
      const headerNode = stickyHeaderRef.current;
      const navNode = sectionNavRef.current;
      if (!headerNode) return;
      const nextHeaderHeight = headerNode.offsetHeight;
      const navHeight = navNode?.offsetHeight ?? 0;
      setHeaderHeight(nextHeaderHeight);
      setScrollOffset(nextHeaderHeight + navHeight + 12);
    }

    updateScrollOffset();
    const observer = new ResizeObserver(updateScrollOffset);
    observer.observe(header);
    if (sectionNavRef.current) observer.observe(sectionNavRef.current);
    window.addEventListener("resize", updateScrollOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollOffset);
    };
  }, [sectionLinks.length]);

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (instructionsInitializedRef.current) return;
    const groups = Array.isArray(values.instructions)
      ? (values.instructions as { name?: string; steps: string[] }[])
      : [];
    if (!groups.length) return;
    const attentionPaths = [...evaluatorMissingPaths, ...evaluatorReviewPaths];
    const openIndex = defaultInstructionGroupToExpand(groups.length, "instructions", attentionPaths);
    setInstructionExpandedGroups({ [openIndex]: true });
    instructionsInitializedRef.current = true;
  }, [evaluatorMissingPaths, evaluatorReviewPaths, values.instructions]);

  useEffect(() => {
    const sentinel = actionBarSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setStickyActionsVisible(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!issueWorkflow) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        navigateIssueByOffset(1);
      } else if (event.key === "p" || event.key === "P") {
        event.preventDefault();
        navigateIssueByOffset(-1);
      } else if (event.key === "c" || event.key === "C") {
        if (!issueWorkflow) return;
        const issue = activeIssueList[issueWorkflow.index];
        if (issue) {
          event.preventDefault();
          confirmFieldAtPath(issue.path);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIssueList, issueWorkflow]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith("field-")) return;
    const target = document.getElementById(hash);
    const path = target?.getAttribute("data-recipe-field-path");
    const fieldKey = target?.getAttribute("data-recipe-field");
    const timer = window.setTimeout(() => {
      if (path) {
        scrollToEditorPath(path, { pulse: true, updateHash: false });
      } else if (fieldKey) {
        scrollToField(fieldKey, { pulse: true, updateHash: false });
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sentinel = headerSentinelRef.current;
    if (!sentinel) return;

    const mobileQuery = window.matchMedia("(max-width: 767px)");

    function syncCompact(isIntersecting: boolean) {
      if (!mobileQuery.matches) {
        setMobileHeaderCompact(false);
        return;
      }
      setMobileHeaderCompact(!isIntersecting);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) syncCompact(entry.isIntersecting);
      },
      { threshold: 0 },
    );

    observer.observe(sentinel);

    function onViewportChange() {
      if (!mobileQuery.matches) {
        setMobileHeaderCompact(false);
      }
    }

    mobileQuery.addEventListener("change", onViewportChange);
    return () => {
      observer.disconnect();
      mobileQuery.removeEventListener("change", onViewportChange);
    };
  }, []);

  useEffect(() => {
    let raf = 0;

    function updateActiveSection() {
      const offset = scrollOffset + 8;
      let current = sectionLinks[0]?.id ?? SECTION_BASICS;
      for (const link of sectionLinks) {
        const element = document.getElementById(link.id);
        if (element && element.getBoundingClientRect().top <= offset) {
          current = link.id;
        }
      }
      setActiveSectionId(current);
    }

    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateActiveSection);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    updateActiveSection();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [scrollOffset, sectionLinks]);

  useEffect(() => {
    if (!moveToDraftOpen) return;
    moveToDraftCancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoveToDraftOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveToDraftOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [moreMenuOpen]);

  const scrollTargetStyle = useMemo(
    () => ({ scrollMarginTop: scrollOffset }) as const,
    [scrollOffset],
  );

  function fieldNeedsAdvancedOpen(fieldKey: string) {
    return ADVANCED_KEYS.includes(fieldKey as (typeof ADVANCED_KEYS)[number]) || specialistKeySet.has(fieldKey);
  }

  function triggerFieldPulse(fieldKey: string, path?: string) {
    if (pulseTimeoutRef.current !== null) {
      window.clearTimeout(pulseTimeoutRef.current);
    }
    setPulsingFieldKey(fieldKey);
    setPulsingPath(path ?? null);
    pulseTimeoutRef.current = window.setTimeout(() => {
      setPulsingFieldKey(null);
      setPulsingPath(null);
      pulseTimeoutRef.current = null;
    }, 1600);
  }

  function expandForPath(path: string) {
    const hints = parseGranularEditorPath(path);
    if (hints.instructionGroupIndex !== undefined) {
      setInstructionExpandedGroups((current) => ({
        ...current,
        [hints.instructionGroupIndex!]: true,
      }));
    }
    if (hints.faqIndex !== undefined) {
      setFaqExpandedRows((current) => ({ ...current, [hints.faqIndex!]: true }));
    }
    if (hints.keyIngredientIndex !== undefined) {
      setKeyIngredientExpandedIndex(hints.keyIngredientIndex);
    }
    const topKey =
      hints.topKey === "title" || hints.topKey === "excerpt" || hints.topKey === "categoryIds"
        ? hints.topKey
        : hints.topKey;
    if (fieldNeedsAdvancedOpen(topKey)) {
      setAdvancedOpen(true);
    }
  }

  function scrollToEditorPath(
    path: string,
    options: { pulse?: boolean; updateHash?: boolean; fieldKey?: string } = {},
  ) {
    expandForPath(path);
    const sectionNode = fieldEvaluation.nodes.find((node) => node.path === path);
    const sectionId = sectionNode ? editorSectionDomId(sectionNode.section) : undefined;
    if (sectionId) {
      scrollToSection(sectionId);
    }

    const fieldKey =
      options.fieldKey ??
      (path === "title" || path === "excerpt" || path === "categoryIds"
        ? path
        : path.startsWith("values.")
          ? path.slice("values.".length).split(".")[0] ?? ""
          : path);

    const scroll = (): boolean => {
      const anchorId = recipeEditorAnchorId(path, fieldKey);
      const target =
        document.getElementById(anchorId) ??
        document.querySelector<HTMLElement>(`[data-recipe-field-path="${path}"]`);
      if (!target) return false;

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });

      if (options.updateHash !== false) {
        window.history.replaceState(null, "", `#${anchorId}`);
      }

      if (options.pulse) {
        triggerFieldPulse(fieldKey, path);
      }

      window.setTimeout(
        () => {
          const focusable = target.querySelector<HTMLElement>(
            "input:not([type='hidden']):not([type='file']), textarea, select, button:not([type='submit'])",
          );
          focusable?.focus({ preventScroll: true });
        },
        prefersReducedMotion ? 0 : 320,
      );
      return true;
    };

    const needsExpansion = hintsNeedExpansion(path);
    const attemptScroll = (attempt = 0) => {
      if (scroll()) return;
      if (attempt < 10) {
        window.setTimeout(() => attemptScroll(attempt + 1), needsExpansion ? 100 : 80);
      }
    };

    const initialDelay = needsExpansion ? 80 : fieldNeedsAdvancedOpen(fieldKey) ? 120 : 60;
    window.setTimeout(() => attemptScroll(), initialDelay);
  }

  function hintsNeedExpansion(path: string) {
    const hints = parseGranularEditorPath(path);
    return (
      hints.instructionGroupIndex !== undefined ||
      hints.faqIndex !== undefined ||
      hints.keyIngredientIndex !== undefined
    );
  }

  function navigateToIssue(issue: EditorIssue, workflow?: { kind: EditorIssueKind; index: number }) {
    if (workflow) setIssueWorkflow(workflow);
    scrollToEditorPath(issue.path, { pulse: true, updateHash: true, fieldKey: issue.key });
  }

  function startIssueWorkflow(kind: EditorIssueKind, startIndex = 0) {
    const list = kind === "missing" ? issueQueues.missing : issueQueues.review;
    if (!list.length) return;
    const index = Math.min(Math.max(startIndex, 0), list.length - 1);
    setIssueWorkflow({ kind, index });
    navigateToIssue(list[index]!, { kind, index });
  }

  function navigateIssueByOffset(offset: number) {
    if (!issueWorkflow) return;
    const list = issueWorkflow.kind === "missing" ? issueQueues.missing : issueQueues.review;
    if (!list.length) return;
    const nextIndex = Math.min(Math.max(issueWorkflow.index + offset, 0), list.length - 1);
    setIssueWorkflow({ kind: issueWorkflow.kind, index: nextIndex });
    navigateToIssue(list[nextIndex]!);
  }

  function navigateToSectionMissing(sectionId: string) {
    const sectionKey = SECTION_ID_TO_EDITOR[sectionId];
    if (!sectionKey) {
      scrollToSection(sectionId);
      return;
    }
    const issue = firstIssueForSection(issueQueues, sectionKey, "missing");
    if (issue) {
      const index = issueQueues.missing.indexOf(issue);
      startIssueWorkflow("missing", index >= 0 ? index : 0);
      return;
    }
    scrollToSection(sectionId);
  }

  function navigateToSectionReview(sectionId: string) {
    const sectionKey = SECTION_ID_TO_EDITOR[sectionId];
    if (!sectionKey) {
      scrollToSection(sectionId);
      return;
    }
    const issue = firstIssueForSection(issueQueues, sectionKey, "review");
    if (issue) {
      const index = issueQueues.review.indexOf(issue);
      startIssueWorkflow("review", index >= 0 ? index : 0);
      return;
    }
    scrollToSection(sectionId);
  }

  function scrollToField(
    fieldKey: string,
    options: { pulse?: boolean; updateHash?: boolean } = {},
  ) {
    const path =
      fieldKey === "title" || fieldKey === "excerpt" || fieldKey === "categoryIds"
        ? fieldKey
        : `values.${fieldKey}`;
    scrollToEditorPath(path, { ...options, fieldKey });
  }

  function scrollToSection(sectionId: string) {
    setActiveSectionId(sectionId);
    const target = document.getElementById(sectionId);
    if (!target) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }

  function missingFieldAiPath(key: string) {
    return key === "title" || key === "excerpt" || key === "categoryIds" ? key : `values.${key}`;
  }

  function canGenerateMissingField(key: string) {
    return isRecipeFieldAiSupported(missingFieldAiPath(key), fields);
  }

  function handleGenerateMissingField(path: string, key: string) {
    void runFieldAi(path, key);
  }

  function renderSectionCompletenessBanner(section: "basics" | "details" | "content" | "media" | "advanced") {
    const missing = missingRequiredForSection(requiredMissing, section);
    return (
      <SectionCompletenessBanner
        missing={missing}
        onJumpToField={(key) => scrollToField(key, { pulse: true, updateHash: true })}
        canGenerateField={canGenerateMissingField}
        onGenerateField={handleGenerateMissingField}
      />
    );
  }

  function setField(key: string, value: unknown) {
    setValues((current) => {
      if (key === "youtube") {
        setAiMeta((meta) => noteHumanYoutubeMetadataChange(meta, current.youtube, value));
      } else if (key === "image") {
        setAiMeta((meta) => {
          const noted = noteHumanEditorChange(meta, `values.${key}`, value);
          return markHeroImageManual(noted, String(value ?? ""));
        });
      } else {
        setAiMeta((meta) => noteHumanEditorChange(meta, `values.${key}`, value));
      }
      return { ...current, [key]: value };
    });
  }

  function updateTitle(next: string) {
    setTitle(next);
    setAiMeta((current) => noteHumanEditorChange(current, "title", next));
  }

  function updateSlug(next: string) {
    setSlug(next);
    setAiMeta((current) => noteHumanEditorChange(current, "slug", next));
  }

  function updateExcerpt(next: string) {
    setExcerpt(next);
    setAiMeta((current) => noteHumanEditorChange(current, "excerpt", next));
  }

  function updateTypeId(next: string) {
    if (next === typeId) return;
    setTypeId(next);
    setAiMeta((current) =>
      current
        ? {
            ...current,
            recipeTypeSource: "manual",
            recipeTypeConfirmed: true,
          }
        : current,
    );
  }

  function updateCategoryIds(next: string[]) {
    setCategoryIds(next);
    setAiMeta((current) => noteHumanEditorChange(current, "categoryIds", next));
  }

  const formHasContent = useMemo(
    () =>
      editorHasContent({
        title,
        excerpt,
        categoryIds,
        values,
        fields,
      }),
    [title, excerpt, categoryIds, values, fields],
  );

  const instructionChapterContext = useMemo(() => {
    const groups = normalizeInstructionGroups(values.instructions);
    const blob = parseRecipeYoutubeBlob(values.youtube);
    const videoDurationSeconds = blob?.duration
      ? parseTimestampInput(String(blob.duration)) ?? undefined
      : undefined;
    const stageAlignments = (blob?.stageAlignments ?? []) as RecipeStageAlignment[];
    const legacyTimestamps = (blob?.timestamps ?? []) as RecipeYoutubeTimestamp[];
    const chapterValidationIssues = validateInstructionChapters({
      groups,
      videoDurationSeconds,
    });
    return {
      videoDurationSeconds,
      stageAlignments,
      legacyTimestamps,
      chapterValidationIssues,
      canonicalChaptersActive: hasCanonicalInstructionChapters(groups),
    };
  }, [values.instructions, values.youtube]);

  function handleInstructionChapterFieldChange(
    groupIndex: number,
    field: "chapterLabel" | "startTimestamp" | "endTimestamp",
    value: string | number | undefined,
  ) {
    const path = `values.instructions.${groupIndex}.${field}`;
    setAiMeta((meta) => {
      const base: RecipeAiMeta =
        meta ??
        ({
          generatedByAI: false,
          sourceType: "youtube",
          sourceUrl: "",
          generatedAt: "",
          model: "",
          schemaVersion: "",
          verificationStatus: "none",
          confidenceByPath: {},
          summary: { verified: 0, inferred: 0, estimated: 0, unknown: 0 },
          fieldProvenance: {},
        } satisfies RecipeAiMeta);
      if (field === "startTimestamp" || field === "endTimestamp" || field === "chapterLabel") {
        return {
          ...base,
          fieldProvenance: {
            ...(base.fieldProvenance ?? {}),
            [path]: buildProvenanceAfterStaffEdit({
              path,
              nextValue: value,
              previous: base.fieldProvenance?.[path],
            }),
          },
        };
      }
      return noteHumanEditorChange(base, path, value);
    });
  }

  function handleApplyChapterSuggestions(input: {
    groups: import("@/lib/instruction-chapters").InstructionGroupWithChapters[];
    provenancePaths: Record<
      string,
      {
        source: import("@/lib/ai-recipe/field-state").FieldSource;
        value: unknown;
        chapterSuggestionSource?: import("@/lib/ai-recipe/chapter-suggestions/types").ChapterSuggestionSource;
      }
    >;
  }) {
    setField("instructions", input.groups);
    setAiMeta((meta) => {
      if (!meta) return meta;
      const fieldProvenance = { ...(meta.fieldProvenance ?? {}) };
      for (const [path, row] of Object.entries(input.provenancePaths)) {
        fieldProvenance[path] = buildProvenanceAfterChapterSuggestionApply({
          path,
          value: row.value,
          source: row.source,
          previous: fieldProvenance[path],
          chapterSuggestionSource: row.chapterSuggestionSource,
        });
      }
      return { ...meta, fieldProvenance };
    });
  }

  function handleNavigateChapterIssue(groupIndex: number) {
    setInstructionExpandedGroups((current) => ({ ...current, [groupIndex]: true }));
    void scrollToEditorPath(`values.instructions.${groupIndex}.startTimestamp`, {
      pulse: true,
      updateHash: true,
    });
  }

  function provenanceValueForPath(path: string): unknown {
    return readCurrentEditorFieldValue({ path, title, excerpt, categoryIds, values });
  }

  function patchFieldProvenance(path: string, builder: (previous?: AiFieldProvenance) => AiFieldProvenance) {
    setAiMeta((current) => {
      if (!current) return current;
      const previous = current.fieldProvenance?.[path];
      return {
        ...current,
        fieldProvenance: {
          ...(current.fieldProvenance ?? {}),
          [path]: builder(previous),
        },
      };
    });
  }

  function lockFieldAtPath(path: string) {
    patchFieldProvenance(path, (previous) =>
      buildProvenanceAfterLock({
        path,
        value: provenanceValueForPath(path),
        previous,
      }),
    );
  }

  function unlockFieldAtPath(path: string) {
    patchFieldProvenance(path, (previous) =>
      buildProvenanceAfterUnlock({
        path,
        value: provenanceValueForPath(path),
        previous,
      }),
    );
  }

  function confirmFieldAtPath(path: string) {
    patchFieldProvenance(path, (previous) =>
      buildProvenanceAfterConfirm({
        path,
        value: provenanceValueForPath(path),
        previous,
      }),
    );
  }

  function attemptUpdateRecipe() {
    if (isPublished) {
      attemptPublish();
    } else {
      attemptSaveDraft();
    }
  }

  function applyAiDraft(payload: AiGenerateApplyPayload) {
    const merged = mergeAiDraftIntoEditor(
      {
        title,
        slug,
        excerpt,
        featured,
        seasonal,
        categoryIds,
        values,
      },
      {
        ...payload.draft,
        confidenceByPath: payload.meta.confidenceByPath,
        summary: payload.meta.summary,
        insufficientRecipeInformation: false,
        insufficientReason: "",
      },
      fields,
      payload.mergeMode,
      aiMeta,
    );

    // AI never invents hero images; fill empty Hero from linked YouTube thumbnail metadata.
    // This must not clear imageAlt or other editorial fields.
    const withHero = fillEmptyHeroImageFromYoutubeThumbnail(merged.values, {
      ...payload.meta,
      heroImageSource: aiMeta?.heroImageSource ?? payload.meta.heroImageSource,
      heroImageYoutubeVideoId:
        aiMeta?.heroImageYoutubeVideoId ?? payload.meta.heroImageYoutubeVideoId,
    });

    const summary = emptyAiSummary();
    const confidenceByPath = {
      ...(aiMeta?.confidenceByPath ?? {}),
      ...merged.confidenceByPath,
    };
    // If a field now has content, never keep a stale "Needs input" (UNKNOWN) badge.
    for (const field of fields) {
      const path = `values.${field.key}`;
      const annotation = confidenceByPath[path];
      if (!annotation || annotation.confidence !== "UNKNOWN") continue;
      if (!fieldValueHasContent(withHero.values[field.key], field.kind)) continue;
      const fromDraft = payload.meta.confidenceByPath?.[path];
      if (fromDraft && fromDraft.confidence !== "UNKNOWN") {
        confidenceByPath[path] = fromDraft;
      } else {
        delete confidenceByPath[path];
      }
    }
    for (const annotation of Object.values(confidenceByPath)) {
      tallyConfidence(annotation.confidence, summary);
    }

    setTitle(merged.title);
    setSlug(merged.slug);
    setSlugTouched(Boolean(merged.slug));
    setExcerpt(merged.excerpt);
    setCategoryIds(merged.categoryIds);
    setValues(hydrateEditorValues(fields, withHero.values));
    setAiMeta({
      ...payload.meta,
      sourceVideoId: payload.meta.sourceVideoId ?? aiMeta?.sourceVideoId,
      confidenceByPath,
      fieldProvenance: merged.fieldProvenance,
      summary,
      verificationStatus: "unverified",
      verifiedAt: undefined,
      verifiedBy: undefined,
      recipeTypeSource: aiMeta?.recipeTypeSource ?? payload.meta.recipeTypeSource,
      recipeTypeConfidence: aiMeta?.recipeTypeConfidence ?? payload.meta.recipeTypeConfidence,
      recipeTypeConfirmed: aiMeta?.recipeTypeConfirmed ?? payload.meta.recipeTypeConfirmed,
      heroImageSource:
        withHero.aiMeta?.heroImageSource ?? aiMeta?.heroImageSource ?? payload.meta.heroImageSource,
      heroImageYoutubeVideoId:
        withHero.aiMeta?.heroImageYoutubeVideoId ??
        aiMeta?.heroImageYoutubeVideoId ??
        payload.meta.heroImageYoutubeVideoId,
    });
    setIssueWorkflow(null);
    setAdvancedOpen(true);
    instructionsInitializedRef.current = false;

    // Derive Mesa compatibility stage ↔ video alignments from instruction groups + chapter evidence.
    const instructionGroups = normalizeInstructionGroups(withHero.values.instructions);
    if (
      hasCanonicalInstructionChapters(instructionGroups) ||
      !instructionGroups.some((group) => String(group.name ?? "").trim())
    ) {
      return;
    }
    void import("@/lib/ai-recipe/stage-alignments").then(
      ({ buildStageAlignmentsFromAnalysis, applyStageAlignmentsToYoutubeBlob }) => {
        void import("@/lib/recipe-youtube").then(({ parseRecipeYoutubeBlob }) => {
          const stages = instructionGroups
            .map((group, index) => ({
              id: `stage-${index}`,
              name: String(group.name ?? "").trim() || `Stage ${index + 1}`,
            }))
            .filter((stage) => stage.name);
            const blob = parseRecipeYoutubeBlob(withHero.values.youtube);
            const hintChapters = (blob?.timestamps ?? []).map((row) => ({
              time: row.time,
              label: row.label,
            }));
            const aiAlignments = hintChapters.map((row) => ({
              instructionSectionTitle: row.label,
              videoStartSeconds: row.time,
              chapterTitle: row.label,
              confidence: "HIGH_CONFIDENCE_INFERENCE" as const,
            }));
            const alignments = buildStageAlignmentsFromAnalysis({
              instructionStages: stages,
              aiAlignments,
              youtubeHintChapters: hintChapters,
            });
            if (!alignments.length) return;
            setValues((current) => {
              const currentBlob =
                current.youtube && typeof current.youtube === "object"
                  ? (current.youtube as Record<string, unknown>)
                  : {};
              return {
                ...current,
                youtube: applyStageAlignmentsToYoutubeBlob(currentBlob, alignments),
              };
            });
        });
      },
    );
  }

  function applyTargetedFill(payload: AiTargetedFillApplyPayload) {
    if (payload.title !== undefined) setTitle(payload.title);
    setExcerpt(payload.excerpt);
    if (payload.categoryIds) setCategoryIds(payload.categoryIds);
    setValues(hydrateEditorValues(fields, payload.values));
    setAiMeta(payload.aiMeta);
  }

  function currentFieldValue(path: string, _key: string): unknown {
    return readCurrentEditorFieldValue({ path, title, excerpt, categoryIds, values });
  }

  function fieldLabelForPath(path: string, key: string): string {
    if (path === "title") return "Title";
    if (path === "excerpt") return "Excerpt";
    if (path === "categoryIds") return "Categories";
    if (path === "values.dishName" || key === "dishName") return "Dish name";
    return getRecipeFieldAiDef(path, fields)?.label ?? fields.find((field) => field.key === key)?.label ?? key;
  }

  function clearFieldSuggestion(path: string) {
    setFieldSuggestions((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  }

  function applyFieldSuggestion(path: string) {
    const suggestion = fieldSuggestions[path];
    if (!suggestion) return;
    applyTargetedFill(suggestion.pending);
    clearFieldSuggestion(path);
    setFieldAiNotice((current) => ({
      ...current,
      [path]: "AI SUGGESTION — REVIEW",
    }));
  }

  async function runFieldAi(path: string, key: string, intent: FieldAiIntent = "generate") {
    const kind =
      path === "title"
        ? "text"
        : path === "excerpt"
          ? "textarea"
          : path === "categoryIds"
            ? "categories"
            : fields.find((field) => field.key === key)?.kind ??
              getRecipeFieldAiDef(path, fields)?.kind;
    const currentValue = currentFieldValue(path, key);
    const hasContent = fieldPathHasContent({
      path,
      kind,
      value: currentValue,
      excerpt,
      categoryIds,
    });
    const reviewState = resolveFieldReviewState(path, aiMeta);
    if (reviewState === "locked") {
      setFieldAiNotice((current) => ({
        ...current,
        [path]: "This field is locked. Unlock it before regenerating.",
      }));
      return;
    }
    if (
      reviewState === "edited" &&
      hasContent &&
      intent !== "alternative"
    ) {
      const label = fieldLabelForPath(path, key);
      if (
        !window.confirm(
          `This field was edited by staff. Replace "${label}" with a new AI suggestion?`,
        )
      ) {
        return;
      }
    }

    setFieldAiBusy(path);
    setFieldAiNotice((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    if (key === "tags") setTagOptimizeBusy(true);

    const effectiveIntent: FieldAiIntent =
      intent === "generate" && hasContent ? "improve" : intent;

    try {
      const youtubeUrl = String(values.youtubeUrl ?? "").trim();
      const response = await fetch("/api/admin/recipes/ai-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typeId,
          recipeId,
          youtubeUrl: youtubeUrl || undefined,
          mode: "fields",
          fields: [path],
          allowRepopulate: true,
          fieldIntent: effectiveIntent,
          current: { title, slug, excerpt, categoryIds, values },
          aiMeta,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        requestedPaths?: string[];
        draft?: {
          title?: string;
          excerpt: string;
          categoryIds?: string[];
          values: Record<string, unknown>;
        };
        confidenceByPath?: RecipeAiMeta["confidenceByPath"];
      };
      if (!response.ok || !data.ok || !data.draft) {
        setFieldAiNotice((current) => ({
          ...current,
          [path]: data.error || `Could not generate ${fieldLabelForPath(path, key)}. Try again.`,
        }));
        return;
      }

      if (!data.requestedPaths?.length) {
        setFieldAiNotice((current) => ({
          ...current,
          [path]: `Could not generate ${fieldLabelForPath(path, key)}. Try again.`,
        }));
        return;
      }

      const merged = mergeTargetedFillIntoEditor({
        current: { title, slug, excerpt, categoryIds, values },
        draft: data.draft,
        requestedPaths: data.requestedPaths,
        confidenceByPath: data.confidenceByPath ?? {},
        aiMeta,
      });

      const suggestionValue = extractTargetedFieldValue({ path, draft: merged });

      if (
        (path === "values.holiday" || key === "holiday") &&
        !String(suggestionValue ?? "").trim()
      ) {
        setFieldAiNotice((current) => ({
          ...current,
          [path]: "No specific season or holiday suggested.",
        }));
        return;
      }

      if (path === "categoryIds" && hasContent) {
        const mergedIds = merged.categoryIds ?? [];
        const newIds = mergedIds.filter((id) => !categoryIds.includes(id));
        if (!newIds.length) {
          setFieldAiNotice((current) => ({
            ...current,
            [path]: "No additional categories suggested.",
          }));
          return;
        }
        setFieldSuggestions((current) => ({
          ...current,
          [path]: {
            currentValue: categoryIds,
            suggestion: newIds,
            pending: {
              title: merged.title,
              excerpt: merged.excerpt,
              categoryIds: merged.categoryIds,
              values: merged.values,
              aiMeta: merged.aiMeta,
            },
          },
        }));
        return;
      }

      if (key === "tags") {
        const tags = Array.isArray(suggestionValue)
          ? (suggestionValue as unknown[]).map((tag) => String(tag ?? "").trim()).filter(Boolean)
          : [];
        if (hasContent) {
          tagOptimizePendingRef.current = {
            title: merged.title,
            excerpt: merged.excerpt,
            categoryIds: merged.categoryIds,
            values: merged.values,
            aiMeta: merged.aiMeta,
          };
          setTagOptimizeProposal(tags);
        } else {
          applyTargetedFill({
            title: merged.title,
            excerpt: merged.excerpt,
            categoryIds: merged.categoryIds,
            values: merged.values,
            aiMeta: merged.aiMeta,
          });
          setFieldAiNotice((current) => ({
            ...current,
            [path]: "AI SUGGESTION — REVIEW",
          }));
        }
        return;
      }

      if (hasContent && (effectiveIntent === "improve" || effectiveIntent === "alternative")) {
        setFieldSuggestions((current) => ({
          ...current,
          [path]: {
            currentValue,
            suggestion: suggestionValue,
            pending: {
              title: merged.title,
              excerpt: merged.excerpt,
              categoryIds: merged.categoryIds,
              values: merged.values,
              aiMeta: merged.aiMeta,
            },
          },
        }));
        return;
      }

      applyTargetedFill({
        title: merged.title,
        excerpt: merged.excerpt,
        categoryIds: merged.categoryIds,
        values: merged.values,
        aiMeta: merged.aiMeta,
      });
      setFieldAiNotice((current) => ({
        ...current,
        [path]: "AI SUGGESTION — REVIEW",
      }));
    } catch {
      setFieldAiNotice((current) => ({
        ...current,
        [path]: "Could not generate this field. Try again.",
      }));
    } finally {
      setFieldAiBusy(null);
      if (key === "tags") setTagOptimizeBusy(false);
    }
  }

  function markAiVerified() {
    setAiMeta((current) =>
      current
        ? {
            ...current,
            verificationStatus: "verified",
            verifiedAt: new Date().toISOString(),
          }
        : current,
    );
  }

  function reviewEstimatedFields() {
    startIssueWorkflow("review");
  }

  function downloadAiJson() {
    if (!aiMeta) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            meta: aiMeta,
            recipe: {
              title,
              slug,
              excerpt,
              categoryIds,
              values,
            },
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(slug || title || "ai-recipe")}-ai-draft.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function toggleCategory(id: string) {
    setCategoryIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      setAiMeta((meta) => noteHumanEditorChange(meta, "categoryIds", next));
      return next;
    });
  }

  function onTitleChange(next: string) {
    updateTitle(next);
    if (!slugTouched) updateSlug(slugify(next));
  }

  function submitWithStatus(nextStatus: string) {
    setStatus(nextStatus);
    if (statusRef.current) statusRef.current.value = nextStatus;
    formRef.current?.requestSubmit();
  }

  function proceedSaveDraft() {
    setFieldErrors({});
    setPublishAlert("");
    setMoveToDraftOpen(false);
    submitWithStatus("draft");
  }

  function attemptSaveDraft() {
    if (!title.trim()) {
      const errors = { title: "Title is required to save a draft." };
      setFieldErrors(errors);
      setPublishAlert("");
      scrollToField("title");
      return;
    }
    if (isPublished) {
      setMoveToDraftOpen(true);
      return;
    }
    proceedSaveDraft();
  }

  function attemptPublish() {
    const errors = validateRecipeForPublish({ title, fields, values });
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const count = Object.keys(errors).length;
      setPublishAlert(
        count === 1
          ? "1 issue must be resolved before publishing."
          : `${count} issues must be resolved before publishing.`,
      );
      const firstKey = errors.title ? "title" : Object.keys(errors)[0];
      const advancedKeys = new Set([
        ...ADVANCED_KEYS,
        ...specialistFields.map((field) => field.key),
      ]);
      if (advancedKeys.has(firstKey)) setAdvancedOpen(true);
      scrollToField(firstKey, { pulse: true, updateHash: true });
      return;
    }
    setFieldErrors({});
    setPublishAlert("");
    if (aiMeta?.generatedByAI && aiMeta.verificationStatus !== "verified") {
      setPublishAiWarningOpen(true);
      return;
    }
    submitWithStatus("published");
  }

  function proceedPublishAnyway() {
    setPublishAiWarningOpen(false);
    submitWithStatus("published");
  }

  function renderField(
    field: Field,
    {
      compact = false,
      emphasis = false,
      detailsLayout,
    }: {
      compact?: boolean;
      emphasis?: boolean;
      detailsLayout?: "servings" | "unit" | "timing" | "classification";
    } = {},
  ) {
    const isWide =
      field.kind === "textarea" ||
      field.kind === "ingredients" ||
      field.kind === "instructions" ||
      field.kind === "namedNotes" ||
      field.kind === "gallery" ||
      field.kind === "nutrition" ||
      field.key === "utensils" ||
      field.key === "tags";

    const alignDetails =
      detailsLayout === "servings" ||
      detailsLayout === "unit" ||
      detailsLayout === "timing" ||
      detailsLayout === "classification";
    const reserveHelper =
      detailsLayout === "timing" || detailsLayout === "classification";

    const displayLabel =
      field.key === "bakeMinutes"
        ? bakeTimeDisplayLabel(typeName, field.label)
        : field.key === "imageAlt"
          ? "Image description (alt text)"
          : detailsLayout === "unit"
            ? "Unit"
            : field.label;

    const displayHelp =
      field.key === "imageAlt"
        ? "Describe the hero image for accessibility. Write what a sighted reader needs to understand the photo."
        : field.key === "nutrition"
          ? "AI estimates are per serving from ingredients and yield. Mark as verified only after review."
          : field.helpText;

    const fieldPath = `values.${field.key}`;
    const fieldDef = getRecipeFieldAiDef(fieldPath, fields);
    const fieldAnnotation = activeAiAnnotation(fieldPath, field.kind, values[field.key]);
    const showFieldAi =
      Boolean(fieldDef) &&
      isRecipeFieldAiSupported(fieldPath, fields) &&
      !FIELD_AI_UI_EXCLUDED.has(field.key);

    function clearFieldError() {
      if (fieldErrors[field.key]) {
        setFieldErrors((current) => {
          const next = { ...current };
          delete next[field.key];
          return next;
        });
      }
    }

    return (
      <MissingRequiredFieldFrame
        key={field.key}
        fieldKey={field.key}
        label={displayLabel}
        isMissing={missingFieldKeySet.has(field.key)}
        isPulsing={pulsingFieldKey === field.key}
        style={scrollTargetStyle}
        className={
          detailsLayout === "timing" ||
          detailsLayout === "servings" ||
          detailsLayout === "unit" ||
          detailsLayout === "classification"
            ? "min-w-0"
            : isWide
              ? "md:col-span-2 min-w-0"
              : "min-w-0"
        }
      >
        <FieldLabel
          label={displayLabel}
          required={field.required}
          helpText={displayHelp}
          compact={compact}
          confidence={fieldAnnotation.confidence}
          sourceNote={fieldAnnotation.sourceNote}
          alignSlots={alignDetails}
          reserveHelper={reserveHelper}
          aiAction={
            showFieldAi ? (
              <FieldAiFieldActions
                path={fieldPath}
                kind={field.kind}
                strategy={fieldDef?.strategy}
                value={values[field.key]}
                busy={fieldAiBusy === fieldPath}
                disabled={Boolean(aiMeta && isFieldLocked(fieldPath, aiMeta))}
                emphasized={evaluatorReviewPaths.has(fieldPath)}
                onAction={(intent) => void runFieldAi(fieldPath, field.key, intent)}
              />
            ) : undefined
          }
          overflow={
            aiMeta ? (
              <FieldOverflowMenu
                path={fieldPath}
                label={displayLabel}
                aiMeta={aiMeta}
                canRunAi={showFieldAi && !isFieldLocked(fieldPath, aiMeta)}
                onRunAi={(intent) => void runFieldAi(fieldPath, field.key, intent)}
                onLock={() => lockFieldAtPath(fieldPath)}
                onUnlock={() => unlockFieldAtPath(fieldPath)}
                onConfirm={() => confirmFieldAtPath(fieldPath)}
              />
            ) : undefined
          }
        />
        <div
          className={alignDetails ? "min-w-0 self-start pt-0.5" : "contents"}
          data-field-slot={alignDetails ? "control" : undefined}
        >
        {field.key === "youtube" ? (
          <YoutubeMetadataEditor
            value={values[field.key]}
            onChange={(state) => {
              setField(field.key, state);
              clearFieldError();
            }}
            confidenceByPath={aiMeta?.confidenceByPath}
            canonicalChaptersActive={instructionChapterContext.canonicalChaptersActive}
            invalidPaths={
              fieldErrors[field.key]
                ? new Set(
                    validateYoutubeMetadataEditorState(
                      (values[field.key] as YoutubeMetadataEditorState) ??
                        youtubeMetadataToEditorState(undefined),
                    ).map((issue) => issue.path),
                  )
                : undefined
            }
          />
        ) : field.kind === "tags" || field.key === "tags" ? (
          <TagsChipEditor
            value={Array.isArray(values[field.key]) ? (values[field.key] as string[]) : []}
            onChange={(next) => {
              setField(field.key, next);
              clearFieldError();
            }}
            onOptimize={() =>
              void runFieldAi(
                "values.tags",
                "tags",
                tagOptimizeProposal || (Array.isArray(values.tags) && values.tags.length)
                  ? "improve"
                  : "generate",
              )
            }
            optimizeBusy={tagOptimizeBusy || fieldAiBusy === "values.tags"}
            optimizeProposal={tagOptimizeProposal}
            optimizeLabel={
              Array.isArray(values.tags) && values.tags.length ? "✦ Improve tags" : "✦ Suggest tags"
            }
            onApplyOptimize={() => {
              if (tagOptimizePendingRef.current) {
                applyTargetedFill(tagOptimizePendingRef.current);
                tagOptimizePendingRef.current = null;
              } else if (tagOptimizeProposal) {
                setField("tags", tagOptimizeProposal);
              }
              setTagOptimizeProposal(null);
            }}
            onDismissOptimize={() => {
              tagOptimizePendingRef.current = null;
              setTagOptimizeProposal(null);
            }}
            onTryAnotherOptimize={() => void runFieldAi("values.tags", "tags", "alternative")}
          />
        ) : field.key === "instructions" ? (
          <InstructionsVideoVerificationLayout
            values={values}
            stickyTopPx={scrollOffset}
            stickyBottomPx={64}
            onInstructionsChange={(next) => {
              setField("instructions", next);
              clearFieldError();
            }}
            typeFields={fields}
            fieldAiBusy={fieldAiBusy}
            fieldSuggestions={fieldSuggestions}
            fieldAiNotice={fieldAiNotice}
            onRunFieldAi={(path, _parentKey, intent) => void runFieldAi(path, field.key, intent)}
            onApplyFieldSuggestion={applyFieldSuggestion}
            onClearFieldSuggestion={clearFieldSuggestion}
            expandedGroups={instructionExpandedGroups}
            onToggleGroup={(groupIndex) =>
              setInstructionExpandedGroups((current) => ({
                ...current,
                [groupIndex]: !current[groupIndex],
              }))
            }
            onExpandAll={() => {
              const groups = Array.isArray(values.instructions)
                ? (values.instructions as { steps: string[] }[])
                : [];
              const next: Record<number, boolean> = {};
              groups.forEach((_, index) => {
                next[index] = true;
              });
              setInstructionExpandedGroups(next);
            }}
            onCollapseAll={() => setInstructionExpandedGroups({})}
            reviewPaths={evaluatorReviewPaths}
            missingPaths={evaluatorMissingPaths}
            pulsingPath={pulsingPath}
            videoDurationSeconds={instructionChapterContext.videoDurationSeconds}
            stageAlignments={instructionChapterContext.stageAlignments}
            legacyTimestamps={instructionChapterContext.legacyTimestamps}
            chapterValidationIssues={instructionChapterContext.chapterValidationIssues}
            onChapterFieldChange={handleInstructionChapterFieldChange}
            onNavigateChapterIssue={handleNavigateChapterIssue}
            typeId={typeId}
            youtubeUrl={String(values.youtubeUrl ?? "")}
            title={title}
            aiMeta={aiMeta}
            onApplyChapterSuggestions={handleApplyChapterSuggestions}
            recipeId={recipeId}
            isDirty={isDirty && !saved}
          />
        ) : (
          <KindInput
            fieldKey={field.key}
            kind={field.kind}
            options={field.options}
            value={values[field.key]}
            onChange={(value) => {
              setField(field.key, value);
              clearFieldError();
            }}
            compact={compact}
            emphasis={emphasis}
            invalid={Boolean(fieldErrors[field.key])}
            typeFields={fields}
            fieldAiBusy={fieldAiBusy}
            fieldSuggestions={fieldSuggestions}
            fieldAiNotice={fieldAiNotice}
            onRunFieldAi={(path, _parentKey, intent) => void runFieldAi(path, field.key, intent)}
            onApplyFieldSuggestion={applyFieldSuggestion}
            onClearFieldSuggestion={clearFieldSuggestion}
            instructionExpandedGroups={instructionExpandedGroups}
            onInstructionToggle={(groupIndex) =>
              setInstructionExpandedGroups((current) => ({
                ...current,
                [groupIndex]: !current[groupIndex],
              }))
            }
            onInstructionExpandAll={() => {
              const groups = Array.isArray(values.instructions)
                ? (values.instructions as { steps: string[] }[])
                : [];
              const next: Record<number, boolean> = {};
              groups.forEach((_, index) => {
                next[index] = true;
              });
              setInstructionExpandedGroups(next);
            }}
            onInstructionCollapseAll={() => setInstructionExpandedGroups({})}
            faqExpandedRows={faqExpandedRows}
            onFaqToggle={(index) =>
              setFaqExpandedRows((current) => ({ ...current, [index]: !current[index] }))
            }
            keyIngredientExpandedIndex={keyIngredientExpandedIndex}
            onKeyIngredientExpand={setKeyIngredientExpandedIndex}
            pulsingPath={pulsingPath}
            reviewPaths={evaluatorReviewPaths}
            missingPaths={evaluatorMissingPaths}
            videoDurationSeconds={instructionChapterContext.videoDurationSeconds}
            stageAlignments={instructionChapterContext.stageAlignments}
            legacyTimestamps={instructionChapterContext.legacyTimestamps}
            chapterValidationIssues={instructionChapterContext.chapterValidationIssues}
            onChapterFieldChange={handleInstructionChapterFieldChange}
          />
        )}
        {fieldAiBusy === fieldPath && !fieldSuggestions[fieldPath] ? (
          <p className="mt-1.5 text-xs text-muted" role="status">
            Generating suggestion…
          </p>
        ) : null}
        {fieldSuggestions[fieldPath] ? (
          <FieldAiSuggestionPanel
            currentValue={fieldSuggestions[fieldPath].currentValue}
            suggestion={fieldSuggestions[fieldPath].suggestion}
            busy={fieldAiBusy === fieldPath}
            onUseSuggestion={() => applyFieldSuggestion(fieldPath)}
            onTryAnother={() => void runFieldAi(fieldPath, field.key, "alternative")}
            onKeepCurrent={() => clearFieldSuggestion(fieldPath)}
          />
        ) : null}
        {fieldAiNotice[fieldPath] ? (
          <p
            className={`mt-1.5 text-xs font-semibold ${
              fieldAiNotice[fieldPath] === "AI SUGGESTION — REVIEW" ? "text-olive" : "text-terracotta"
            }`}
            role="status"
          >
            {fieldAiNotice[fieldPath]}
          </p>
        ) : null}
        {fieldErrors[field.key] ? (
          <p className={fieldErrorClass} role="alert">
            {fieldErrors[field.key]}
          </p>
        ) : null}
        </div>
      </MissingRequiredFieldFrame>
    );
  }

  const documentStateLabel = isDirty && !saved ? "Unsaved" : "Saved";
  const documentStateIsUnsaved = isDirty && !saved;
  const publicationLabel = isPublished ? "Published" : "Draft";
  const reviewStateLabel =
    aiMeta?.generatedByAI && aiMeta.verificationStatus === "verified"
      ? "Staff verified"
      : aiMeta?.generatedByAI
        ? "AI draft"
        : null;
  const previewHref = slug.trim() ? `/recipes/${slug.trim()}` : undefined;

  return (
    <div className="relative isolate min-w-0 max-w-full overflow-x-clip">
      <div ref={actionBarSentinelRef} className="h-px w-full" aria-hidden />
      <div
        ref={stickyHeaderRef}
        className={`sticky top-0 z-50 isolate border-b border-line/70 bg-[var(--cream)] transition-[padding] duration-150 motion-reduce:transition-none ${adminRecipeEditorStickyBleedClass}`}
      >
        <div className={mobileHeaderCompact ? "hidden md:block" : "block"}>
          <div className="flex flex-col gap-2.5 py-2.5 md:py-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="min-w-0 flex-1">
              <Link
                href="/admin"
                className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
              >
                ← Recipes
              </Link>
              <div className="mt-0.5 flex min-w-0 items-baseline gap-x-2.5">
                <h1 className="min-w-0 flex-1 font-serif text-xl leading-tight text-ink md:text-2xl">
                  {pageTitle}
                </h1>
                <span className="hidden shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive 2xl:inline">
                  {typeName}
                </span>
              </div>
              <p className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-0 text-xs font-semibold text-muted">
                <span className="mr-1.5 font-semibold uppercase tracking-[0.14em] text-olive 2xl:hidden">
                  {typeName}
                </span>
                <span className="mr-1.5 text-line 2xl:hidden" aria-hidden>
                  ·
                </span>
                <span className={documentStateIsUnsaved ? "text-terracotta" : "text-muted"}>
                  {documentStateLabel}
                </span>
                <span className="mx-1.5 text-line" aria-hidden>
                  ·
                </span>
                {publicationLabel}
                {reviewStateLabel ? (
                  <>
                    <span className="mx-1.5 text-line" aria-hidden>
                      ·
                    </span>
                    {reviewStateLabel}
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              {previewHref ? (
                <Link
                  href={previewHref}
                  target="_blank"
                  rel="noreferrer"
                  className={`${adminSecondaryButtonClass} ${adminFocusRing} min-h-9`}
                >
                  Preview
                </Link>
              ) : null}
              <div className="relative" ref={moreMenuRef}>
                <button
                  type="button"
                  aria-expanded={moreMenuOpen}
                  aria-haspopup="menu"
                  aria-label="More actions"
                  onClick={() => setMoreMenuOpen((open) => !open)}
                  className={`${adminFocusRing} inline-flex min-h-9 min-w-9 items-center justify-center rounded-sm text-sm font-semibold text-muted/60 transition-colors duration-150 hover:text-muted`}
                >
                  ⋯
                </button>
                {moreMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 z-[60] mt-1 min-w-[12rem] border border-line bg-paper py-1 shadow-sm"
                  >
                    {isPublished ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={`flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          attemptSaveDraft();
                        }}
                      >
                        Move to draft
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        className={`flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          attemptPublish();
                        }}
                      >
                        Publish
                      </button>
                    )}
                    {aiMeta ? (
                      <button
                        type="button"
                        role="menuitem"
                        className={`flex w-full items-center px-3 py-2 text-left text-sm font-semibold text-muted hover:bg-cream hover:text-terracotta ${adminFocusRing}`}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          downloadAiJson();
                        }}
                      >
                        Download AI JSON
                      </button>
                    ) : null}
                    {recipeId ? (
                      <div role="none" className="border-t border-line px-3 py-2">
                        <DeleteRecipeButton recipeId={recipeId} recipeTitle={pageTitle} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={attemptUpdateRecipe}
                className={`${adminCompactPrimaryButtonClass} ${adminFocusRing}`}
              >
                Update recipe
              </button>
            </div>
          </div>
        </div>

        <div
          className={`${mobileHeaderCompact ? "flex" : "hidden"} items-center gap-2 py-1.5 md:hidden`}
        >
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={pageTitle}>
            {pageTitle}
          </p>
          {documentStateIsUnsaved ? <span className="sr-only">Unsaved</span> : null}
          <button
            type="button"
            onClick={attemptUpdateRecipe}
            aria-label="Update recipe"
            className={`${adminCompactPrimaryButtonClass} ${adminFocusRing}`}
          >
            Update
          </button>
        </div>
      </div>

      <div ref={headerSentinelRef} className="h-px md:hidden" aria-hidden />

      <form
        ref={formRef}
        action={saveRecipeAction}
        className="grid gap-8 pb-24 [&_input:not([type='hidden']):not([type='file'])]:[scroll-margin-top:var(--recipe-editor-scroll-offset)] [&_select]:[scroll-margin-top:var(--recipe-editor-scroll-offset)] [&_textarea]:[scroll-margin-top:var(--recipe-editor-scroll-offset)]"
        style={
          {
            "--recipe-editor-scroll-offset": `${scrollOffset}px`,
            scrollPaddingTop: scrollOffset,
          } as React.CSSProperties
        }
      >
        <input type="hidden" name="id" value={recipeId || ""} />
        <input ref={statusRef} type="hidden" name="status" value={status} />
        <input type="hidden" name="aiMeta" value={serializeRecipeAiMeta(aiMeta)} />
        {/* typeId is submitted via the Discovery select */}
        {!typeOptions.some((type) => type.id === typeId) ? (
          <input type="hidden" name="typeId" value={typeId} />
        ) : null}
        {fields.map((field) => (
          <input key={field.key} type="hidden" name={`field:${field.key}`} value={encoded[field.key]} />
        ))}
        {!fields.some((field) => field.key === "dishName") ? (
          <input type="hidden" name="field:dishName" value={encoded.dishName ?? '""'} />
        ) : null}
        {categoryIds.map((id) => (
          <input key={id} type="hidden" name="categoryIds" value={id} />
        ))}

        {aiNotice ? (
          <p
            className="rounded-sm border border-terracotta/25 bg-terracotta/5 px-3 py-2 text-sm text-terracotta"
            role="status"
          >
            {aiNotice}
          </p>
        ) : null}

        <AiRecipeAssistant
          typeId={typeId}
          recipeId={recipeId}
          editorHasContent={formHasContent}
          youtubeUrl={String(values.youtubeUrl ?? "")}
          onYoutubeUrlChange={(url) => setField("youtubeUrl", url)}
          linkedVideoId={youtubeVideoId(String(values.youtubeUrl ?? ""))}
          aiMeta={aiMeta}
          current={{ title, slug, excerpt, categoryIds, values }}
          missingCount={missingFields.missing.length}
          missingFields={missingFields.missing}
          blockingMissingCount={fieldEvaluation.counts.blockingMissing}
          aiFillableCount={fieldEvaluation.counts.aiFillableEmpty}
          needsReviewCount={fieldEvaluation.counts.needsReview}
          confirmedCount={fieldEvaluation.counts.confirmed}
          fromVideoCount={fieldEvaluation.counts.fromVideo}
          onApply={applyAiDraft}
          onTargetedFill={applyTargetedFill}
          onReviewEstimated={reviewEstimatedFields}
          onMarkVerified={markAiVerified}
          onDownloadJson={downloadAiJson}
          onNavigateMissing={() => startIssueWorkflow("missing")}
          onNavigateReview={() => startIssueWorkflow("review")}
        />

        {publishAlert ? (
          <div
            className="rounded-sm border border-terracotta/30 bg-terracotta/5 px-4 py-3"
            role="alert"
            style={scrollTargetStyle}
          >
            <p className="text-sm font-semibold text-terracotta">{publishAlert}</p>
            {Object.keys(fieldErrors).length > 0 ? (
              <ul className="mt-2 list-none space-y-1 p-0 text-sm">
                {Object.entries(fieldErrors).map(([key, message]) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => scrollToField(key)}
                      className={`text-left font-semibold text-terracotta underline-offset-2 hover:underline ${adminFocusRing}`}
                    >
                      {message}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {publishContentWarnings.length > 0 ? (
          <div
            className="rounded-sm border border-olive/30 bg-olive/5 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-semibold text-olive">Public catalog completeness</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {publishContentWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <RecipeEditorSectionNav
          ref={sectionNavRef}
          sections={sectionLinks}
          stickyTop={headerHeight}
          scrollMarginTop={scrollOffset}
          onNavigate={scrollToSection}
          onNavigateToMissing={navigateToSectionMissing}
          onNavigateToReview={navigateToSectionReview}
          activeSectionId={activeSectionId}
          compact={mobileHeaderCompact}
        />

        {issueWorkflow && activeIssueList.length > 0 ? (
          <EditorIssueNavigator
            issues={activeIssueList}
            index={issueWorkflow.index}
            label={issueWorkflow.kind === "missing" ? "Missing field" : "Review field"}
            onPrevious={() => navigateIssueByOffset(-1)}
            onNext={() => navigateIssueByOffset(1)}
            onClose={() => setIssueWorkflow(null)}
          />
        ) : null}

        <EditorSection
          id={SECTION_BASICS}
          scrollTargetStyle={scrollTargetStyle}
          title="Basics"
          description="Identity, summary, and discovery settings."
        >
          {renderSectionCompletenessBanner("basics")}
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-ink">Identity</h3>
              <div className="mt-3 space-y-4">
                <MissingRequiredFieldFrame
                  fieldKey="title"
                  label="Title"
                  isMissing={missingFieldKeySet.has("title")}
                  isPulsing={pulsingFieldKey === "title"}
                  className="group/field grid max-w-3xl gap-1.5"
                  style={scrollTargetStyle}
                >
                  <label className="grid gap-1.5">
                    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          Title<span className="text-terracotta"> *</span>
                        </span>
                        <FieldAiFieldActions
                          path="title"
                          kind="text"
                          strategy="gemini_semantic"
                          value={title}
                          busy={fieldAiBusy === "title"}
                          emphasized={evaluatorReviewPaths.has("title")}
                          onAction={(intent) => void runFieldAi("title", "title", intent)}
                        />
                      </span>
                      <AiConfidenceBadge
                        confidence={activeAiAnnotation("title", "text", title).confidence}
                        sourceNote={activeAiAnnotation("title", "text", title).sourceNote}
                      />
                    </span>
                    <input
                      name="title"
                      required
                      value={title}
                      onChange={(event) => {
                        onTitleChange(event.target.value);
                        if (fieldErrors.title) {
                          setFieldErrors((current) => {
                            const next = { ...current };
                            delete next.title;
                            return next;
                          });
                        }
                      }}
                      aria-invalid={Boolean(fieldErrors.title)}
                      className={`${adminInputClass} ${fieldErrors.title ? inputErrorClass : ""}`}
                    />
                    {fieldErrors.title ? (
                      <span className={fieldErrorClass} role="alert">
                        {fieldErrors.title}
                      </span>
                    ) : null}
                    {fieldSuggestions.title ? (
                      <FieldAiSuggestionPanel
                        currentValue={fieldSuggestions.title.currentValue}
                        suggestion={fieldSuggestions.title.suggestion}
                        busy={fieldAiBusy === "title"}
                        onUseSuggestion={() => applyFieldSuggestion("title")}
                        onTryAnother={() => void runFieldAi("title", "title", "alternative")}
                        onKeepCurrent={() => clearFieldSuggestion("title")}
                      />
                    ) : null}
                    {fieldAiBusy === "title" && !fieldSuggestions.title ? (
                      <p className="text-xs text-muted" role="status">
                        Generating suggestion…
                      </p>
                    ) : null}
                    {fieldAiNotice.title ? (
                      <p
                        className={`text-xs font-semibold ${
                          fieldAiNotice.title === "AI SUGGESTION — REVIEW"
                            ? "text-olive"
                            : "text-terracotta"
                        }`}
                        role="status"
                      >
                        {fieldAiNotice.title}
                      </p>
                    ) : null}
                  </label>
                </MissingRequiredFieldFrame>

                <label
                  id="recipe-field-dishName"
                  className="group/field grid max-w-3xl gap-1.5"
                  style={scrollTargetStyle}
                >
                  <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">Dish name</span>
                      <FieldAiFieldActions
                        path="values.dishName"
                        kind="text"
                        strategy="gemini_semantic"
                        value={String(values.dishName ?? "")}
                        busy={fieldAiBusy === "values.dishName"}
                        emphasized={evaluatorReviewPaths.has("values.dishName")}
                        onAction={(intent) => void runFieldAi("values.dishName", "dishName", intent)}
                      />
                    </span>
                    <AiConfidenceBadge
                      confidence={
                        activeAiAnnotation("values.dishName", "text", values.dishName).confidence
                      }
                      sourceNote={
                        activeAiAnnotation("values.dishName", "text", values.dishName).sourceNote
                      }
                    />
                  </span>
                  <input
                    value={String(values.dishName ?? "")}
                    onChange={(event) => setField("dishName", event.target.value)}
                    className={adminInputClass}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted">
                    Short editorial name used on recipe cards and discovery surfaces. Leave blank to
                    use the recipe title.
                  </p>
                  {fieldSuggestions["values.dishName"] ? (
                    <FieldAiSuggestionPanel
                      currentValue={fieldSuggestions["values.dishName"].currentValue}
                      suggestion={fieldSuggestions["values.dishName"].suggestion}
                      busy={fieldAiBusy === "values.dishName"}
                      onUseSuggestion={() => applyFieldSuggestion("values.dishName")}
                      onTryAnother={() =>
                        void runFieldAi("values.dishName", "dishName", "alternative")
                      }
                      onKeepCurrent={() => clearFieldSuggestion("values.dishName")}
                    />
                  ) : null}
                  {fieldAiBusy === "values.dishName" && !fieldSuggestions["values.dishName"] ? (
                    <p className="text-xs text-muted" role="status">
                      Generating suggestion…
                    </p>
                  ) : null}
                  {fieldAiNotice["values.dishName"] ? (
                    <p
                      className={`text-xs font-semibold ${
                        fieldAiNotice["values.dishName"] === "AI SUGGESTION — REVIEW"
                          ? "text-olive"
                          : "text-terracotta"
                      }`}
                      role="status"
                    >
                      {fieldAiNotice["values.dishName"]}
                    </p>
                  ) : null}
                </label>

                <label
                  id="recipe-field-excerpt"
                  className="group/field grid max-w-[72ch] gap-1.5"
                  style={scrollTargetStyle}
                >
                  <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">Excerpt</span>
                      <FieldAiFieldActions
                        path="excerpt"
                        kind="textarea"
                        excerpt={excerpt}
                        value={excerpt}
                        busy={fieldAiBusy === "excerpt"}
                        emphasized={evaluatorReviewPaths.has("excerpt")}
                        onAction={(intent) => void runFieldAi("excerpt", "excerpt", intent)}
                      />
                    </span>
                    <AiConfidenceBadge
                      confidence={activeAiAnnotation("excerpt", "textarea", excerpt).confidence}
                      sourceNote={activeAiAnnotation("excerpt", "textarea", excerpt).sourceNote}
                    />
                  </span>
                  <textarea
                    name="excerpt"
                    value={excerpt}
                    onChange={(event) => updateExcerpt(event.target.value)}
                    rows={3}
                    className={`${adminInputClass} h-auto min-h-[4.5rem] resize-y`}
                  />
                  {fieldSuggestions.excerpt ? (
                    <FieldAiSuggestionPanel
                      currentValue={fieldSuggestions.excerpt.currentValue}
                      suggestion={fieldSuggestions.excerpt.suggestion}
                      busy={fieldAiBusy === "excerpt"}
                      onUseSuggestion={() => applyFieldSuggestion("excerpt")}
                      onTryAnother={() => void runFieldAi("excerpt", "excerpt", "alternative")}
                      onKeepCurrent={() => clearFieldSuggestion("excerpt")}
                    />
                  ) : null}
                  {fieldAiNotice.excerpt ? (
                    <p
                      className={`text-xs font-semibold ${
                        fieldAiNotice.excerpt === "AI SUGGESTION — REVIEW"
                          ? "text-olive"
                          : "text-terracotta"
                      }`}
                      role="status"
                    >
                      {fieldAiNotice.excerpt}
                    </p>
                  ) : null}
                </label>

                <label
                  id="recipe-field-slug"
                  className="grid max-w-sm gap-1.5"
                  style={scrollTargetStyle}
                >
                  <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                      Slug
                    </span>
                    <AiConfidenceBadge
                      confidence={activeAiAnnotation("slug", "text", slug).confidence}
                      sourceNote={activeAiAnnotation("slug", "text", slug).sourceNote}
                    />
                  </span>
                  <input
                    name="slug"
                    value={slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      updateSlug(event.target.value);
                    }}
                    className={compactInputClass}
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-line/70 pt-5">
              <h3 className="text-sm font-semibold text-ink">Discovery</h3>
              <p className="mt-1 text-xs text-muted">
                Editorial flags and taxonomy for menus, filters, and featured placement.
              </p>
              <label
                id="recipe-field-typeId"
                className="mt-4 grid max-w-sm gap-1.5"
                style={scrollTargetStyle}
              >
                <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">Recipe type</span>
                  {aiMeta?.recipeTypeSource === "ai" && !aiMeta.recipeTypeConfirmed ? (
                    <AiConfidenceBadge
                      confidence={
                        aiMeta.recipeTypeConfidence === "HIGH"
                          ? "HIGH_CONFIDENCE_INFERENCE"
                          : aiMeta.recipeTypeConfidence === "MEDIUM"
                            ? "ESTIMATED"
                            : "UNKNOWN"
                      }
                      sourceNote="Inferred from video / import"
                    />
                  ) : aiMeta?.recipeTypeSource === "manual" || aiMeta?.recipeTypeConfirmed ? (
                    <span
                      className="max-w-full text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-olive"
                      title="Staff selected"
                    >
                      Staff verified
                    </span>
                  ) : null}
                </span>
                <select
                  name="typeId"
                  value={typeId}
                  onChange={(event) => updateTypeId(event.target.value)}
                  className={`${adminSelectClass} w-full`}
                  required
                >
                  {typeOptions.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted">
                  Structural recipe classification. Separate from Course and Categories.
                </p>
              </label>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex min-h-9 items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    name="featured"
                    checked={featured}
                    onChange={(event) => setFeatured(event.target.checked)}
                    className="rounded-sm border-line"
                  />
                  Featured
                </label>
                <label className="flex min-h-9 items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    name="seasonal"
                    checked={seasonal}
                    onChange={(event) => setSeasonal(event.target.checked)}
                    className="rounded-sm border-line"
                  />
                  Seasonal
                </label>
              </div>
              <div className="mt-5 min-w-0 max-w-full">
                <div className="mb-2 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-sm font-semibold text-ink">Categories</p>
                  <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
                    <FieldAiFieldActions
                      path="categoryIds"
                      categoryIds={categoryIds}
                      value={categoryIds}
                      busy={fieldAiBusy === "categoryIds"}
                      emphasized={evaluatorReviewPaths.has("categoryIds")}
                      onAction={(intent) => void runFieldAi("categoryIds", "categoryIds", intent)}
                    />
                    <AiConfidenceBadge
                      confidence={
                        activeAiAnnotation("categoryIds", "categories", categoryIds).confidence
                      }
                      sourceNote={
                        activeAiAnnotation("categoryIds", "categories", categoryIds).sourceNote
                      }
                    />
                  </div>
                </div>
                {categoryIds.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {categoryIds.map((id) => {
                      const category = categories.find((row) => row.id === id);
                      if (!category) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line bg-cream/30 px-2 py-0.5 text-xs font-medium text-ink"
                        >
                          <span className="truncate">{category.name}</span>
                          <button
                            type="button"
                            className={`${adminFocusRing} rounded-sm px-0.5 text-muted/70 hover:text-terracotta`}
                            aria-label={`Remove ${category.name}`}
                            onClick={() => toggleCategory(id)}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <div className="grid min-w-0 max-w-full gap-1">
                  {categoryGroups.map((group) => {
                    const selectedInGroup = group.categories.filter((category) =>
                      categoryIds.includes(category.id),
                    ).length;
                    const hasSelected = selectedInGroup > 0;
                    const collapsed = categoryGroupCollapsed[group.group] ?? !hasSelected;
                    return (
                      <div key={group.group} className="min-w-0 max-w-full border-b border-line/60 last:border-b-0">
                        <button
                          type="button"
                          aria-expanded={!collapsed}
                          className={`flex w-full min-w-0 max-w-full items-center justify-between gap-2 py-2.5 text-left ${adminFocusRing}`}
                          onClick={() =>
                            setCategoryGroupCollapsed((current) => ({
                              ...current,
                              [group.group]: !(current[group.group] ?? !hasSelected),
                            }))
                          }
                        >
                          <span className="min-w-0 flex-1 truncate text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                            {group.label}
                          </span>
                          <span className="shrink-0 text-xs text-muted">
                            {hasSelected
                              ? `${selectedInGroup} selected`
                              : collapsed
                                ? "Show"
                                : "Hide"}
                          </span>
                        </button>
                        {!collapsed ? (
                          <div className="flex min-w-0 flex-wrap gap-x-4 gap-y-2 pb-3">
                            {group.categories.map((category) => {
                              const selected = categoryIds.includes(category.id);
                              return (
                                <label
                                  key={category.id}
                                  className={`flex min-h-9 min-w-0 max-w-full items-start gap-2 text-sm ${adminFocusRing} ${
                                    selected ? "font-semibold text-ink" : "text-ink/80"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleCategory(category.id)}
                                    className="mt-1 shrink-0"
                                  />
                                  <span className="min-w-0 break-words">{category.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {fieldSuggestions.categoryIds ? (
                  <FieldAiSuggestionPanel
                    currentValue={categoryIds
                      .map((id) => categories.find((category) => category.id === id)?.name ?? id)
                      .join(", ")}
                    suggestion={(fieldSuggestions.categoryIds.suggestion as string[])
                      .map((id) => categories.find((category) => category.id === id)?.name ?? id)
                      .join(", ")}
                    suggestionLabel="Suggested categories"
                    busy={fieldAiBusy === "categoryIds"}
                    onUseSuggestion={() => applyFieldSuggestion("categoryIds")}
                    onTryAnother={() =>
                      void runFieldAi("categoryIds", "categoryIds", "alternative")
                    }
                    onKeepCurrent={() => clearFieldSuggestion("categoryIds")}
                  />
                ) : null}
                {fieldAiNotice.categoryIds ? (
                  <p
                    className={`mt-2 text-xs font-semibold ${
                      fieldAiNotice.categoryIds === "AI SUGGESTION — REVIEW"
                        ? "text-olive"
                        : "text-terracotta"
                    }`}
                    role="status"
                  >
                    {fieldAiNotice.categoryIds}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </EditorSection>

        {detailFields.length ? (
          <EditorSection
            id={SECTION_DETAILS}
            scrollTargetStyle={scrollTargetStyle}
            title="Recipe details"
            description="Times, yield, and metadata shown on the public recipe card."
          >
            {renderSectionCompletenessBanner("details")}
            <div className="grid gap-0">
              {pickFieldsOrdered(detailFields, YIELD_KEYS).length ? (
                <DetailSubgroup label="Yield" layout="yield">
                  {pickFieldsOrdered(detailFields, YIELD_KEYS).map((field) =>
                    renderField(field, {
                      compact: true,
                      detailsLayout: field.key === "servingsUnit" ? "unit" : "servings",
                    }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, TIMING_KEYS).length ? (
                <DetailSubgroup label="Timing" layout="timing">
                  {pickFieldsOrdered(detailFields, TIMING_KEYS).map((field) =>
                    renderField(field, { compact: true, detailsLayout: "timing" }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, CLASSIFICATION_KEYS).length ? (
                <DetailSubgroup label="Classification" layout="classification">
                  {pickFieldsOrdered(detailFields, CLASSIFICATION_KEYS).map((field) =>
                    renderField(field, { compact: true, detailsLayout: "classification" }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, TOOLS_KEYS).length ? (
                <DetailSubgroup label="Tools" layout="medium">
                  {pickFieldsOrdered(detailFields, TOOLS_KEYS).map((field) =>
                    renderField(field, { compact: true }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, TAG_KEYS).length ? (
                <DetailSubgroup label="Tags" layout="medium">
                  {pickFieldsOrdered(detailFields, TAG_KEYS).map((field) =>
                    renderField(field, { compact: true }),
                  )}
                </DetailSubgroup>
              ) : null}
            </div>
          </EditorSection>
        ) : null}

        {contentFields.length ? (
          <EditorSection
            id={SECTION_CONTENT}
            scrollTargetStyle={scrollTargetStyle}
            title="Recipe content"
            description="The story, ingredients, and method — the heart of the recipe."
            emphasis
          >
            {renderSectionCompletenessBanner("content")}
            <div className="grid gap-8">
              {contentFields.map((field) => {
                const isInstructions = field.key === "instructions";
                const isIngredients = field.key === "ingredients";
                const isProse = field.key === "intro" || field.key === "whyItWorks";
                return (
                  <div
                    key={field.key}
                    className={
                      isInstructions
                        ? "rounded-sm border border-line/80 bg-cream/30 p-4 md:p-5"
                        : isIngredients
                          ? "min-w-0 border-y border-line/70 py-5"
                          : isProse
                            ? "max-w-[72ch]"
                            : "max-w-3xl border-t border-line/60 pt-5"
                    }
                  >
                    {renderField(field, { emphasis: isInstructions || isIngredients })}
                  </div>
                );
              })}
            </div>
          </EditorSection>
        ) : null}

        {mediaFields.length ? (
          <EditorSection
            id={SECTION_MEDIA}
            scrollTargetStyle={scrollTargetStyle}
            title="Media"
            description="Hero image and Mesa YouTube video connection."
          >
            {renderSectionCompletenessBanner("media")}
            <RecipeYoutubeConnection
              recipeId={recipeId}
              values={values}
              aiMeta={aiMeta}
              onValuesChange={(next) => {
                setValues(hydrateEditorValues(fields, next));
              }}
              onAiMetaChange={(next) => {
                setAiMeta(next);
              }}
            />
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {mediaFields.map((field) => renderField(field))}
            </div>
          </EditorSection>
        ) : null}

        {advancedFields.length || specialistFields.length ? (
          <section
            id={SECTION_ADVANCED}
            style={scrollTargetStyle}
            className="border-t border-line/70 pt-1"
          >
            <button
              type="button"
              id="recipe-advanced-toggle"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              aria-controls="recipe-advanced-panel"
              className={`block w-full cursor-pointer py-3 text-left ${adminFocusRing}`}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                  Advanced
                </h2>
                <span className="shrink-0 text-base font-semibold leading-none text-muted" aria-hidden>
                  {advancedOpen ? "−" : "+"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Optional video metadata, nutrition, and type-specific fields.
              </p>
              <span className="sr-only">{advancedOpen ? "Collapse advanced fields" : "Expand advanced fields"}</span>
            </button>
            {advancedOpen ? (
              <div
                id="recipe-advanced-panel"
                role="region"
                aria-labelledby="recipe-advanced-toggle"
                className="border-t border-line/70 pb-2 pt-5"
              >
                {renderSectionCompletenessBanner("advanced")}
                <div className="grid gap-5 md:grid-cols-2">
                {advancedFields.map((field) =>
                  field.key === "youtube" ? (
                    <div key={field.key} className="md:col-span-2">
                      {renderField(field)}
                    </div>
                  ) : (
                    renderField(field)
                  ),
                )}
                {specialistFields.map((field) => renderField(field))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

      </form>

      <EditorStickyActionBar
        visible={stickyActionsVisible}
        isDirty={isDirty}
        saved={Boolean(saved)}
        isPublished={isPublished}
        publishLabel="Update recipe"
        previewHref={previewHref}
        onPublish={attemptUpdateRecipe}
      />

      {moveToDraftOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setMoveToDraftOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={moveToDraftTitleId}
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={moveToDraftTitleId} className="font-serif text-2xl text-ink">
              Move to draft?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This saves your edits and removes{" "}
              <span className="font-semibold text-ink">{pageTitle}</span> from the public site until
              you publish again.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                ref={moveToDraftCancelRef}
                type="button"
                onClick={() => setMoveToDraftOpen(false)}
                className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedSaveDraft}
                className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
              >
                Move to draft
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {publishAiWarningOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 px-4"
          role="presentation"
          onClick={() => setPublishAiWarningOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-publish-warning-title"
            className="w-full max-w-md border border-line bg-paper p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="ai-publish-warning-title" className="font-serif text-2xl text-ink">
              Publish without verification?
            </h3>
            <p className="mt-3 text-sm leading-6 text-muted">
              This recipe contains AI-generated information that has not been marked verified.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setPublishAiWarningOpen(false)}
                className={`${adminSecondaryButtonClass} ${adminFocusRing}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedPublishAnyway}
                className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
              >
                Publish anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GranularFieldAiSlot({
  path,
  parentKey,
  value,
  kind,
  typeFields,
  fieldAiBusy,
  fieldSuggestions,
  fieldAiNotice,
  onRunFieldAi,
  onApplyFieldSuggestion,
  onClearFieldSuggestion,
  emphasized = false,
  compact = false,
}: {
  path: string;
  parentKey: string;
  value: unknown;
  kind?: string;
  typeFields: Field[];
  fieldAiBusy: string | null;
  fieldSuggestions: Record<
    string,
    {
      currentValue: unknown;
      suggestion: unknown;
      pending: AiTargetedFillApplyPayload;
    }
  >;
  fieldAiNotice: Record<string, string>;
  onRunFieldAi: (path: string, parentKey: string, intent?: FieldAiIntent) => void;
  onApplyFieldSuggestion: (path: string) => void;
  onClearFieldSuggestion: (path: string) => void;
  emphasized?: boolean;
  compact?: boolean;
}) {
  if (!isRecipeFieldAiSupported(path, typeFields)) return null;

  const def = getRecipeFieldAiDef(path, typeFields);
  const resolvedKind = def?.kind ?? kind;
  const hasContent = fieldPathHasContent({ path, kind: resolvedKind, value });
  const label = resolveFieldAiActionLabel({
    path,
    kind: resolvedKind,
    strategy: def?.strategy,
    hasContent,
  });
  const suggestion = fieldSuggestions[path];
  const notice = fieldAiNotice[path];
  const busy = fieldAiBusy === path;
  const needsAttention = emphasized || Boolean(notice) || Boolean(suggestion);

  return (
    <div className={compact ? "min-w-0" : "grid gap-1.5"}>
      <FieldAiActionButton
        label={label}
        busyLabel="Generating…"
        busy={busy}
        emphasized={needsAttention}
        onClick={() => onRunFieldAi(path, parentKey)}
      />
      {busy && !suggestion ? (
        <p className="text-xs text-muted" role="status">
          Generating suggestion…
        </p>
      ) : null}
      {suggestion ? (
        <FieldAiSuggestionPanel
          currentValue={suggestion.currentValue}
          suggestion={suggestion.suggestion}
          busy={busy}
          onUseSuggestion={() => onApplyFieldSuggestion(path)}
          onTryAnother={() => onRunFieldAi(path, parentKey, "alternative")}
          onKeepCurrent={() => onClearFieldSuggestion(path)}
        />
      ) : null}
      {notice ? (
        <p
          className={`text-xs font-semibold ${
            notice === "AI SUGGESTION — REVIEW" ? "text-olive" : "text-terracotta"
          }`}
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function KindInput({
  fieldKey,
  kind,
  options,
  value,
  onChange,
  compact = false,
  emphasis = false,
  invalid = false,
  typeFields,
  fieldAiBusy = null,
  fieldSuggestions = {},
  fieldAiNotice = {},
  onRunFieldAi,
  onApplyFieldSuggestion,
  onClearFieldSuggestion,
  instructionExpandedGroups = {},
  onInstructionToggle,
  onInstructionExpandAll,
  onInstructionCollapseAll,
  faqExpandedRows = {},
  onFaqToggle,
  keyIngredientExpandedIndex = null,
  onKeyIngredientExpand,
  pulsingPath = null,
  reviewPaths = new Set<string>(),
  missingPaths = new Set<string>(),
  videoDurationSeconds,
  stageAlignments = [],
  legacyTimestamps = [],
  chapterValidationIssues = [],
  onChapterFieldChange,
}: {
  fieldKey: string;
  kind: string;
  options: string[];
  value: unknown;
  onChange: (value: unknown) => void;
  compact?: boolean;
  emphasis?: boolean;
  invalid?: boolean;
  typeFields?: Field[];
  fieldAiBusy?: string | null;
  fieldSuggestions?: Record<
    string,
    {
      currentValue: unknown;
      suggestion: unknown;
      pending: AiTargetedFillApplyPayload;
    }
  >;
  fieldAiNotice?: Record<string, string>;
  onRunFieldAi?: (path: string, parentKey: string, intent?: FieldAiIntent) => void;
  onApplyFieldSuggestion?: (path: string) => void;
  onClearFieldSuggestion?: (path: string) => void;
  instructionExpandedGroups?: Record<number, boolean>;
  onInstructionToggle?: (groupIndex: number) => void;
  onInstructionExpandAll?: () => void;
  onInstructionCollapseAll?: () => void;
  faqExpandedRows?: Record<number, boolean>;
  onFaqToggle?: (index: number) => void;
  keyIngredientExpandedIndex?: number | null;
  onKeyIngredientExpand?: (index: number | null) => void;
  pulsingPath?: string | null;
  reviewPaths?: Set<string>;
  missingPaths?: Set<string>;
  videoDurationSeconds?: number;
  stageAlignments?: RecipeStageAlignment[];
  legacyTimestamps?: RecipeYoutubeTimestamp[];
  chapterValidationIssues?: InstructionChapterValidationIssue[];
  onChapterFieldChange?: (
    groupIndex: number,
    field: "chapterLabel" | "startTimestamp" | "endTimestamp",
    value: string | number | undefined,
  ) => void;
}) {
  const inputClass = `${compact ? compactInputClass : adminInputClass}${invalid ? ` ${inputErrorClass}` : ""}`;
  const isProseField = fieldKey === "intro" || fieldKey === "whyItWorks";
  const textAreaRows = isProseField ? 4 : emphasis ? 6 : 5;
  const textAreaMin = isProseField ? "min-h-[4.5rem]" : "min-h-[5.5rem]";

  if (kind === "textarea") {
    return (
      <textarea
        rows={textAreaRows}
        value={String(value || "")}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={`${adminInputClass} h-auto ${textAreaMin} resize-y${invalid ? ` ${inputErrorClass}` : ""}`}
      />
    );
  }
  if (kind === "number") {
    return (
      <input
        type="number"
        value={Number(value || 0)}
        onChange={(event) => onChange(Number(event.target.value))}
        className={inputClass}
      />
    );
  }
  if (kind === "minutes") {
    return <MinutesInput value={Number(value || 0)} onChange={onChange} compact={compact} />;
  }
  if (kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        Yes
      </label>
    );
  }
  if (kind === "select") {
    return (
      <select
        value={String(value || "")}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      >
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (kind === "image") {
    return (
      <ImageField
        value={String(value || "")}
        onChange={onChange}
        invalid={invalid}
        helpText={fieldKey === "image" ? RECIPE_HERO_IMAGE_HELP : ADMIN_IMAGE_FORMAT_HELP}
      />
    );
  }
  if (kind === "gallery") {
    const urls = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="grid gap-3">
        {urls.map((url, index) => (
          <div key={`${url}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={url}
              onChange={(event) => {
                const next = [...urls];
                next[index] = event.target.value;
                onChange(next);
              }}
              className={`min-w-0 flex-1 ${compactInputClass}`}
            />
            <button
              type="button"
              className={`${removeActionClass} self-start sm:shrink-0`}
              onClick={() => onChange(urls.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </div>
        ))}
        <ImageField
          value=""
          buttonLabel="Add image"
          helpText={ADMIN_IMAGE_FORMAT_HELP}
          onChange={(url) => {
            if (url) onChange([...urls, url]);
          }}
        />
      </div>
    );
  }
  if (kind === "tags") {
    const items = coerceStringList(value);
    return <TagsChipEditor value={items} onChange={(next) => onChange(coerceStringList(next))} />;
  }
  if (fieldKey === "utensils") {
    const items = coerceStringList(value);
    return <UtensilsChipEditor value={items} onChange={(next) => onChange(coerceStringList(next))} />;
  }
  if (kind === "list") {
    const items = coerceStringList(value);
    if (fieldKey === "tips") {
      return (
        <StudioTipsCompactEditor items={items} onChange={(next) => onChange(coerceStringList(next))} />
      );
    }
    return (
      <ListEditor
        items={items}
        onChange={(next) => onChange(coerceStringList(next))}
        placeholder="Item"
        compact={compact}
      />
    );
  }
  if (kind === "namedNotes") {
    const items = Array.isArray(value) ? (value as { name?: string; note?: string }[]) : [];
    if (fieldKey === "faqs" && typeFields && onFaqToggle) {
      return (
        <FaqAccordionEditor
          items={items}
          onChange={onChange}
          parentKey={fieldKey}
          typeFields={typeFields}
          fieldAiBusy={fieldAiBusy}
          fieldSuggestions={fieldSuggestions}
          fieldAiNotice={fieldAiNotice}
          onRunFieldAi={onRunFieldAi}
          onApplyFieldSuggestion={onApplyFieldSuggestion}
          onClearFieldSuggestion={onClearFieldSuggestion}
          expandedRows={faqExpandedRows}
          onToggleRow={onFaqToggle}
          pulsingPath={pulsingPath}
        />
      );
    }
    if (fieldKey === "keyIngredients" && typeFields) {
      return (
        <KeyIngredientsCompactEditor
          items={items}
          onChange={onChange}
          parentKey={fieldKey}
          typeFields={typeFields}
          fieldAiBusy={fieldAiBusy}
          fieldSuggestions={fieldSuggestions}
          fieldAiNotice={fieldAiNotice}
          onRunFieldAi={onRunFieldAi}
          onApplyFieldSuggestion={onApplyFieldSuggestion}
          onClearFieldSuggestion={onClearFieldSuggestion}
          pulsingPath={pulsingPath}
          expandedIndex={keyIngredientExpandedIndex}
          onExpandedIndexChange={onKeyIngredientExpand}
        />
      );
    }
    return (
      <ListEditor
        items={items.map((item) => item.name ?? "")}
        onChange={(next) =>
          onChange(next.map((name) => ({ name, note: "" })))
        }
        placeholder="Item"
        compact={compact}
      />
    );
  }
  if (kind === "ingredients") {
    const groups = Array.isArray(value)
      ? (value as { name?: string; items?: { item: string; amount: string; notes?: string }[] }[])
      : [];
    return (
      <IngredientsEditor
        groups={groups.map((group) => ({
          name: group.name || "",
          items: Array.isArray(group.items) ? group.items : [],
        }))}
        onChange={onChange}
        parentKey={fieldKey}
        typeFields={typeFields}
        fieldAiBusy={fieldAiBusy}
        fieldSuggestions={fieldSuggestions}
        fieldAiNotice={fieldAiNotice}
        onRunFieldAi={onRunFieldAi}
        onApplyFieldSuggestion={onApplyFieldSuggestion}
        onClearFieldSuggestion={onClearFieldSuggestion}
        reviewPaths={reviewPaths}
      />
    );
  }
  if (kind === "instructions") {
    const groups = Array.isArray(value) ? (value as { name?: string; steps: string[] }[]) : [];
    return (
      <InstructionsAccordionEditor
        groups={groups}
        onChange={onChange}
        parentKey={fieldKey}
        typeFields={typeFields ?? []}
        fieldAiBusy={fieldAiBusy}
        fieldSuggestions={fieldSuggestions}
        fieldAiNotice={fieldAiNotice}
        onRunFieldAi={onRunFieldAi}
        onApplyFieldSuggestion={onApplyFieldSuggestion}
        onClearFieldSuggestion={onClearFieldSuggestion}
        expandedGroups={instructionExpandedGroups}
        onToggleGroup={onInstructionToggle ?? (() => undefined)}
        onExpandAll={onInstructionExpandAll ?? (() => undefined)}
        onCollapseAll={onInstructionCollapseAll ?? (() => undefined)}
        reviewPaths={reviewPaths}
        missingPaths={missingPaths}
        pulsingPath={pulsingPath}
        videoDurationSeconds={videoDurationSeconds}
        stageAlignments={stageAlignments}
        legacyTimestamps={legacyTimestamps}
        chapterValidationIssues={chapterValidationIssues}
        onChapterFieldChange={onChapterFieldChange}
      />
    );
  }
  if (kind === "nutrition") {
    const row = (value || {}) as { calories?: number; carbs?: number; protein?: number; fat?: number };
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(["calories", "carbs", "protein", "fat"] as const).map((key) => (
          <label key={key} className="grid gap-1 text-sm capitalize">
            {key}
            <input
              type="number"
              value={row[key] || 0}
              onChange={(event) => onChange({ ...row, [key]: Number(event.target.value) })}
              className={compactInputClass}
            />
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      value={String(value || "")}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  );
}

function MinutesInput({
  value,
  onChange,
  compact = false,
}: {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
}) {
  const inputClass = compact ? compactInputClass : adminInputClass;
  const hours = Math.floor(Math.max(0, value) / 60);
  const minutes = Math.max(0, value) % 60;
  return (
    <div className="grid max-w-[14rem] grid-cols-2 gap-2">
      <label className="grid gap-1 text-xs font-medium text-muted">
        Hours
        <input
          type="number"
          min={0}
          value={hours}
          onChange={(event) => onChange(Number(event.target.value) * 60 + minutes)}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted">
        Minutes
        <input
          type="number"
          min={0}
          value={minutes}
          onChange={(event) => onChange(hours * 60 + Number(event.target.value))}
          className={inputClass}
        />
      </label>
    </div>
  );
}

function ListEditor({
  items,
  onChange,
  placeholder,
  compact = false,
}: {
  items: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  compact?: boolean;
}) {
  const inputClass = compact ? compactInputClass : adminInputClass;
  const rows = coerceStringList(items);
  return (
    <div className="max-w-3xl space-y-2">
      {rows.map((item, index) => (
        <div
          key={index}
          className="flex flex-col gap-1.5 border-b border-line/50 pb-2 last:border-b-0 sm:flex-row sm:items-center sm:gap-2"
        >
          <input
            value={item}
            placeholder={placeholder}
            aria-label={`${placeholder} ${index + 1}`}
            onChange={(event) => {
              const next = [...rows];
              next[index] = event.target.value;
              onChange(next);
            }}
            className={`min-w-0 flex-1 ${inputClass}`}
          />
          <button
            type="button"
            aria-label={`Remove ${placeholder.toLowerCase()} ${index + 1}`}
            className={`${removeActionClass} self-start sm:shrink-0`}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className={editorTextAction} onClick={() => onChange([...rows, ""])}>
        + Add item
      </button>
    </div>
  );
}

function IngredientsEditor({
  groups,
  onChange,
  parentKey,
  typeFields,
  fieldAiBusy = null,
  fieldSuggestions = {},
  fieldAiNotice = {},
  onRunFieldAi,
  onApplyFieldSuggestion,
  onClearFieldSuggestion,
  reviewPaths = new Set<string>(),
}: {
  groups: { name?: string; items: { item: string; amount: string; notes?: string }[] }[];
  onChange: (value: unknown) => void;
  parentKey: string;
  typeFields?: Field[];
  fieldAiBusy?: string | null;
  fieldSuggestions?: Record<
    string,
    {
      currentValue: unknown;
      suggestion: unknown;
      pending: AiTargetedFillApplyPayload;
    }
  >;
  fieldAiNotice?: Record<string, string>;
  onRunFieldAi?: (path: string, parentKey: string, intent?: FieldAiIntent) => void;
  onApplyFieldSuggestion?: (path: string) => void;
  onClearFieldSuggestion?: (path: string) => void;
  reviewPaths?: Set<string>;
}) {
  function update(next: typeof groups) {
    onChange(next);
  }

  function aiSlot(path: string, value: unknown) {
    if (!typeFields || !onRunFieldAi || !onApplyFieldSuggestion || !onClearFieldSuggestion) {
      return null;
    }
    return (
      <GranularFieldAiSlot
        path={path}
        parentKey={parentKey}
        value={value}
        kind="text"
        typeFields={typeFields}
        fieldAiBusy={fieldAiBusy}
        fieldSuggestions={fieldSuggestions}
        fieldAiNotice={fieldAiNotice}
        onRunFieldAi={onRunFieldAi}
        onApplyFieldSuggestion={onApplyFieldSuggestion}
        onClearFieldSuggestion={onClearFieldSuggestion}
        emphasized={reviewPaths.has(path)}
        compact
      />
    );
  }

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6">
      {groups.map((group, groupIndex) => (
        <div
          key={groupIndex}
          className="grid min-w-0 gap-2 border-t border-line/70 pt-5 first:border-t-0 first:pt-0"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <input
              value={group.name || ""}
              placeholder="Group name (optional)"
              aria-label={`Ingredient group ${groupIndex + 1} name`}
              onChange={(event) => {
                const next = [...groups];
                next[groupIndex] = { ...group, name: event.target.value };
                update(next);
              }}
              className={`${compactInputClass} min-w-0 max-w-md flex-1 font-semibold`}
            />
            <div className="group/field min-w-0 shrink">{aiSlot(`values.${parentKey}.${groupIndex}.name`, group.name ?? "")}</div>
            {groups.length > 1 ? (
              <div className="shrink-0">
                <EditorRowActions
                  itemLabel={`ingredient group ${groupIndex + 1}`}
                  upDisabled={groupIndex === 0}
                  downDisabled={groupIndex === groups.length - 1}
                  showRemove={false}
                  onMoveUp={() => update(moveArrayItem(groups, groupIndex, groupIndex - 1))}
                  onMoveDown={() => update(moveArrayItem(groups, groupIndex, groupIndex + 1))}
                />
              </div>
            ) : null}
          </div>

          {/* Desktop column headers — only when usable width supports 5 columns */}
          <div className="hidden gap-x-3 px-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted 2xl:grid 2xl:grid-cols-[1.75rem_minmax(6.5rem,8.5rem)_minmax(0,1.4fr)_minmax(12rem,20rem)_auto]">
            <span className="sr-only">Reorder</span>
            <span>Amount</span>
            <span>Ingredient</span>
            <span>Notes</span>
            <span className="sr-only">Actions</span>
          </div>
          {/* Tablet column headers — Amount / Ingredient only (Notes is row 2) */}
          <div className="hidden gap-x-3 px-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted md:grid md:grid-cols-[1.75rem_minmax(5rem,6.5rem)_minmax(0,1fr)_2.5rem] 2xl:hidden">
            <span className="sr-only">Reorder</span>
            <span className="min-w-0 truncate">Amount</span>
            <span className="min-w-0 truncate">Ingredient</span>
            <span className="sr-only">Actions</span>
          </div>

          {group.items.map((item, itemIndex) => {
            const amountPath = `values.${parentKey}.${groupIndex}.items.${itemIndex}.amount`;
            const itemPath = `values.${parentKey}.${groupIndex}.items.${itemIndex}.item`;
            const notesPath = `values.${parentKey}.${groupIndex}.items.${itemIndex}.notes`;
            return (
              <div
                key={itemIndex}
                className="grid min-w-0 gap-1.5 border-b border-line/40 py-2 last:border-b-0 md:grid-cols-[1.75rem_minmax(5rem,6.5rem)_minmax(0,1fr)_2.5rem] md:items-start 2xl:grid-cols-[1.75rem_minmax(6.5rem,8.5rem)_minmax(0,1.4fr)_minmax(12rem,20rem)_auto]"
              >
                <div className="flex min-h-9 shrink-0 items-center">
                  <EditorDragHandle
                    label={`ingredient ${itemIndex + 1} in group ${groupIndex + 1}`}
                  />
                </div>

                <div className="group/field grid min-w-0 gap-0.5">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted md:sr-only">
                    Amount
                  </span>
                  <input
                    value={item.amount}
                    placeholder="Amount"
                    aria-label={`Amount for ingredient ${itemIndex + 1} in group ${groupIndex + 1}`}
                    onChange={(event) => {
                      const next = [...groups];
                      const items = [...group.items];
                      items[itemIndex] = { ...item, amount: event.target.value };
                      next[groupIndex] = { ...group, items };
                      update(next);
                    }}
                    className={`w-full min-w-0 ${compactInputClass}`}
                  />
                  <div className="min-w-0">{aiSlot(amountPath, item.amount)}</div>
                </div>

                <div className="group/field grid min-w-0 gap-0.5">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted md:sr-only">
                    Ingredient
                  </span>
                  <input
                    value={item.item}
                    placeholder="Ingredient"
                    aria-label={`Ingredient ${itemIndex + 1} in group ${groupIndex + 1}`}
                    onChange={(event) => {
                      const next = [...groups];
                      const items = [...group.items];
                      items[itemIndex] = { ...item, item: event.target.value };
                      next[groupIndex] = { ...group, items };
                      update(next);
                    }}
                    className={`w-full min-w-0 ${compactInputClass}`}
                  />
                  <div className="min-w-0">{aiSlot(itemPath, item.item)}</div>
                </div>

                <div className="group/field grid min-w-0 gap-0.5 md:col-span-3 md:col-start-2 2xl:col-span-1 2xl:col-start-4">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted 2xl:sr-only">
                    Notes
                  </span>
                  <input
                    value={item.notes || ""}
                    placeholder="Notes"
                    aria-label={`Notes for ingredient ${itemIndex + 1} in group ${groupIndex + 1}`}
                    onChange={(event) => {
                      const next = [...groups];
                      const items = [...group.items];
                      items[itemIndex] = { ...item, notes: event.target.value };
                      next[groupIndex] = { ...group, items };
                      update(next);
                    }}
                    className={`w-full min-w-0 ${compactInputClass}`}
                  />
                  <div className="min-w-0">{aiSlot(notesPath, item.notes ?? "")}</div>
                </div>

                <div className="flex min-h-9 shrink-0 items-center justify-end md:col-start-4 md:row-start-1 2xl:col-start-5">
                  <EditorRowActions
                    itemLabel={`ingredient ${itemIndex + 1} in group ${groupIndex + 1}`}
                    upDisabled={itemIndex === 0}
                    downDisabled={itemIndex === group.items.length - 1}
                    onMoveUp={() => {
                      const next = [...groups];
                      next[groupIndex] = {
                        ...group,
                        items: moveArrayItem(group.items, itemIndex, itemIndex - 1),
                      };
                      update(next);
                    }}
                    onMoveDown={() => {
                      const next = [...groups];
                      next[groupIndex] = {
                        ...group,
                        items: moveArrayItem(group.items, itemIndex, itemIndex + 1),
                      };
                      update(next);
                    }}
                    onRemove={() => {
                      const next = [...groups];
                      const items = group.items.filter((_, i) => i !== itemIndex);
                      next[groupIndex] = {
                        ...group,
                        items: items.length ? items : [{ item: "", amount: "", notes: "" }],
                      };
                      update(next);
                    }}
                  />
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className={editorTextAction}
            onClick={() => {
              const next = [...groups];
              next[groupIndex] = {
                ...group,
                items: [...group.items, { item: "", amount: "", notes: "" }],
              };
              update(next);
            }}
          >
            + Add ingredient
          </button>
        </div>
      ))}
      <button
        type="button"
        className={editorTextAction}
        onClick={() =>
          update([...groups, { name: "", items: [{ item: "", amount: "", notes: "" }] }])
        }
      >
        + Add group
      </button>
    </div>
  );
}

function ImageField({
  value,
  onChange,
  buttonLabel = "Upload image",
  invalid = false,
  helpText = RECIPE_HERO_IMAGE_HELP,
}: {
  value: string;
  onChange: (value: string) => void;
  buttonLabel?: string;
  invalid?: boolean;
  helpText?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    const policy = resolveAdminImageUploadPolicy("recipes");
    const localCheck = validateAdminImageFile(file, policy);
    if (!localCheck.ok) {
      window.alert(localCheck.error);
      return;
    }
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    body.set("folder", "recipes");
    const response = await fetch("/api/admin/upload", { method: "POST", body });
    const data = (await response.json()) as { url?: string; error?: string };
    setBusy(false);
    if (data.url) onChange(data.url);
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">{helpText}</p>
      <label className="cursor-pointer">
        <span
          className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
        >
          {busy ? "Uploading…" : buttonLabel}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </label>
      <div className="grid gap-1.5">
        <span className="text-xs text-muted">Or use image URL</span>
        <input
          value={value}
          placeholder="https://…"
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          className={`${compactInputClass}${invalid ? ` ${inputErrorClass}` : ""}`}
        />
      </div>
      {value ? (
        <figure className="overflow-hidden rounded-sm border border-line bg-cream/50">
          <div className="relative aspect-video w-full bg-sand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Hero image preview"
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
        </figure>
      ) : null}
    </div>
  );
}
