"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { saveRecipeAction } from "@/app/admin/actions";
import { AiConfidenceBadge } from "@/components/admin/AiConfidenceBadge";
import { AiDraftReviewSummary } from "@/components/admin/AiDraftReviewSummary";
import {
  AiRecipeAssistant,
  type AiGenerateApplyPayload,
} from "@/components/admin/AiRecipeAssistant";
import { DeleteRecipeButton } from "@/components/admin/DeleteRecipeButton";
import { YoutubeMetadataEditor } from "@/components/admin/YoutubeMetadataEditor";
import { YoutubeUrlValidationCard } from "@/components/admin/YoutubeUrlValidationCard";
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
import {
  editorHasContent,
  mergeAiDraftIntoEditor,
} from "@/lib/ai-recipe/normalize";
import { noteHumanEditorChange, noteHumanYoutubeMetadataChange } from "@/lib/ai-recipe/field-tracking";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";
import { ADMIN_IMAGE_HELP } from "@/lib/admin-upload";
import { partitionCategoriesByGroup } from "@/lib/category-admin";
import { emptyValue, RECIPE_MEDIA_KEYS, RECIPE_OVERVIEW_KEYS, slugify } from "@/lib/fields";
import { youtubeVideoId } from "@/lib/youtube";
import {
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

const ALL_GROUPED = new Set<string>([
  ...DETAILS_KEYS,
  ...CONTENT_KEYS,
  ...MEDIA_PRIMARY_KEYS,
  ...ADVANCED_KEYS,
  ...RECIPE_OVERVIEW_KEYS,
  ...RECIPE_MEDIA_KEYS,
  "cookMinutes",
]);

const editorSecondaryBtn =
  "inline-flex items-center justify-center rounded-sm border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const compactInputClass =
  "h-9 w-full rounded-sm border border-line bg-paper px-3 text-sm text-ink outline-none transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 focus-visible:border-olive focus-visible:ring-2 focus-visible:ring-olive/15";

const inputErrorClass = "border-terracotta/60 focus:border-terracotta focus:ring-terracotta/15 focus-visible:border-terracotta focus-visible:ring-terracotta/15";

const editorTextAction =
  "inline-flex items-center gap-0.5 self-start rounded-sm px-0.5 py-1 text-sm font-semibold text-muted transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const removeActionClass =
  "shrink-0 self-center text-xs font-semibold text-muted/75 transition-colors duration-150 motion-reduce:transition-none hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const fieldErrorClass = "mt-1.5 text-xs font-semibold text-terracotta";

function isRequiredFieldValueValid(field: Field, value: unknown): boolean {
  if (!field.required) return true;

  switch (field.kind) {
    case "textarea":
    case "text":
    case "image":
      return String(value ?? "").trim().length > 0;
    case "number":
    case "minutes":
      return typeof value === "number" && !Number.isNaN(value);
    case "select":
      return String(value ?? "").trim().length > 0;
    case "boolean":
    case "nutrition":
      return true;
    case "gallery":
    case "list":
    case "tags": {
      const items = Array.isArray(value) ? (value as string[]) : [];
      return items.some((item) => item.trim().length > 0);
    }
    case "namedNotes": {
      const items = Array.isArray(value) ? (value as { name?: string; note?: string }[]) : [];
      return items.some((item) => String(item.name ?? "").trim().length > 0);
    }
    case "ingredients": {
      const groups = Array.isArray(value)
        ? (value as { items: { item: string }[] }[])
        : [];
      return groups.some((group) =>
        group.items.some((item) => String(item.item ?? "").trim().length > 0),
      );
    }
    case "instructions": {
      const groups = Array.isArray(value) ? (value as { steps: string[] }[]) : [];
      return groups.some((group) => group.steps.some((step) => step.trim().length > 0));
    }
    default:
      return String(value ?? "").trim().length > 0;
  }
}

function validateForPublish(
  title: string,
  fields: Field[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!title.trim()) {
    errors.title = "Title is required before publishing.";
  }
  for (const field of fields) {
    if (!field.required) continue;
    if (!isRequiredFieldValueValid(field, values[field.key])) {
      errors[field.key] = `${field.label} is required before publishing.`;
    }
  }
  const youtubeUrl = String(values.youtubeUrl ?? "").trim();
  if (youtubeUrl && !youtubeVideoId(youtubeUrl)) {
    errors.youtubeUrl = "Enter a valid YouTube watch or youtu.be URL.";
  }
  const youtubeState = values.youtube as YoutubeMetadataEditorState | undefined;
  if (youtubeState && typeof youtubeState === "object") {
    const youtubeIssues = validateYoutubeMetadataEditorState(youtubeState);
    if (youtubeIssues.length) {
      errors.youtube = youtubeIssues[0]?.message ?? "Fix YouTube metadata before publishing.";
    }
  }
  return errors;
}

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
    } else {
      next[field.key] = rawValues[field.key] ?? emptyValue(field.kind);
    }
  }
  return next;
}

function editorFormSnapshot(payload: {
  title: string;
  slug: string;
  excerpt: string;
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

function reorderButtonClass(disabled: boolean) {
  return `min-w-[2.25rem] px-2 py-1 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta ${
    disabled
      ? "cursor-not-allowed text-muted/35"
      : "text-muted hover:bg-cream hover:text-terracotta"
  }`;
}

function ReorderControls({
  itemLabel,
  onMoveUp,
  onMoveDown,
  onRemove,
  upDisabled,
  downDisabled,
  hideReorderWhenStatic = false,
  showRemove = true,
}: {
  itemLabel: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove?: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
  hideReorderWhenStatic?: boolean;
  showRemove?: boolean;
}) {
  const reorderAvailable = !(upDisabled && downDisabled);
  const showReorder = reorderAvailable && !(hideReorderWhenStatic && upDisabled && downDisabled);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {showReorder ? (
        <div
          role="group"
          aria-label={`Reorder ${itemLabel}`}
          className="inline-flex overflow-hidden rounded-sm border border-line bg-paper"
        >
          <button
            type="button"
            aria-label={`Move ${itemLabel} up`}
            disabled={upDisabled}
            className={`${reorderButtonClass(upDisabled)} border-r border-line`}
            onClick={onMoveUp}
          >
            Up
          </button>
          <button
            type="button"
            aria-label={`Move ${itemLabel} down`}
            disabled={downDisabled}
            className={reorderButtonClass(downDisabled)}
            onClick={onMoveDown}
          >
            Down
          </button>
        </div>
      ) : null}
      {showRemove && onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${itemLabel}`}
          className={removeActionClass}
          onClick={onRemove}
        >
          Remove
        </button>
      ) : null}
    </div>
  );
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
  emphasis = false,
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
    <section
      id={id}
      style={scrollTargetStyle}
      className="border border-line bg-paper p-5 md:p-6"
    >
      <header className={`mb-5 ${emphasis ? "border-b border-line pb-4" : ""}`}>
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive/90">
        {label}
      </h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{children}</div>
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
}: {
  label: string;
  required?: boolean;
  helpText?: string;
  compact?: boolean;
  confidence?: import("@/lib/ai-recipe/types").AiConfidence;
  sourceNote?: string;
}) {
  return (
    <div className={compact ? "mb-1.5" : "mb-2"}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`font-semibold text-ink ${compact ? "text-sm" : ""}`}>
          {label}
          {required ? <span className="text-terracotta"> *</span> : null}
        </p>
        <AiConfidenceBadge confidence={confidence} sourceNote={sourceNote} />
      </div>
      {helpText ? <p className="mt-0.5 text-xs text-muted">{helpText}</p> : null}
    </div>
  );
}

function normalizeStatus(status: string) {
  return status.toLowerCase();
}

function RecipeStatusBadge({ status }: { status: string }) {
  const published = normalizeStatus(status) === "published";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${published ? "bg-olive" : "bg-terracotta/75"}`}
        aria-hidden
      />
      {published ? "Published" : "Draft"}
    </span>
  );
}

export function RecipeEditor({
  recipeId,
  typeId,
  typeName,
  initial,
  fields,
  categories,
  saved,
}: {
  recipeId?: string;
  typeId: string;
  typeName: string;
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
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLInputElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const sectionNavRef = useRef<HTMLElement>(null);
  const headerSentinelRef = useRef<HTMLDivElement>(null);
  const moveToDraftCancelRef = useRef<HTMLButtonElement>(null);
  const moveToDraftTitleId = useId();
  const [headerHeight, setHeaderHeight] = useState(84);
  const [scrollOffset, setScrollOffset] = useState(96);
  const [mobileHeaderCompact, setMobileHeaderCompact] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(SECTION_BASICS);
  const [moveToDraftOpen, setMoveToDraftOpen] = useState(false);
  const [publishAiWarningOpen, setPublishAiWarningOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [status, setStatus] = useState(initial.status);
  const [featured, setFeatured] = useState(initial.featured);
  const [seasonal, setSeasonal] = useState(initial.seasonal);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [publishAlert, setPublishAlert] = useState("");
  const [aiMeta, setAiMeta] = useState<RecipeAiMeta | null>(initial.aiMeta ?? null);
  const [reviewCursor, setReviewCursor] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    hydrateEditorValues(fields, initial.values),
  );

  const baselineSnapshot = useMemo(
    () =>
      editorFormSnapshot({
        title: initial.title,
        slug: initial.slug,
        excerpt: initial.excerpt,
        featured: initial.featured,
        seasonal: initial.seasonal,
        categoryIds: initial.categoryIds,
        values: hydrateEditorValues(fields, initial.values),
        aiMeta: initial.aiMeta ?? null,
      }),
    [fields, initial],
  );

  const detailFields = pickFieldsOrdered(fields, DETAILS_KEYS);
  const contentFields = pickFieldsOrdered(fields, CONTENT_KEYS);
  const mediaFields = pickFieldsOrdered(fields, MEDIA_PRIMARY_KEYS);
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

  const sectionLinks = useMemo(() => {
    const links: RecipeEditorSectionLink[] = [
      { id: SECTION_BASICS, label: "Basics" },
    ];
    if (detailFields.length) links.push({ id: SECTION_DETAILS, label: "Details" });
    if (contentFields.length) links.push({ id: SECTION_CONTENT, label: "Content" });
    if (mediaFields.length) links.push({ id: SECTION_MEDIA, label: "Media" });
    if (advancedFields.length || specialistFields.length) {
      links.push({ id: SECTION_ADVANCED, label: "Advanced" });
    }
    return links;
  }, [advancedFields.length, contentFields.length, detailFields.length, mediaFields.length, specialistFields.length]);

  const isPublished = normalizeStatus(status) === "published";

  const isDirty = useMemo(
    () =>
      editorFormSnapshot({
        title,
        slug,
        excerpt,
        featured,
        seasonal,
        categoryIds,
        values,
        aiMeta,
      }) !== baselineSnapshot,
    [aiMeta, baselineSnapshot, categoryIds, excerpt, featured, seasonal, title, slug, values],
  );

  const draftActionLabel = isPublished ? "Move to draft" : "Save draft";

  const publishButtonLabel = isPublished ? "Update published recipe" : "Publish";

  const mobileCompactPublishLabel = isPublished ? "Update" : "Publish";

  const encoded = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of fields) {
      if (field.key === "youtube") {
        const blob = serializeYoutubeMetadataEditorState(
          (values.youtube as YoutubeMetadataEditorState) ?? youtubeMetadataToEditorState(undefined),
        );
        out[field.key] = JSON.stringify(blob ?? {});
      } else {
        out[field.key] = JSON.stringify(values[field.key] ?? emptyValue(field.kind));
      }
    }
    return out;
  }, [fields, values]);

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

  const scrollTargetStyle = useMemo(
    () => ({ scrollMarginTop: scrollOffset }) as const,
    [scrollOffset],
  );

  function scrollToSection(sectionId: string) {
    setActiveSectionId(sectionId);
    const target = document.getElementById(sectionId);
    if (!target) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }

  function scrollToField(fieldKey: string) {
    const target = document.getElementById(`recipe-field-${fieldKey}`);
    if (!target) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });

    window.setTimeout(
      () => {
        const focusable = target.querySelector<HTMLElement>(
          "input:not([type='hidden']):not([type='file']), textarea, select, button:not([type='submit'])",
        );
        focusable?.focus({ preventScroll: true });
      },
      prefersReducedMotion ? 0 : 320,
    );
  }

  function setField(key: string, value: unknown) {
    setValues((current) => {
      if (key === "youtube") {
        setAiMeta((meta) => noteHumanYoutubeMetadataChange(meta, current.youtube, value));
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

  const reviewPaths = useMemo(() => {
    if (!aiMeta?.confidenceByPath) return [] as string[];
    return Object.entries(aiMeta.confidenceByPath)
      .filter(
        ([, annotation]) =>
          annotation.confidence === "ESTIMATED" || annotation.confidence === "UNKNOWN",
      )
      .map(([path]) => path);
  }, [aiMeta]);

  function pathToFieldKey(path: string) {
    if (path === "title" || path === "slug" || path === "excerpt" || path === "categoryIds") {
      return path;
    }
    if (path.startsWith("values.")) {
      return path.slice("values.".length).split(".")[0] || "";
    }
    return "";
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

    const summary = emptyAiSummary();
    const confidenceByPath = {
      ...(aiMeta?.confidenceByPath ?? {}),
      ...merged.confidenceByPath,
    };
    for (const annotation of Object.values(confidenceByPath)) {
      tallyConfidence(annotation.confidence, summary);
    }

    setTitle(merged.title);
    setSlug(merged.slug);
    setSlugTouched(Boolean(merged.slug));
    setExcerpt(merged.excerpt);
    setCategoryIds(merged.categoryIds);
    setValues(hydrateEditorValues(fields, merged.values));
    setAiMeta({
      ...payload.meta,
      sourceVideoId: payload.meta.sourceVideoId,
      confidenceByPath,
      fieldProvenance: merged.fieldProvenance,
      summary,
      verificationStatus: "unverified",
      verifiedAt: undefined,
      verifiedBy: undefined,
    });
    setReviewCursor(0);
    setAdvancedOpen(true);
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
    if (!reviewPaths.length) return;
    const path = reviewPaths[reviewCursor % reviewPaths.length];
    const key = pathToFieldKey(path);
    setReviewCursor((current) => current + 1);
    if (!key) return;
    const advancedKeys = new Set([
      ...ADVANCED_KEYS,
      ...specialistFields.map((field) => field.key),
    ]);
    if (advancedKeys.has(key)) setAdvancedOpen(true);
    scrollToField(key);
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
    const errors = validateForPublish(title, fields, values);
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
      scrollToField(firstKey);
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
    { compact = false, emphasis = false }: { compact?: boolean; emphasis?: boolean } = {},
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

    const displayLabel =
      field.key === "bakeMinutes"
        ? bakeTimeDisplayLabel(typeName, field.label)
        : field.key === "imageAlt"
          ? "Image description (alt text)"
          : field.label;

    const displayHelp =
      field.key === "imageAlt"
        ? "Describe the hero image for accessibility. Write what a sighted reader needs to understand the photo."
        : field.helpText;

    return (
      <div
        key={field.key}
        id={`recipe-field-${field.key}`}
        style={scrollTargetStyle}
        className={isWide ? "md:col-span-2" : ""}
      >
        <FieldLabel
          label={displayLabel}
          required={field.required}
          helpText={displayHelp}
          compact={compact}
          confidence={aiMeta?.confidenceByPath[`values.${field.key}`]?.confidence}
          sourceNote={aiMeta?.confidenceByPath[`values.${field.key}`]?.sourceNote}
        />
        {field.key === "youtubeUrl" ? (
          <YoutubeUrlField
            value={String(values[field.key] ?? "")}
            onChange={(value) => {
              setField(field.key, value);
              if (fieldErrors[field.key]) {
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next[field.key];
                  return next;
                });
              }
            }}
            invalid={Boolean(fieldErrors[field.key])}
          />
        ) : field.key === "youtube" ? (
          <YoutubeMetadataEditor
            value={values[field.key]}
            onChange={(state) => {
              setField(field.key, state);
              if (fieldErrors[field.key]) {
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next[field.key];
                  return next;
                });
              }
            }}
            confidenceByPath={aiMeta?.confidenceByPath}
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
        ) : (
          <KindInput
            fieldKey={field.key}
            kind={field.kind}
            options={field.options}
            value={values[field.key]}
            onChange={(value) => {
              setField(field.key, value);
              if (fieldErrors[field.key]) {
                setFieldErrors((current) => {
                  const next = { ...current };
                  delete next[field.key];
                  return next;
                });
              }
            }}
            compact={compact}
            emphasis={emphasis}
            invalid={Boolean(fieldErrors[field.key])}
          />
        )}
        {fieldErrors[field.key] ? (
          <p className={fieldErrorClass} role="alert">
            {fieldErrors[field.key]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div
        ref={stickyHeaderRef}
        className="sticky top-0 z-50 -mx-5 mb-8 border-b border-line bg-[var(--cream)] px-5 transition-[padding] duration-150 motion-reduce:transition-none md:-mx-6 md:px-6 md:py-3"
      >
        <div className={mobileHeaderCompact ? "hidden md:block" : "block"}>
          <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between md:py-0">
            <div className="min-w-0">
              <Link
                href="/admin"
                className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
              >
                ← Recipes
              </Link>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="font-serif text-2xl leading-tight text-ink md:text-[1.75rem]">{pageTitle}</h1>
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive/90">
                  {typeName}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {saved ? <span className="text-sm text-olive">Saved.</span> : null}
              {isDirty && !saved ? (
                <span className="text-xs font-semibold text-muted">Unsaved changes</span>
              ) : null}
              <RecipeStatusBadge status={status} />
              {aiMeta?.generatedByAI && aiMeta.verificationStatus !== "verified" ? (
                <span className="rounded-sm border border-terracotta/30 bg-terracotta/5 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-terracotta">
                  AI draft — not verified
                </span>
              ) : null}
              {aiMeta?.generatedByAI && aiMeta.verificationStatus === "verified" ? (
                <span className="rounded-sm border border-olive/30 bg-olive/5 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-olive">
                  Verified
                </span>
              ) : null}
              {recipeId ? (
                <DeleteRecipeButton recipeId={recipeId} recipeTitle={pageTitle} />
              ) : null}
              <button
                type="button"
                onClick={attemptSaveDraft}
                className={`${editorSecondaryBtn} ${adminFocusRing}`}
              >
                {draftActionLabel}
              </button>
              <button
                type="button"
                onClick={attemptPublish}
                className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
              >
                {publishButtonLabel}
              </button>
            </div>
          </div>
        </div>

        <div
          className={`${mobileHeaderCompact ? "flex" : "hidden"} items-center gap-2 py-2 md:hidden`}
        >
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={pageTitle}>
            {pageTitle}
          </p>
          {isDirty && !saved ? (
            <span className="sr-only">Unsaved changes</span>
          ) : null}
          <button
            type="button"
            onClick={attemptPublish}
            aria-label={publishButtonLabel}
            className={`${adminPrimaryButtonClass} h-9 px-4 text-sm ${adminFocusRing}`}
          >
            {mobileCompactPublishLabel}
          </button>
        </div>
      </div>

      <div ref={headerSentinelRef} className="h-px md:hidden" aria-hidden />

      <form
        ref={formRef}
        action={saveRecipeAction}
        className="grid gap-6 [&_input:not([type='hidden']):not([type='file'])]:[scroll-margin-top:var(--recipe-editor-scroll-offset)] [&_select]:[scroll-margin-top:var(--recipe-editor-scroll-offset)] [&_textarea]:[scroll-margin-top:var(--recipe-editor-scroll-offset)]"
        style={
          {
            "--recipe-editor-scroll-offset": `${scrollOffset}px`,
            scrollPaddingTop: scrollOffset,
          } as React.CSSProperties
        }
      >
        <input type="hidden" name="id" value={recipeId || ""} />
        <input type="hidden" name="typeId" value={typeId} />
        <input ref={statusRef} type="hidden" name="status" value={status} />
        <input type="hidden" name="aiMeta" value={serializeRecipeAiMeta(aiMeta)} />
        {fields.map((field) => (
          <input key={field.key} type="hidden" name={`field:${field.key}`} value={encoded[field.key]} />
        ))}
        {categoryIds.map((id) => (
          <input key={id} type="hidden" name="categoryIds" value={id} />
        ))}

        <AiRecipeAssistant
          typeId={typeId}
          editorHasContent={formHasContent}
          youtubeUrl={String(values.youtubeUrl ?? "")}
          onYoutubeUrlChange={(url) => setField("youtubeUrl", url)}
          aiMeta={aiMeta}
          onApply={applyAiDraft}
        />

        {aiMeta?.generatedByAI ? (
          <AiDraftReviewSummary
            meta={aiMeta}
            onReviewEstimated={reviewEstimatedFields}
            onMarkVerified={markAiVerified}
            onDownloadJson={downloadAiJson}
          />
        ) : null}

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

        <RecipeEditorSectionNav
          ref={sectionNavRef}
          sections={sectionLinks}
          stickyTop={headerHeight}
          scrollMarginTop={scrollOffset}
          onNavigate={scrollToSection}
          activeSectionId={activeSectionId}
          compact={mobileHeaderCompact}
        />

        <EditorSection
          id={SECTION_BASICS}
          scrollTargetStyle={scrollTargetStyle}
          title="Basics"
          description="Identity, summary, and discovery settings."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label id="recipe-field-title" className="grid gap-1.5 md:col-span-2" style={scrollTargetStyle}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  Title<span className="text-terracotta"> *</span>
                </span>
                <AiConfidenceBadge
                  confidence={aiMeta?.confidenceByPath.title?.confidence}
                  sourceNote={aiMeta?.confidenceByPath.title?.sourceNote}
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
                className={`${adminInputClass} text-base font-semibold md:text-lg ${fieldErrors.title ? inputErrorClass : ""}`}
              />
              {fieldErrors.title ? (
                <span className={fieldErrorClass} role="alert">
                  {fieldErrors.title}
                </span>
              ) : null}
            </label>
            <label id="recipe-field-slug" className="grid gap-1.5" style={scrollTargetStyle}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">Slug</span>
                <AiConfidenceBadge
                  confidence={aiMeta?.confidenceByPath.slug?.confidence}
                  sourceNote={aiMeta?.confidenceByPath.slug?.sourceNote}
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
            <label id="recipe-field-excerpt" className="grid gap-1.5 md:col-span-2" style={scrollTargetStyle}>
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">Excerpt</span>
                <AiConfidenceBadge
                  confidence={aiMeta?.confidenceByPath.excerpt?.confidence}
                  sourceNote={aiMeta?.confidenceByPath.excerpt?.sourceNote}
                />
              </span>
              <textarea
                name="excerpt"
                value={excerpt}
                onChange={(event) => updateExcerpt(event.target.value)}
                rows={3}
                className={adminInputClass}
              />
            </label>

            <div className="md:col-span-2 border-t border-line/80 pt-5">
              <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive/90">
                Discovery
              </h3>
              <p className="mt-1 text-xs text-muted">
                Editorial flags and taxonomy for menus, filters, and featured placement.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    name="featured"
                    checked={featured}
                    onChange={(event) => setFeatured(event.target.checked)}
                    className="rounded-sm border-line"
                  />
                  Featured
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-ink">
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
              <div className="mt-5">
                <p className="mb-3 text-sm font-semibold text-ink">Categories</p>
                <div className="grid gap-4">
                  {categoryGroups.map((group) => (
                    <div key={group.group}>
                      <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                        {group.label}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.categories.map((category) => {
                          const selected = categoryIds.includes(category.id);
                          return (
                            <label
                              key={category.id}
                              className={`flex items-center gap-2 rounded-sm border px-3 py-1.5 text-sm transition-colors ${adminFocusRing} ${
                                selected
                                  ? "border-terracotta/40 bg-terracotta/5 text-ink"
                                  : "border-line hover:bg-cream"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleCategory(category.id)}
                              />
                              {category.name}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
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
            <div className="grid gap-8">
              {pickFieldsOrdered(detailFields, YIELD_KEYS).length ? (
                <DetailSubgroup label="Yield">
                  {pickFieldsOrdered(detailFields, YIELD_KEYS).map((field) =>
                    renderField(field, { compact: true }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, TIMING_KEYS).length ? (
                <DetailSubgroup label="Timing">
                  {pickFieldsOrdered(detailFields, TIMING_KEYS).map((field) =>
                    renderField(field, { compact: true }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, CLASSIFICATION_KEYS).length ? (
                <DetailSubgroup label="Classification">
                  {pickFieldsOrdered(detailFields, CLASSIFICATION_KEYS).map((field) =>
                    renderField(field, { compact: true }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, TOOLS_KEYS).length ? (
                <DetailSubgroup label="Tools">
                  {pickFieldsOrdered(detailFields, TOOLS_KEYS).map((field) =>
                    renderField(field, { compact: true }),
                  )}
                </DetailSubgroup>
              ) : null}
              {pickFieldsOrdered(detailFields, TAG_KEYS).length ? (
                <DetailSubgroup label="Discovery">
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
            <div className="grid gap-6 md:grid-cols-2">
              {contentFields.map((field) => {
                const emphasis =
                  field.key === "ingredients" || field.key === "instructions";
                return (
                  <div
                    key={field.key}
                    className={
                      emphasis
                        ? "md:col-span-2 rounded-sm border border-line/80 bg-cream/30 p-4 md:p-5"
                        : "md:col-span-2"
                    }
                  >
                    {renderField(field, { emphasis })}
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
            description="Hero image and main walkthrough video."
          >
            <div className="grid gap-5 md:grid-cols-2">
              {mediaFields.map((field) => renderField(field))}
            </div>
          </EditorSection>
        ) : null}

        {advancedFields.length || specialistFields.length ? (
          <section
            id={SECTION_ADVANCED}
            style={scrollTargetStyle}
            className="border border-line bg-paper"
          >
            <button
              type="button"
              id="recipe-advanced-toggle"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              aria-controls="recipe-advanced-panel"
              className={`block w-full cursor-pointer px-5 py-4 text-left md:px-6 ${adminFocusRing}`}
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
                className="grid gap-5 border-t border-line px-5 py-5 md:grid-cols-2 md:px-6"
              >
                {advancedFields.map((field) =>
                  field.key === "youtube" ? (
                    <div key={field.key} id={`recipe-field-${field.key}`} className="md:col-span-2">
                      {renderField(field)}
                    </div>
                  ) : (
                    renderField(field)
                  ),
                )}
                {specialistFields.map((field) => renderField(field))}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="button" onClick={attemptSaveDraft} className={`${editorSecondaryBtn} ${adminFocusRing}`}>
            {draftActionLabel}
          </button>
          <button type="button" onClick={attemptPublish} className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            {publishButtonLabel}
          </button>
        </div>
      </form>

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
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedSaveDraft}
                className={`rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark ${adminFocusRing}`}
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
                className={`rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:border-terracotta ${adminFocusRing}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={proceedPublishAnyway}
                className={`rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-paper hover:bg-terracotta-dark ${adminFocusRing}`}
              >
                Publish anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
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
}: {
  fieldKey: string;
  kind: string;
  options: string[];
  value: unknown;
  onChange: (value: unknown) => void;
  compact?: boolean;
  emphasis?: boolean;
  invalid?: boolean;
}) {
  const inputClass = `${compact ? compactInputClass : adminInputClass}${invalid ? ` ${inputErrorClass}` : ""}`;
  const textAreaRows = emphasis ? 6 : 5;

  if (kind === "textarea") {
    return (
      <textarea
        rows={textAreaRows}
        value={String(value || "")}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={`${adminInputClass} h-auto min-h-[5.5rem] resize-y${invalid ? ` ${inputErrorClass}` : ""}`}
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
    return <ImageField value={String(value || "")} onChange={onChange} invalid={invalid} />;
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
          onChange={(url) => {
            if (url) onChange([...urls, url]);
          }}
        />
      </div>
    );
  }
  if (kind === "list" || kind === "tags") {
    const items = Array.isArray(value) ? (value as string[]) : [];
    return (
      <ListEditor
        items={items}
        onChange={onChange}
        placeholder={kind === "tags" ? "Tag" : "Item"}
        compact={compact}
      />
    );
  }
  if (kind === "namedNotes") {
    const items = Array.isArray(value) ? (value as { name?: string; note?: string }[]) : [];
    const variant =
      fieldKey === "faqs" ? "faq" : fieldKey === "keyIngredients" ? "keyIngredients" : "default";
    return <NamedNotesEditor items={items} onChange={onChange} variant={variant} />;
  }
  if (kind === "ingredients") {
    const groups = Array.isArray(value)
      ? (value as { name?: string; items: { item: string; amount: string; notes?: string }[] }[])
      : [];
    return <IngredientsEditor groups={groups} onChange={onChange} />;
  }
  if (kind === "instructions") {
    const groups = Array.isArray(value) ? (value as { name?: string; steps: string[] }[]) : [];
    return <InstructionsEditor groups={groups} onChange={onChange} />;
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
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-sm">
        Hours
        <input
          type="number"
          min={0}
          value={hours}
          onChange={(event) => onChange(Number(event.target.value) * 60 + minutes)}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-sm">
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
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={item}
            placeholder={placeholder}
            aria-label={`${placeholder} ${index + 1}`}
            onChange={(event) => {
              const next = [...items];
              next[index] = event.target.value;
              onChange(next);
            }}
            className={`min-w-0 flex-1 ${inputClass}`}
          />
          <button
            type="button"
            aria-label={`Remove ${placeholder.toLowerCase()} ${index + 1}`}
            className={`${removeActionClass} self-start sm:shrink-0`}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className={editorTextAction} onClick={() => onChange([...items, ""])}>
        + Add item
      </button>
    </div>
  );
}

function NamedNotesEditor({
  items,
  onChange,
  variant,
}: {
  items: { name?: string; note?: string }[];
  onChange: (value: unknown) => void;
  variant: "faq" | "keyIngredients" | "default";
}) {
  const placeholders =
    variant === "faq"
      ? { name: "Question", note: "Answer" }
      : variant === "keyIngredients"
        ? { name: "Ingredient", note: "Why it matters / notes" }
        : { name: "Name", note: "Note" };

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={index} className="grid gap-2 border-t border-line/70 pt-3 first:border-t-0 first:pt-0 md:grid-cols-2">
          <input
            value={item.name || ""}
            placeholder={placeholders.name}
            aria-label={`${placeholders.name} ${index + 1}`}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, name: event.target.value };
              onChange(next);
            }}
            className={compactInputClass}
          />
          <textarea
            value={item.note || ""}
            placeholder={placeholders.note}
            rows={2}
            aria-label={`${placeholders.note} ${index + 1}`}
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, note: event.target.value };
              onChange(next);
            }}
            className={`${adminInputClass} h-auto min-h-[4.5rem] resize-y`}
          />
        </div>
      ))}
      <button
        type="button"
        className={editorTextAction}
        onClick={() => onChange([...items, { name: "", note: "" }])}
      >
        + Add {variant === "faq" ? "question" : "item"}
      </button>
    </div>
  );
}

function IngredientsEditor({
  groups,
  onChange,
}: {
  groups: { name?: string; items: { item: string; amount: string; notes?: string }[] }[];
  onChange: (value: unknown) => void;
}) {
  function update(next: typeof groups) {
    onChange(next);
  }

  return (
    <div className="grid gap-5">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="grid gap-3 border-t border-line/70 pt-4 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={group.name || ""}
              placeholder="Group name (optional)"
              aria-label={`Ingredient group ${groupIndex + 1} name`}
              onChange={(event) => {
                const next = [...groups];
                next[groupIndex] = { ...group, name: event.target.value };
                update(next);
              }}
              className={`${compactInputClass} max-w-md flex-1`}
            />
            {groups.length > 1 ? (
              <ReorderControls
                itemLabel={`ingredient group ${groupIndex + 1}`}
                upDisabled={groupIndex === 0}
                downDisabled={groupIndex === groups.length - 1}
                hideReorderWhenStatic
                showRemove={false}
                onMoveUp={() => update(moveArrayItem(groups, groupIndex, groupIndex - 1))}
                onMoveDown={() => update(moveArrayItem(groups, groupIndex, groupIndex + 1))}
              />
            ) : null}
          </div>
          <div className="hidden gap-2 px-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted md:grid md:grid-cols-[8.5rem_minmax(0,1.6fr)_minmax(0,1fr)_auto]">
            <span>Amount</span>
            <span>Ingredient</span>
            <span>Notes</span>
            <span className="sr-only">Actions</span>
          </div>
          {group.items.map((item, itemIndex) => (
            <div
              key={itemIndex}
              className="grid gap-2 md:grid-cols-[8.5rem_minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center"
            >
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
                className={compactInputClass}
              />
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
                className={compactInputClass}
              />
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
                className={compactInputClass}
              />
              <ReorderControls
                itemLabel={`ingredient ${itemIndex + 1} in group ${groupIndex + 1}`}
                upDisabled={itemIndex === 0}
                downDisabled={itemIndex === group.items.length - 1}
                hideReorderWhenStatic
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
          ))}
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
        onClick={() => update([...groups, { name: "", items: [{ item: "", amount: "", notes: "" }] }])}
      >
        + Add group
      </button>
    </div>
  );
}

function InstructionsEditor({
  groups,
  onChange,
}: {
  groups: { name?: string; steps: string[] }[];
  onChange: (value: unknown) => void;
}) {
  let stepCounter = 0;

  return (
    <div className="grid gap-5">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="grid gap-3">
          <input
            value={group.name || ""}
            placeholder="Section name (optional)"
            onChange={(event) => {
              const next = [...groups];
              next[groupIndex] = { ...group, name: event.target.value };
              onChange(next);
            }}
            className={`${compactInputClass} max-w-md`}
          />
          {group.steps.map((step, stepIndex) => {
            stepCounter += 1;
            const stepNumber = stepCounter;
            return (
              <div key={stepIndex} className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted sm:mt-2.5 sm:w-5">
                  {stepNumber}
                </span>
                <textarea
                  value={step}
                  rows={2}
                  aria-label={`Step ${stepNumber}${group.name ? ` in ${group.name}` : ""}`}
                  onChange={(event) => {
                    const next = [...groups];
                    const steps = [...group.steps];
                    steps[stepIndex] = event.target.value;
                    next[groupIndex] = { ...group, steps };
                    onChange(next);
                  }}
                  className={`${adminInputClass} h-auto min-h-[4.5rem] flex-1 resize-y sm:min-h-[2.75rem]`}
                />
                <ReorderControls
                  itemLabel={`step ${stepNumber}${group.name ? ` in ${group.name}` : ""}`}
                  upDisabled={stepIndex === 0}
                  downDisabled={stepIndex === group.steps.length - 1}
                  hideReorderWhenStatic
                  onMoveUp={() => {
                    const next = [...groups];
                    next[groupIndex] = {
                      ...group,
                      steps: moveArrayItem(group.steps, stepIndex, stepIndex - 1),
                    };
                    onChange(next);
                  }}
                  onMoveDown={() => {
                    const next = [...groups];
                    next[groupIndex] = {
                      ...group,
                      steps: moveArrayItem(group.steps, stepIndex, stepIndex + 1),
                    };
                    onChange(next);
                  }}
                  onRemove={() => {
                    const next = [...groups];
                    const steps = group.steps.filter((_, i) => i !== stepIndex);
                    next[groupIndex] = { ...group, steps: steps.length ? steps : [""] };
                    onChange(next);
                  }}
                />
              </div>
            );
          })}
          <button
            type="button"
            className={editorTextAction}
            onClick={() => {
              const next = [...groups];
              next[groupIndex] = { ...group, steps: [...group.steps, ""] };
              onChange(next);
            }}
          >
            + Add step
          </button>
        </div>
      ))}
      <button
        type="button"
        className={editorTextAction}
        onClick={() => onChange([...groups, { name: "", steps: [""] }])}
      >
        + Add section
      </button>
    </div>
  );
}

function YoutubeUrlField({
  value,
  onChange,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const trimmed = value.trim();
  const videoId = trimmed ? youtubeVideoId(trimmed) : null;
  const showInvalid = trimmed.length > 0 && !videoId;

  return (
    <div className="grid gap-3">
      <input
        value={value}
        placeholder="https://www.youtube.com/watch?v=…"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid || showInvalid}
        aria-describedby={showInvalid ? "youtube-url-hint" : undefined}
        className={`${adminInputClass}${invalid || showInvalid ? ` ${inputErrorClass}` : ""}`}
      />
      {trimmed ? (
        videoId ? (
          <YoutubeUrlValidationCard videoId={videoId} />
        ) : (
          <p id="youtube-url-hint" className="text-xs font-semibold text-terracotta" role="status">
            Enter a valid YouTube watch, embed, shorts, or youtu.be URL.
          </p>
        )
      ) : (
        <p className="text-xs text-muted">
          Optional. Links to the main studio walkthrough on Mesa&apos;s YouTube channel.
        </p>
      )}
    </div>
  );
}

function ImageField({
  value,
  onChange,
  buttonLabel = "Upload image",
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  buttonLabel?: string;
  invalid?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/admin/upload", { method: "POST", body });
    const data = (await response.json()) as { url?: string; error?: string };
    setBusy(false);
    if (data.url) onChange(data.url);
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted">{ADMIN_IMAGE_HELP}</p>
      <label className="cursor-pointer">
        <span
          className={`inline-flex h-10 items-center justify-center rounded-full bg-terracotta px-5 text-sm font-semibold text-paper transition-[color,transform,background-color] duration-150 hover:bg-terracotta-dark active:scale-[0.995] ${adminFocusRing}`}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Hero image preview"
            className="max-h-72 w-full max-w-full object-contain"
          />
        </figure>
      ) : null}
    </div>
  );
}
