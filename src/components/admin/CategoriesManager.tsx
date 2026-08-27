"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { deleteCategoryAction, saveCategoryAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import {
  type AdminCategory,
  CATEGORY_GROUP_OPTIONS,
  categoryGroupLabel,
  formatRecipeCount,
  partitionCategoriesByGroup,
} from "@/lib/category-admin";
import { slugify } from "@/lib/fields";

const helperRowClass = "mt-1.5 min-h-[2rem] text-xs leading-4 text-muted";

const secondaryBtnClass =
  "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

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
      <LabelTag
        {...labelProps}
        className="min-h-[1.25rem] text-sm font-semibold leading-5 text-ink"
      >
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
      {group} · <span className="font-semibold text-ink">{formatRecipeCount(category.recipeCount)}</span>
    </p>
  );
}

function CategoryEditor({
  category,
  saved,
  onCancel,
  onDirtyChange,
}: {
  category: AdminCategory;
  saved: boolean;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const nameId = useId();
  const slugId = useId();
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
    <div className="border-l-2 border-olive/35 bg-cream/25 px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold text-ink">{category.name}</p>
        {saved ? <span className="text-sm text-olive">Saved.</span> : null}
      </div>

      <form action={saveCategoryAction} className="mt-4 grid gap-4">
        <input type="hidden" name="id" value={category.id} />
        <div className="grid gap-4 md:grid-cols-2">
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
          <EditorFieldColumn
            label="Slug"
            htmlFor={slugId}
            helper="Category slugs cannot be changed after creation."
          >
            <input
              id={slugId}
              name="slug"
              value={category.slug}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              className={`${adminInputClass} cursor-default bg-cream/60 text-muted`}
            />
          </EditorFieldColumn>
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
          <div className="md:col-span-2">
            <EditorFieldColumn label="Description" htmlFor={descriptionId}>
              <input
                id={descriptionId}
                name="description"
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Short description shown where categories are surfaced"
                className={adminInputClass}
              />
            </EditorFieldColumn>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
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

      <form ref={deleteFormRef} action={deleteCategoryAction} className="mt-4 border-t border-line pt-4">
        <input type="hidden" name="id" value={category.id} />
        <button
          type="button"
          className={`text-sm font-semibold text-terracotta/90 transition-colors hover:text-terracotta ${adminFocusRing}`}
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
  onEdit,
}: {
  category: AdminCategory;
  saved: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5 text-ink">{category.name}</p>
        <CategoryMeta category={category} />
        {category.description ? (
          <p className="mt-0.5 text-sm leading-5 text-muted">{category.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {saved ? <span className="text-sm text-olive">Saved.</span> : null}
        <button
          type="button"
          onClick={onEdit}
          aria-expanded={false}
          className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
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

  useEffect(() => {
    setName(initialName);
    setSlug(initialSlug);
    setDescription(initialDescription);
    setGroup(initialGroup);
    setSlugTouched(Boolean(initialSlug));
  }, [initialDescription, initialGroup, initialName, initialSlug]);

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
    <div className="border border-line bg-cream/30 px-4 py-3.5">
      <h2 className="text-sm font-semibold text-ink">New category</h2>
      <form action={saveCategoryAction} className="mt-4 grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <EditorFieldColumn label="Name" htmlFor={nameId} helper={nameError} helperError={Boolean(nameError)}>
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
          <div className="md:col-span-2">
            <EditorFieldColumn label="Description" htmlFor={descriptionId}>
              <input
                id={descriptionId}
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short description shown where categories are surfaced"
                className={adminInputClass}
              />
            </EditorFieldColumn>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

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
    <div id="categories">
      {!addOpen ? (
        <button
          type="button"
          onClick={() => {
            if (dirtyRef.current && !window.confirm("Discard unsaved changes to this category?")) {
              return;
            }
            setDirty(false);
            setExpandedId(null);
            setAddOpen(true);
          }}
          className={`mt-5 text-sm font-semibold text-muted transition-colors hover:text-terracotta ${adminFocusRing}`}
        >
          + Add category
        </button>
      ) : (
        <div className="mt-5">
          <AddCategoryPanel
            error={addError}
            initialName={addInitial?.name}
            initialSlug={addInitial?.slug}
            initialDescription={addInitial?.description}
            initialGroup={addInitial?.group}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      )}

      {deleted ? (
        <p className="mt-4 text-sm text-olive" role="status">
          Category deleted.
        </p>
      ) : null}

      <div className="mt-3 space-y-5">
        {sections.map((section) =>
          section.categories.length > 0 ? (
            <section key={section.group}>
              <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
                {section.label} · {section.categories.length}
              </h2>
              <ul className="mt-2 divide-y divide-line border border-line bg-paper">
                {section.categories.map((category) => {
                  const expanded = expandedId === category.id;
                  const saved = savedCategoryId === category.id;
                  return (
                    <li key={category.id} id={`category-${category.id}`}>
                      {expanded ? (
                        <CategoryEditor
                          category={category}
                          saved={saved}
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
