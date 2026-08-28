"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveRecipeAction } from "@/app/admin/actions";
import { DeleteRecipeButton } from "@/components/admin/DeleteRecipeButton";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";
import { emptyValue, RECIPE_MEDIA_KEYS, RECIPE_OVERVIEW_KEYS, slugify } from "@/lib/fields";

type Field = {
  key: string;
  label: string;
  helpText: string;
  kind: string;
  required: boolean;
  options: string[];
};

type CategoryOption = { id: string; name: string };

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
  return errors;
}

function pickFieldsOrdered(fields: Field[], keys: readonly string[]) {
  const map = new Map(fields.map((field) => [field.key, field]));
  return keys.map((key) => map.get(key)).filter((field): field is Field => Boolean(field));
}

function EditorSection({
  title,
  description,
  children,
  emphasis = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <section className="border border-line bg-paper p-5 md:p-6">
      <header className={`mb-5 ${emphasis ? "border-b border-line pb-4" : ""}`}>
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">{title}</h2>
        {description ? <p className="mt-1.5 text-xs leading-relaxed text-muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function FieldLabel({
  label,
  required,
  helpText,
  compact = false,
}: {
  label: string;
  required?: boolean;
  helpText?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-1.5" : "mb-2"}>
      <p className={`font-semibold text-ink ${compact ? "text-sm" : ""}`}>
        {label}
        {required ? <span className="text-terracotta"> *</span> : null}
      </p>
      {helpText ? <p className="mt-0.5 text-xs text-muted">{helpText}</p> : null}
    </div>
  );
}

function RecipeStatusBadge({ status }: { status: string }) {
  const published = status === "published";
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
  };
  fields: Field[];
  categories: CategoryOption[];
  saved?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const statusRef = useRef<HTMLInputElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState(96);
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
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const next: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.key === "bakeMinutes") {
        next[field.key] =
          initial.values.bakeMinutes ?? initial.values.cookMinutes ?? emptyValue(field.kind);
      } else if (field.key === "difficulty") {
        next[field.key] = initial.values.difficulty || "Easy";
      } else if (field.key === "youtube" && initial.values.youtube && typeof initial.values.youtube === "object") {
        next[field.key] = JSON.stringify(initial.values.youtube, null, 2);
      } else {
        next[field.key] = initial.values[field.key] ?? emptyValue(field.kind);
      }
    }
    return next;
  });

  const detailFields = pickFieldsOrdered(fields, DETAILS_KEYS);
  const contentFields = pickFieldsOrdered(fields, CONTENT_KEYS);
  const mediaFields = pickFieldsOrdered(fields, MEDIA_PRIMARY_KEYS);
  const advancedFields = pickFieldsOrdered(fields, ADVANCED_KEYS);
  const specialistFields = fields.filter((field) => !ALL_GROUPED.has(field.key));

  const encoded = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of fields) {
      out[field.key] = JSON.stringify(values[field.key] ?? emptyValue(field.kind));
    }
    return out;
  }, [fields, values]);

  const pageTitle = title.trim() || (recipeId ? "Untitled recipe" : `New ${typeName.toLowerCase()}`);

  useEffect(() => {
    const header = stickyHeaderRef.current;
    if (!header) return;

    function updateScrollOffset() {
      const node = stickyHeaderRef.current;
      if (!node) return;
      setScrollOffset(node.offsetHeight + 12);
    }

    updateScrollOffset();
    const observer = new ResizeObserver(updateScrollOffset);
    observer.observe(header);
    window.addEventListener("resize", updateScrollOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollOffset);
    };
  }, []);

  const scrollTargetStyle = useMemo(
    () => ({ scrollMarginTop: scrollOffset }) as const,
    [scrollOffset],
  );

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
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function onTitleChange(next: string) {
    setTitle(next);
    if (!slugTouched) setSlug(slugify(next));
  }

  function submitWithStatus(nextStatus: string) {
    setStatus(nextStatus);
    if (statusRef.current) statusRef.current.value = nextStatus;
    formRef.current?.requestSubmit();
  }

  function attemptSaveDraft() {
    if (!title.trim()) {
      const errors = { title: "Title is required to save a draft." };
      setFieldErrors(errors);
      setPublishAlert("");
      scrollToField("title");
      return;
    }
    setFieldErrors({});
    setPublishAlert("");
    submitWithStatus("draft");
  }

  function attemptPublish() {
    const errors = validateForPublish(title, fields, values);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setPublishAlert("Complete the required fields below before publishing.");
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

    return (
      <div
        key={field.key}
        id={`recipe-field-${field.key}`}
        style={scrollTargetStyle}
        className={isWide ? "md:col-span-2" : ""}
      >
        <FieldLabel
          label={field.label}
          required={field.required}
          helpText={field.helpText}
          compact={compact}
        />
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
        className="sticky top-0 z-50 -mx-5 mb-8 border-b border-line bg-[var(--cream)] px-5 py-3 md:-mx-6 md:px-6"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
            <RecipeStatusBadge status={status} />
            {recipeId ? (
              <DeleteRecipeButton recipeId={recipeId} recipeTitle={pageTitle} />
            ) : null}
            <button
              type="button"
              onClick={attemptSaveDraft}
              className={`${editorSecondaryBtn} ${adminFocusRing}`}
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={attemptPublish}
              className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
            >
              Publish
            </button>
          </div>
        </div>
      </div>

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
        {fields.map((field) => (
          <input key={field.key} type="hidden" name={`field:${field.key}`} value={encoded[field.key]} />
        ))}
        {categoryIds.map((id) => (
          <input key={id} type="hidden" name="categoryIds" value={id} />
        ))}

        {publishAlert ? (
          <p
            className="rounded-sm border border-line bg-paper px-4 py-3 text-sm text-terracotta"
            role="alert"
            style={scrollTargetStyle}
          >
            {publishAlert}
          </p>
        ) : null}

        <EditorSection title="Basics" description="Title, summary, and discovery settings.">
          <div className="grid gap-4 md:grid-cols-2">
            <label id="recipe-field-title" className="grid gap-1.5 md:col-span-2" style={scrollTargetStyle}>
              <span className="text-sm font-semibold text-ink">
                Title<span className="text-terracotta"> *</span>
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
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-ink">Slug</span>
              <input
                name="slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                className={compactInputClass}
              />
            </label>
            <div className="flex flex-wrap items-end gap-4 pb-1">
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
            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-sm font-semibold text-ink">Excerpt</span>
              <textarea
                name="excerpt"
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                rows={3}
                className={adminInputClass}
              />
            </label>
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-semibold text-ink">Categories</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <label
                    key={category.id}
                    className="flex items-center gap-2 rounded-sm border border-line px-3 py-1.5 text-sm transition-colors hover:bg-cream"
                  >
                    <input
                      type="checkbox"
                      checked={categoryIds.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </EditorSection>

        {detailFields.length ? (
          <EditorSection
            title="Recipe details"
            description="Times, yield, and metadata shown on the public recipe card."
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {detailFields.map((field) => renderField(field, { compact: true }))}
            </div>
          </EditorSection>
        ) : null}

        {contentFields.length ? (
          <EditorSection
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
          <EditorSection title="Media" description="Hero image and main walkthrough video.">
            <div className="grid gap-5 md:grid-cols-2">
              {mediaFields.map((field) => renderField(field))}
            </div>
          </EditorSection>
        ) : null}

        {advancedFields.length || specialistFields.length ? (
          <section className="border border-line bg-paper">
            <button
              type="button"
              id="recipe-advanced-toggle"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-expanded={advancedOpen}
              aria-controls="recipe-advanced-panel"
              className={`flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left md:px-6 ${adminFocusRing}`}
            >
              <div>
                <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                  Advanced
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Optional video metadata, nutrition, and type-specific fields.
                </p>
              </div>
              <span className="text-sm text-muted" aria-hidden>
                {advancedOpen ? "−" : "+"}
              </span>
              <span className="sr-only">{advancedOpen ? "Collapse advanced fields" : "Expand advanced fields"}</span>
            </button>
            {advancedOpen ? (
              <div
                id="recipe-advanced-panel"
                role="region"
                aria-labelledby="recipe-advanced-toggle"
                className="grid gap-5 border-t border-line px-5 py-5 md:grid-cols-2 md:px-6"
              >
                {advancedFields.map((field) => renderField(field))}
                {specialistFields.map((field) => renderField(field))}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="button" onClick={attemptSaveDraft} className={`${editorSecondaryBtn} ${adminFocusRing}`}>
            Save draft
          </button>
          <button type="button" onClick={attemptPublish} className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Publish
          </button>
        </div>
      </form>
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
        className={`${adminInputClass}${invalid ? ` ${inputErrorClass}` : ""}`}
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
          <div key={`${url}-${index}`} className="flex gap-2">
            <input
              value={url}
              onChange={(event) => {
                const next = [...urls];
                next[index] = event.target.value;
                onChange(next);
              }}
              className={compactInputClass}
            />
            <button
              type="button"
              className={removeActionClass}
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
        <div key={index} className="flex gap-2">
          <input
            value={item}
            placeholder={placeholder}
            onChange={(event) => {
              const next = [...items];
              next[index] = event.target.value;
              onChange(next);
            }}
            className={inputClass}
          />
          <button
            type="button"
            className={removeActionClass}
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
            onChange={(event) => {
              const next = [...items];
              next[index] = { ...item, note: event.target.value };
              onChange(next);
            }}
            className={adminInputClass}
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
        <div key={groupIndex} className="grid gap-3">
          <input
            value={group.name || ""}
            placeholder="Group name (optional)"
            onChange={(event) => {
              const next = [...groups];
              next[groupIndex] = { ...group, name: event.target.value };
              update(next);
            }}
            className={`${compactInputClass} max-w-md`}
          />
          <div className="hidden gap-2 px-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted md:grid md:grid-cols-[8.5rem_minmax(0,1.6fr)_minmax(0,1fr)_3.5rem]">
            <span>Amount</span>
            <span>Ingredient</span>
            <span>Notes</span>
            <span className="sr-only">Actions</span>
          </div>
          {group.items.map((item, itemIndex) => (
            <div
              key={itemIndex}
              className="grid gap-2 md:grid-cols-[8.5rem_minmax(0,1.6fr)_minmax(0,1fr)_3.5rem] md:items-center"
            >
              <input
                value={item.amount}
                placeholder="Amount"
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
                onChange={(event) => {
                  const next = [...groups];
                  const items = [...group.items];
                  items[itemIndex] = { ...item, notes: event.target.value };
                  next[groupIndex] = { ...group, items };
                  update(next);
                }}
                className={compactInputClass}
              />
              <button
                type="button"
                className={removeActionClass}
                onClick={() => {
                  const next = [...groups];
                  const items = group.items.filter((_, i) => i !== itemIndex);
                  next[groupIndex] = { ...group, items: items.length ? items : [{ item: "", amount: "", notes: "" }] };
                  update(next);
                }}
              >
                Remove
              </button>
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
              <div key={stepIndex} className="flex gap-3">
                <span className="mt-2.5 w-5 shrink-0 text-xs font-semibold tabular-nums text-muted">
                  {stepNumber}
                </span>
                <textarea
                  value={step}
                  rows={2}
                  onChange={(event) => {
                    const next = [...groups];
                    const steps = [...group.steps];
                    steps[stepIndex] = event.target.value;
                    next[groupIndex] = { ...group, steps };
                    onChange(next);
                  }}
                  className={`${adminInputClass} min-h-[2.75rem] flex-1`}
                />
                <button
                  type="button"
                  className={`${removeActionClass} mt-2 self-start`}
                  onClick={() => {
                    const next = [...groups];
                    const steps = group.steps.filter((_, i) => i !== stepIndex);
                    next[groupIndex] = { ...group, steps: steps.length ? steps : [""] };
                    onChange(next);
                  }}
                >
                  Remove
                </button>
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="max-h-48 object-cover" />
      ) : null}
    </div>
  );
}
