"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { deleteCategoryAction, saveCategoryAction } from "@/app/admin/actions";
import {
  adminCompactPrimaryButtonClass,
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import {
  AdminSavedStatus,
  CATEGORY_DELETED_PARAMS,
  CATEGORY_SAVED_PARAMS,
  useTransientSavedFlag,
  useTransientSavedId,
} from "@/lib/admin-transient-feedback";
import {
  type AdminCategory,
  CATEGORY_GROUP_OPTIONS,
  categoryGroupLabel,
  formatRecipeCount,
  partitionCategoriesByGroup,
} from "@/lib/category-admin";
import { slugify } from "@/lib/fields";

const helperRowClass = "mt-1.5 min-h-[1.75rem] text-xs leading-4 text-muted";

const secondaryBtnClass =
  "inline-flex min-h-11 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta sm:min-h-9";

type CategoryDraft = {
  name: string;
  description: string;
  group: string;
};

function draftFromCategory(category: AdminCategory): CategoryDraft {
  return {
    name: category.name,
    description: category.description,
    group: category.group,
  };
}

function draftsEqual(a: CategoryDraft, b: CategoryDraft) {
  return a.name === b.name && a.description === b.description && a.group === b.group;
}

function EditorFieldColumn({
  label,
  htmlFor,
  helper,
  helperId,
  helperError,
  children,
}: {
  label: string;
  htmlFor?: string;
  helper?: string;
  helperId?: string;
  helperError?: boolean;
  children: React.ReactNode;
}) {
  const labelProps = htmlFor ? { htmlFor } : {};
  const LabelTag = htmlFor ? "label" : "div";

  return (
    <div className="flex min-w-0 flex-col">
      <LabelTag {...labelProps} className="min-h-[1.25rem] text-sm font-semibold leading-5 text-ink">
        {label}
      </LabelTag>
      <div className="mt-1.5">{children}</div>
      <p
        id={helperId}
        className={`${helperRowClass}${helperError ? " font-semibold text-terracotta" : ""}`}
        role={helperError ? "alert" : undefined}
      >
        {helper || "\u00A0"}
      </p>
    </div>
  );
}

function CategoryMeta({ category }: { category: AdminCategory }) {
  const group = categoryGroupLabel(category.group);
  return (
    <p className="mt-0.5 text-sm leading-5 text-muted">
      {group} ·{" "}
      <span className="font-semibold text-ink">{formatRecipeCount(category.recipeCount)}</span>
    </p>
  );
}

function CategoryEditor({
  category,
  saved,
  panelId,
  onCancel,
  onDirtyChange,
}: {
  category: AdminCategory;
  saved: boolean;
  panelId: string;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const nameId = useId();
  const groupId = useId();
  const descriptionId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const initial = draftFromCategory(category);
  const [draft, setDraft] = useState(initial);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const isDirty = !draftsEqual(draft, initial);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleCancel() {
    setDraft(initial);
    onDirtyChange(false);
    onCancel();
  }

  return (
    <div
      id={panelId}
      role="region"
      aria-label={`Editing ${category.name}`}
      className="border-l-2 border-olive/30 bg-cream/20 px-1 py-2.5 sm:px-2.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-ink">{category.name}</p>
        <AdminSavedStatus show={saved} />
      </div>

      <form action={saveCategoryAction} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={category.id} />
        {/* Preserved for action contract; update ignores submitted slug and keeps existing.slug */}
        <input type="hidden" name="slug" value={category.slug} />
        <div className="grid gap-3 2xl:grid-cols-2">
          <EditorFieldColumn label="Name" htmlFor={nameId}>
            <input
              ref={nameRef}
              id={nameId}
              name="name"
              required
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              className={adminInputClass}
            />
          </EditorFieldColumn>
          <div className="flex min-w-0 flex-col">
            <p className="min-h-[1.25rem] text-sm font-semibold leading-5 text-ink">Slug</p>
            <p className="mt-1.5 font-mono text-sm text-muted">{category.slug}</p>
            <p className={helperRowClass}>Set at creation.</p>
          </div>
          <EditorFieldColumn label="Menu group" htmlFor={groupId}>
            <select
              id={groupId}
              name="group"
              value={draft.group}
              onChange={(event) => setDraft((current) => ({ ...current, group: event.target.value }))}
              className={`${adminSelectClass} w-full`}
            >
              {CATEGORY_GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </EditorFieldColumn>
          <EditorFieldColumn label="Description" htmlFor={descriptionId}>
            <textarea
              id={descriptionId}
              name="description"
              rows={2}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Short description shown where categories are surfaced"
              className="min-h-[2.75rem] w-full resize-y rounded-sm border border-line bg-paper px-3.5 py-2 text-sm text-ink outline-none transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 focus-visible:border-olive focus-visible:ring-2 focus-visible:ring-olive/15"
            />
          </EditorFieldColumn>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleCancel} className={`${secondaryBtnClass} ${adminFocusRing}`}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isDirty}
            className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
          >
            Save category
          </button>
        </div>
      </form>

      <form ref={deleteFormRef} action={deleteCategoryAction} className="mt-3 border-t border-line/80 pt-3">
        <input type="hidden" name="id" value={category.id} />
        <button
          type="button"
          className={`inline-flex min-h-11 items-center text-sm font-semibold text-terracotta/90 transition-colors hover:text-terracotta sm:min-h-0 ${adminFocusRing}`}
          onClick={() => {
            const recipeNote =
              category.recipeCount > 0
                ? `\n${category.recipeCount} ${category.recipeCount === 1 ? "recipe" : "recipes"} will lose this category tag. The recipes themselves are not deleted.`
                : "";
            if (
              window.confirm(
                `Delete “${category.name}”? This removes the category from menus and filters.${recipeNote}`,
              )
            ) {
              deleteFormRef.current?.requestSubmit();
            }
          }}
        >
          Delete category
        </button>
      </form>
    </div>
  );
}

function CollapsedCategoryRow({
  category,
  saved,
  editorPanelId,
  onEdit,
}: {
  category: AdminCategory;
  saved: boolean;
  editorPanelId: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-x-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5 text-ink">{category.name}</p>
        <CategoryMeta category={category} />
        {category.description ? (
          <p className="mt-0.5 text-sm leading-5 text-muted">{category.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <AdminSavedStatus show={saved} />
        <button
          type="button"
          onClick={onEdit}
          aria-expanded={false}
          aria-controls={editorPanelId}
          aria-label={`Edit ${category.name}`}
          className={`inline-flex min-h-11 items-center text-sm ${adminLinkClass} ${adminFocusRing} sm:min-h-0`}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function AddCategoryPanel({
  error,
  initialName = "",
  initialSlug = "",
  initialDescription = "",
  initialGroup = "course",
  onCancel,
}: {
  error?: string;
  initialName?: string;
  initialSlug?: string;
  initialDescription?: string;
  initialGroup?: string;
  onCancel: () => void;
}) {
  const nameId = useId();
  const slugId = useId();
  const slugHelpId = useId();
  const groupId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialSlug));
  const [group, setGroup] = useState(initialGroup);
  const [description, setDescription] = useState(initialDescription);
  const [synced, setSynced] = useState({
    name: initialName,
    slug: initialSlug,
    description: initialDescription,
    group: initialGroup,
  });
  if (
    initialName !== synced.name ||
    initialSlug !== synced.slug ||
    initialDescription !== synced.description ||
    initialGroup !== synced.group
  ) {
    setSynced({
      name: initialName,
      slug: initialSlug,
      description: initialDescription,
      group: initialGroup,
    });
    setName(initialName);
    setSlug(initialSlug);
    setDescription(initialDescription);
    setGroup(initialGroup);
    setSlugTouched(Boolean(initialSlug));
  }

  function onNameChange(next: string) {
    setName(next);
    if (!slugTouched) setSlug(slugify(next));
  }

  const nameError = error === "missing-name" ? "Name is required." : undefined;
  const slugError =
    error === "duplicate-slug"
      ? "That slug is already used by another category."
      : error === "invalid-slug"
        ? "Slug must include letters or numbers."
        : undefined;
  const groupError = error === "invalid-group" ? "Choose a menu group." : undefined;

  return (
    <div className="border-y border-line/80 bg-cream/25 py-5">
      <h2 className="font-serif text-xl text-ink">New category</h2>
      <p className="mt-1 text-sm text-muted">
        Adds a category to menus and recipe discovery filters.
      </p>
      <form action={saveCategoryAction} className="mt-4 grid gap-3">
        <div className="grid gap-3 2xl:grid-cols-2">
          <EditorFieldColumn
            label="Name"
            htmlFor={nameId}
            helper={nameError}
            helperError={Boolean(nameError)}
          >
            <input
              id={nameId}
              name="name"
              required
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. Appetizers"
              aria-invalid={nameError ? true : undefined}
              className={adminInputClass}
            />
          </EditorFieldColumn>
          <EditorFieldColumn
            label="Slug"
            htmlFor={slugId}
            helper={slugError ?? "Optional — generated from name"}
            helperId={slugHelpId}
            helperError={Boolean(slugError)}
          >
            <input
              id={slugId}
              name="slug"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              placeholder="e.g. appetizers"
              aria-invalid={slugError ? true : undefined}
              aria-describedby={slugHelpId}
              className={adminInputClass}
            />
          </EditorFieldColumn>
          <EditorFieldColumn
            label="Menu group"
            htmlFor={groupId}
            helper={groupError}
            helperError={Boolean(groupError)}
          >
            <select
              id={groupId}
              name="group"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              className={`${adminSelectClass} w-full`}
            >
              {CATEGORY_GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </EditorFieldColumn>
          <EditorFieldColumn label="Description" htmlFor={descriptionId}>
            <textarea
              id={descriptionId}
              name="description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Short description shown where categories are surfaced"
              className="min-h-[2.75rem] w-full resize-y rounded-sm border border-line bg-paper px-3.5 py-2 text-sm text-ink outline-none transition-[color,box-shadow,border-color] duration-150 motion-reduce:transition-none placeholder:text-muted focus:border-olive focus:ring-2 focus:ring-olive/15 focus-visible:border-olive focus-visible:ring-2 focus-visible:ring-olive/15"
            />
          </EditorFieldColumn>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onCancel} className={`${secondaryBtnClass} ${adminFocusRing}`}>
            Cancel
          </button>
          <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Add category
          </button>
        </div>
      </form>
    </div>
  );
}

export type CategoriesManagerProps = {
  categories: AdminCategory[];
  savedCategoryId?: string | null;
  initialAddOpen?: boolean;
  addError?: string;
  addInitial?: {
    name?: string;
    slug?: string;
    description?: string;
    group?: string;
  };
  deleted?: boolean;
};

export function CategoriesManager({
  categories,
  savedCategoryId = null,
  initialAddOpen = false,
  addError,
  addInitial,
  deleted = false,
}: CategoriesManagerProps) {
  const addPanelId = useId();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const [syncedAddOpen, setSyncedAddOpen] = useState(initialAddOpen);
  if (initialAddOpen !== syncedAddOpen) {
    setSyncedAddOpen(initialAddOpen);
    if (initialAddOpen) setAddOpen(true);
  }
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const visibleSavedCategoryId = useTransientSavedId(savedCategoryId, CATEGORY_SAVED_PARAMS);
  const showDeleted = useTransientSavedFlag(deleted, CATEGORY_DELETED_PARAMS);

  const sections = partitionCategoriesByGroup(categories);

  const tryExpand = useCallback(
    (id: string) => {
      if (expandedId === id) return;
      if (dirtyRef.current && !window.confirm("Discard unsaved changes to this category?")) {
        return;
      }
      setDirty(false);
      setExpandedId(id);
      setAddOpen(false);
    },
    [expandedId],
  );

  useEffect(() => {
    if (!savedCategoryId) return;
    document.getElementById(`category-${savedCategoryId}`)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [savedCategoryId]);

  useEffect(() => {
    if (deleted) {
      document.getElementById("categories")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [deleted]);

  return (
    <div id="categories" className="min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 max-w-2xl">
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            Categories
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Organize the categories used for recipe discovery and menus.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (addOpen) {
              setAddOpen(false);
              return;
            }
            if (dirtyRef.current && !window.confirm("Discard unsaved changes to this category?")) {
              return;
            }
            setDirty(false);
            setExpandedId(null);
            setAddOpen(true);
          }}
          aria-expanded={addOpen}
          aria-controls={addPanelId}
          className={`${adminCompactPrimaryButtonClass} ${adminFocusRing} shrink-0 self-start`}
        >
          {addOpen ? "Close" : "New category"}
        </button>
      </div>

      {addOpen ? (
        <div id={addPanelId} className="mt-5">
          <AddCategoryPanel
            error={addError}
            initialName={addInitial?.name}
            initialSlug={addInitial?.slug}
            initialDescription={addInitial?.description}
            initialGroup={addInitial?.group}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      ) : null}

      {showDeleted ? (
        <p className="mt-4 text-sm text-olive" role="status" aria-live="polite">
          Category deleted.
        </p>
      ) : null}

      <div className="mt-8 space-y-8">
        {sections.map((section) =>
          section.categories.length > 0 ? (
            <section key={section.group} aria-labelledby={`category-group-${section.group}`}>
              <h2
                id={`category-group-${section.group}`}
                className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive"
              >
                {section.label} · {section.categories.length}
              </h2>
              <ul className="mt-2 divide-y divide-line/80 border-y border-line/80">
                {section.categories.map((category) => {
                  const expanded = expandedId === category.id;
                  const saved = visibleSavedCategoryId === category.id;
                  const editorPanelId = `category-editor-${category.id}`;
                  return (
                    <li key={category.id} id={`category-${category.id}`} className="min-w-0">
                      {expanded ? (
                        <CategoryEditor
                          category={category}
                          saved={saved}
                          panelId={editorPanelId}
                          onCancel={() => {
                            setDirty(false);
                            setExpandedId(null);
                          }}
                          onDirtyChange={setDirty}
                        />
                      ) : (
                        <CollapsedCategoryRow
                          category={category}
                          saved={saved}
                          editorPanelId={editorPanelId}
                          onEdit={() => tryExpand(category.id)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
