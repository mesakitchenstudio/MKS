"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { deleteFieldAction, moveFieldAction, saveFieldAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSelectClass,
} from "@/lib/admin-ui";
import { type AdminTypeField, fieldKindLabel, fieldKindUsesOptions, isStructuralFieldDraftChange } from "@/lib/field-admin";
import { FIELD_KINDS, keyFromLabel } from "@/lib/fields";

const helperRowClass = "mt-1.5 min-h-[2rem] text-xs leading-4 text-muted";

const reorderBtnClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-line bg-paper text-sm font-semibold text-muted transition-colors duration-150 hover:bg-cream hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

const secondaryBtnClass =
  "inline-flex h-9 items-center justify-center rounded-sm border border-line bg-paper px-3 text-sm font-semibold text-muted transition-colors duration-150 hover:bg-cream hover:text-terracotta focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta";

type FieldDraft = {
  label: string;
  kind: string;
  helpText: string;
  required: boolean;
  options: string;
};

function draftFromField(field: AdminTypeField): FieldDraft {
  return {
    label: field.label,
    kind: field.kind,
    helpText: field.helpText,
    required: field.required,
    options: field.options.join(", "),
  };
}

function draftsEqual(a: FieldDraft, b: FieldDraft) {
  return (
    a.label === b.label &&
    a.kind === b.kind &&
    a.helpText === b.helpText &&
    a.required === b.required &&
    a.options === b.options
  );
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

function FieldSummaryMeta({ field }: { field: AdminTypeField }) {
  const meta = fieldKindLabel(field.kind);
  return (
    <p className="mt-0.5 text-sm leading-5 text-muted">
      {meta}
      {field.required ? (
        <>
          {" "}
          · <span className="font-semibold text-ink">Required</span>
        </>
      ) : null}
    </p>
  );
}

type FieldFilter = "all" | "shared" | "type-specific" | "required";

const filterOptions: { id: FieldFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "shared", label: "Shared" },
  { id: "type-specific", label: "Type-specific" },
  { id: "required", label: "Required" },
];

function typeSpecificLabel(typeName: string) {
  return `${typeName.toUpperCase()}-SPECIFIC`;
}

function ScopeLabel({ field, typeName }: { field: AdminTypeField; typeName: string }) {
  if (field.isShared) {
    return (
      <div className="min-w-0">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">
          Shared
        </span>
        <p className="text-xs leading-4 text-muted">Used across recipe types</p>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
        {typeSpecificLabel(typeName)}
      </span>
      <p className="text-xs leading-4 text-muted">Only on {typeName} recipes</p>
    </div>
  );
}

function ReorderControls({
  field,
  typeId,
  total,
  disabled = false,
}: {
  field: AdminTypeField;
  typeId: string;
  total: number;
  disabled?: boolean;
}) {
  if (disabled) return null;

  return (
    <div className="flex items-center gap-1">
      <form action={moveFieldAction}>
        <input type="hidden" name="id" value={field.id} />
        <input type="hidden" name="typeId" value={typeId} />
        <input type="hidden" name="direction" value="up" />
        <button
          type="submit"
          disabled={field.globalIndex === 0}
          className={reorderBtnClass}
          aria-label={`Move "${field.label}" up`}
        >
          ↑
        </button>
      </form>
      <form action={moveFieldAction}>
        <input type="hidden" name="id" value={field.id} />
        <input type="hidden" name="typeId" value={typeId} />
        <input type="hidden" name="direction" value="down" />
        <button
          type="submit"
          disabled={field.globalIndex === total - 1}
          className={reorderBtnClass}
          aria-label={`Move "${field.label}" down`}
        >
          ↓
        </button>
      </form>
    </div>
  );
}

function FieldEditor({
  field,
  typeId,
  typeName,
  total,
  reorderDisabled,
  recipesWithData,
  recipesMissingValue,
  fieldError,
  onCancel,
  onDirtyChange,
}: {
  field: AdminTypeField;
  typeId: string;
  typeName: string;
  total: number;
  reorderDisabled?: boolean;
  recipesWithData: number;
  recipesMissingValue: number;
  fieldError?: "field-type-locked" | "require-confirm";
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const labelId = useId();
  const keyId = useId();
  const kindId = useId();
  const optionsId = useId();
  const helpId = useId();
  const labelRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const initial = draftFromField(field);
  const [draft, setDraft] = useState(initial);
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const isDirty = !draftsEqual(draft, initial);
  const showOptions = fieldKindUsesOptions(draft.kind);
  const kindLocked = recipesWithData > 0;
  const structuralDirty = isStructuralFieldDraftChange(
    { kind: field.kind, required: field.required, options: field.options },
    draft,
  );
  const makingRequired = draft.required && !field.required;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  function updateDraft(partial: Partial<FieldDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function handleCancel() {
    setDraft(initial);
    onDirtyChange(false);
    onCancel();
  }

  function appendConfirmRequired(form: HTMLFormElement) {
    if (form.querySelector('input[name="confirmRequired"]')) return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "confirmRequired";
    input.value = "1";
    form.appendChild(input);
  }

  function attemptSave() {
    if (kindLocked && draft.kind !== field.kind) {
      return;
    }

    if (structuralDirty && recipesWithData > 0) {
      const sharedNote = field.isShared
        ? `This shared field uses the common Mesa schema key “${field.key}”. Changes here apply to ${typeName} recipes in this template only.`
        : `This change applies to the ${typeName} template.`;
      if (
        !window.confirm(
          `${sharedNote}\n\n${recipesWithData} existing ${typeName} recipe(s) already store data for “${field.label}”. Continue?`,
        )
      ) {
        return;
      }
    }

    if (makingRequired && recipesMissingValue > 0) {
      if (
        !window.confirm(
          `Make “${field.label}” required on publish?\n\n${recipesMissingValue} existing ${typeName} recipe(s) do not yet have a value. They will need this field before they can be published again.`,
        )
      ) {
        return;
      }
      const form = formRef.current;
      if (!form) return;
      appendConfirmRequired(form);
      form.requestSubmit();
      return;
    }

    formRef.current?.requestSubmit();
  }

  return (
    <div className="border-l-2 border-olive/35 bg-cream/25 px-4 py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-4">
            <p className="text-sm font-semibold text-ink">{field.label}</p>
            <ScopeLabel field={field} typeName={typeName} />
          </div>
          {field.isShared ? (
            <p className="mt-2 max-w-xl text-xs leading-5 text-muted">
              Part of Mesa&apos;s common recipe schema. Each recipe type keeps its own template
              copy — label, help text, and required settings here apply to {typeName} only.
            </p>
          ) : null}
          {recipesWithData > 0 ? (
            <p className="mt-2 text-xs leading-5 text-muted">
              {recipesWithData} {typeName} recipe{recipesWithData === 1 ? "" : "s"} store data under
              key <span className="font-mono text-ink/80">{field.key}</span>.
            </p>
          ) : null}
        </div>
        <ReorderControls
          field={field}
          typeId={typeId}
          total={total}
          disabled={reorderDisabled}
        />
      </div>

      {fieldError === "field-type-locked" ? (
        <p className="mt-3 text-sm font-semibold text-terracotta" role="alert">
          Field type cannot change while recipes already store data for this field.
        </p>
      ) : null}
      {fieldError === "require-confirm" ? (
        <p className="mt-3 text-sm font-semibold text-terracotta" role="alert">
          Confirm the required change, then save again.
        </p>
      ) : null}

      <form ref={formRef} action={saveFieldAction} className="mt-4 grid gap-4">
        <input type="hidden" name="id" value={field.id} />
        <input type="hidden" name="typeId" value={typeId} />
        <div className="grid gap-4 md:grid-cols-2">
          <EditorFieldColumn label="Label" htmlFor={labelId}>
            <input
              ref={labelRef}
              id={labelId}
              name="label"
              required
              value={draft.label}
              onChange={(event) => updateDraft({ label: event.target.value })}
              className={adminInputClass}
            />
          </EditorFieldColumn>
          <EditorFieldColumn label="Key" htmlFor={keyId} helper="Stored in recipe data. Cannot be changed after creation.">
            <input
              id={keyId}
              name="key"
              value={field.key}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              className={`${adminInputClass} cursor-default bg-cream/60 text-muted`}
            />
          </EditorFieldColumn>
          <EditorFieldColumn
            label="Kind"
            htmlFor={kindId}
            helper={
              kindLocked
                ? "Field type is locked while recipes store data for this field."
                : undefined
            }
          >
            {kindLocked ? <input type="hidden" name="kind" value={field.kind} /> : null}
            <select
              id={kindId}
              name={kindLocked ? undefined : "kind"}
              value={draft.kind}
              disabled={kindLocked}
              onChange={(event) => updateDraft({ kind: event.target.value })}
              className={`${adminSelectClass} w-full${kindLocked ? " cursor-not-allowed bg-cream/60 text-muted" : ""}`}
            >
              {FIELD_KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </select>
          </EditorFieldColumn>
          {showOptions ? (
            <EditorFieldColumn
              label="Options"
              htmlFor={optionsId}
              helper="Enter options separated by commas."
            >
              <input
                id={optionsId}
                name="options"
                value={draft.options}
                onChange={(event) => updateDraft({ options: event.target.value })}
                placeholder="Easy, Medium, Hard"
                className={adminInputClass}
              />
            </EditorFieldColumn>
          ) : (
            <div aria-hidden className="hidden md:block" />
          )}
          <div className="md:col-span-2">
            <EditorFieldColumn label="Help text" htmlFor={helpId}>
              <input
                id={helpId}
                name="helpText"
                value={draft.helpText}
                onChange={(event) => updateDraft({ helpText: event.target.value })}
                placeholder="Shown beneath the field label"
                className={adminInputClass}
              />
            </EditorFieldColumn>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            name="required"
            checked={draft.required}
            onChange={(event) => updateDraft({ required: event.target.checked })}
          />
          Required on publish
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={handleCancel} className={`${secondaryBtnClass} ${adminFocusRing}`}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!isDirty}
            onClick={attemptSave}
            className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
          >
            Save field
          </button>
        </div>
      </form>

      {!field.isShared ? (
        <form ref={deleteFormRef} action={deleteFieldAction} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={field.id} />
          <input type="hidden" name="typeId" value={typeId} />
          <button
            type="button"
            className={`text-sm font-semibold text-terracotta/90 transition-colors hover:text-terracotta ${adminFocusRing}`}
            onClick={() => {
              const affectedLine =
                recipesWithData > 0
                  ? `\n\n${recipesWithData} ${typeName} recipe${recipesWithData === 1 ? "" : "s"} store data for this field. Values remain in the database but will no longer appear in the editor or on the public site.`
                  : "\n\nNo recipes currently store data for this field.";
              if (
                window.confirm(
                  `Delete “${field.label}” from the ${typeName} template?${affectedLine}`,
                )
              ) {
                deleteFormRef.current?.requestSubmit();
              }
            }}
          >
            Delete field
          </button>
        </form>
      ) : (
        <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
          Shared schema fields cannot be deleted from a type template.
        </p>
      )}
    </div>
  );
}

function CollapsedFieldRow({
  field,
  typeId,
  typeName,
  total,
  saved,
  reorderDisabled,
  onEdit,
}: {
  field: AdminTypeField;
  typeId: string;
  typeName: string;
  total: number;
  saved: boolean;
  reorderDisabled?: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4 sm:gap-y-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-5 text-ink">{field.label}</p>
        <FieldSummaryMeta field={field} />
        <p className="mt-0.5 font-mono text-xs text-muted/80">{field.key}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4">
        {saved ? <span className="text-sm text-olive">Saved.</span> : null}
        <ScopeLabel field={field} typeName={typeName} />
        <button
          type="button"
          onClick={onEdit}
          aria-expanded={false}
          className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
        >
          Edit
        </button>
        <ReorderControls
          field={field}
          typeId={typeId}
          total={total}
          disabled={reorderDisabled}
        />
      </div>
    </div>
  );
}

function AddFieldPanel({
  typeId,
  typeName,
  error,
  onCancel,
}: {
  typeId: string;
  typeName: string;
  error?: string;
  onCancel: () => void;
}) {
  const labelId = useId();
  const keyId = useId();
  const keyHelpId = useId();
  const kindId = useId();
  const optionsId = useId();
  const helpId = useId();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [kind, setKind] = useState("text");
  const showOptions = fieldKindUsesOptions(kind);

  function onLabelChange(next: string) {
    setLabel(next);
    if (!keyTouched) setKey(keyFromLabel(next));
  }

  const keyError =
    error === "duplicate-key"
      ? "That key is already used on this type."
      : error === "invalid-key"
        ? "Key must include letters or numbers."
        : undefined;

  return (
    <div className="border border-line bg-cream/30 px-4 py-3.5">
      <h3 className="text-sm font-semibold text-ink">New type-specific field</h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        Added only to {typeName}. Choose a label and field type; the technical key stores recipe
        data and cannot be changed later.
      </p>
      <form action={saveFieldAction} className="mt-4 grid gap-4">
        <input type="hidden" name="typeId" value={typeId} />
        <div className="grid gap-4 md:grid-cols-2">
          <EditorFieldColumn label="Label" htmlFor={labelId}>
            <input
              id={labelId}
              name="label"
              required
              value={label}
              onChange={(event) => onLabelChange(event.target.value)}
              placeholder="e.g. Frosting notes"
              className={adminInputClass}
            />
          </EditorFieldColumn>
          <EditorFieldColumn
            label="Key"
            htmlFor={keyId}
            helper={keyError ?? "Optional — generated from label"}
            helperId={keyHelpId}
            helperError={Boolean(keyError)}
          >
            <input
              id={keyId}
              name="key"
              value={key}
              onChange={(event) => {
                setKeyTouched(true);
                setKey(event.target.value);
              }}
              placeholder="e.g. frostingNotes"
              aria-invalid={keyError ? true : undefined}
              aria-describedby={keyHelpId}
              className={adminInputClass}
            />
          </EditorFieldColumn>
          <EditorFieldColumn label="Kind" htmlFor={kindId}>
            <select
              id={kindId}
              name="kind"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              className={`${adminSelectClass} w-full`}
            >
              {FIELD_KINDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </EditorFieldColumn>
          {showOptions ? (
            <EditorFieldColumn
              label="Options"
              htmlFor={optionsId}
              helper="Enter options separated by commas."
            >
              <input
                id={optionsId}
                name="options"
                placeholder="Easy, Medium, Hard"
                className={adminInputClass}
              />
            </EditorFieldColumn>
          ) : (
            <div aria-hidden className="hidden md:block" />
          )}
          <div className="md:col-span-2">
            <EditorFieldColumn label="Help text" htmlFor={helpId}>
              <input
                id={helpId}
                name="helpText"
                placeholder="Shown beneath the field label"
                className={adminInputClass}
              />
            </EditorFieldColumn>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="required" />
          Required on publish
        </label>
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={onCancel} className={`${secondaryBtnClass} ${adminFocusRing}`}>
            Cancel
          </button>
          <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Add field
          </button>
        </div>
      </form>
    </div>
  );
}

export type TypeFieldsManagerProps = {
  typeId: string;
  typeName: string;
  fields: AdminTypeField[];
  typeSpecificCount: number;
  sharedCount: number;
  recipeCount: number;
  fieldUsageByKey: Record<string, number>;
  fieldMissingByKey: Record<string, number>;
  savedFieldId?: string | null;
  focusFieldId?: string | null;
  initialExpandedFieldId?: string | null;
  initialAddOpen?: boolean;
  addError?: string;
  listError?: string;
  fieldError?: "field-type-locked" | "require-confirm";
  deleted?: boolean;
};

function matchesFilter(field: AdminTypeField, filter: FieldFilter) {
  switch (filter) {
    case "shared":
      return field.isShared;
    case "type-specific":
      return !field.isShared;
    case "required":
      return field.required;
    default:
      return true;
  }
}

export function TypeFieldsManager({
  typeId,
  typeName,
  fields,
  typeSpecificCount,
  sharedCount,
  recipeCount,
  fieldUsageByKey,
  fieldMissingByKey,
  savedFieldId = null,
  focusFieldId = null,
  initialExpandedFieldId = null,
  initialAddOpen = false,
  addError,
  listError,
  fieldError,
  deleted = false,
}: TypeFieldsManagerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedFieldId);
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const [filter, setFilter] = useState<FieldFilter>("all");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const total = fields.length;
  const orderedFields = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleFields = orderedFields.filter((field) => matchesFilter(field, filter));
  const reorderDisabled = filter !== "all";

  useEffect(() => {
    if (initialExpandedFieldId) {
      setExpandedId(initialExpandedFieldId);
    }
  }, [initialExpandedFieldId]);

  const tryExpand = useCallback(
    (id: string) => {
      if (expandedId === id) return;
      if (dirtyRef.current && !window.confirm("Discard unsaved changes to this field?")) {
        return;
      }
      setDirty(false);
      setExpandedId(id);
      setAddOpen(false);
    },
    [expandedId],
  );

  useEffect(() => {
    const targetId = focusFieldId || savedFieldId;
    if (!targetId) return;
    const element = document.getElementById(`field-${targetId}`);
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusFieldId, savedFieldId]);

  useEffect(() => {
    if (window.location.hash === "#fields") {
      document.getElementById("fields")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [deleted]);

  return (
    <section id="fields" className="mt-8">
      <h2 className="font-serif text-xl text-ink">Fields</h2>
      <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
        {total} fields · {typeSpecificCount} type-specific · {sharedCount} shared
      </p>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Listed in template order. Reorder changes field placement in the recipe editor and on public
        recipe pages for this type.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {filterOptions.map((option) => {
          const active = filter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.id)}
              className={`rounded-sm border px-2.5 py-1 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${adminFocusRing} ${
                active
                  ? "border-terracotta/40 bg-terracotta/5 text-terracotta"
                  : "border-line text-muted hover:bg-cream hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {reorderDisabled ? (
        <p className="mt-2 text-xs text-muted">
          Reorder is available when viewing all fields so template order stays unambiguous.
        </p>
      ) : null}

      {listError ? (
        <p className="mt-3 text-sm text-terracotta" role="alert">
          {listError}
        </p>
      ) : null}
      {deleted ? (
        <p className="mt-3 text-sm text-olive" role="status">
          Field deleted.
        </p>
      ) : null}

      {!addOpen ? (
        <button
          type="button"
          onClick={() => {
            if (dirtyRef.current && !window.confirm("Discard unsaved changes to this field?")) {
              return;
            }
            setDirty(false);
            setExpandedId(null);
            setAddOpen(true);
          }}
          className={`mt-4 text-sm font-semibold text-muted transition-colors hover:text-terracotta ${adminFocusRing}`}
        >
          + Add type-specific field
        </button>
      ) : (
        <div className="mt-4">
          <AddFieldPanel
            typeId={typeId}
            typeName={typeName}
            error={addError}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      )}

      <ul className="mt-4 divide-y divide-line border border-line bg-paper">
        {visibleFields.length === 0 ? (
          <li className="px-4 py-6 text-sm text-muted">No fields match this filter.</li>
        ) : null}
        {visibleFields.map((field) => {
          const expanded = expandedId === field.id;
          const saved = savedFieldId === field.id;
          const showFieldError = expanded && fieldError && initialExpandedFieldId === field.id;
          return (
            <li key={field.id} id={`field-${field.id}`}>
              {expanded ? (
                <FieldEditor
                  field={field}
                  typeId={typeId}
                  typeName={typeName}
                  total={total}
                  reorderDisabled={reorderDisabled}
                  recipesWithData={fieldUsageByKey[field.key] ?? 0}
                  recipesMissingValue={fieldMissingByKey[field.key] ?? 0}
                  fieldError={showFieldError ? fieldError : undefined}
                  onCancel={() => {
                    setDirty(false);
                    setExpandedId(null);
                  }}
                  onDirtyChange={setDirty}
                />
              ) : (
                <CollapsedFieldRow
                  field={field}
                  typeId={typeId}
                  typeName={typeName}
                  total={total}
                  saved={saved}
                  reorderDisabled={reorderDisabled}
                  onEdit={() => tryExpand(field.id)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
