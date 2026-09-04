"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { deleteFieldAction, moveFieldAction, saveFieldAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminInputClass,
  adminLinkClass,
  adminPrimaryButtonClass,
  adminSelectClass,
  adminTertiaryButtonClass,
} from "@/lib/admin-ui";
import {
  AdminSavedStatus,
  TYPE_FIELD_DELETED_PARAMS,
  TYPE_FIELD_SAVED_PARAMS,
  useTransientSavedFlag,
  useTransientSavedId,
} from "@/lib/admin-transient-feedback";
import {
  type AdminTypeField,
  fieldKindLabel,
  fieldKindUsesOptions,
  isCoreFieldKey,
  isStructuralFieldDraftChange,
} from "@/lib/field-admin";
import {
  TYPE_FIELD_SECTION_DESCRIPTIONS,
  TYPE_FIELD_SECTION_LABELS,
  annotateTypeFieldSectionRuns,
  type EditorSectionId,
} from "@/lib/recipe-type-field-sections";
import { FIELD_KINDS, keyFromLabel } from "@/lib/fields";

const helperRowClass = "mt-1.5 min-h-[2rem] text-xs leading-4 text-muted";

const reorderBtnClass =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-sm text-sm font-semibold text-muted/70 transition-colors duration-150 hover:bg-cream hover:text-terracotta disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta sm:min-h-8 sm:min-w-8";

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

function FieldSectionMarker({
  section,
  isListStart,
  continued,
}: {
  section: EditorSectionId;
  isListStart: boolean;
  continued: boolean;
}) {
  const label = TYPE_FIELD_SECTION_LABELS[section];

  if (continued) {
    return (
      <header className={`${isListStart ? "pt-1" : "pt-4"} mb-0.5 border-b border-line/60 pb-1.5`}>
        <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive/85">
          {label} · Continued
        </h3>
      </header>
    );
  }

  return (
    <header className={`${isListStart ? "pt-1" : "pt-7"} mb-1 border-b border-line/70 pb-2`}>
      <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">{label}</h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        {TYPE_FIELD_SECTION_DESCRIPTIONS[section]}
      </p>
    </header>
  );
}

function FieldSummaryMeta({
  field,
  showTypeSpecific = true,
}: {
  field: AdminTypeField;
  showTypeSpecific?: boolean;
}) {
  const meta = fieldKindLabel(field.kind);
  return (
    <p className="mt-0.5 text-sm leading-5 text-muted">
      {meta}
      {field.required ? (
        <>
          {" "}
          · <span className="font-semibold text-terracotta">Required</span>
        </>
      ) : null}
      {showTypeSpecific && !field.isShared ? (
        <>
          {" "}
          · <span className="font-medium text-olive">Type-specific</span>
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
    <div className="flex items-center gap-0.5">
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
  saved = false,
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
  fieldError?: "field-type-locked" | "require-confirm" | "shared-schema-locked";
  saved?: boolean;
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
  const sharedSchemaLocked = field.isShared;
  const kindLocked = sharedSchemaLocked || recipesWithData > 0;
  const optionsLocked = sharedSchemaLocked;
  const effectiveKind = sharedSchemaLocked || kindLocked ? field.kind : draft.kind;
  const showOptions = fieldKindUsesOptions(effectiveKind);
  const structuralDirty = field.isShared
    ? draft.required !== field.required
    : isStructuralFieldDraftChange(
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

    if (!field.isShared && structuralDirty && recipesWithData > 0) {
      if (
        !window.confirm(
          `This change applies to the ${typeName} template.\n\n${recipesWithData} existing ${typeName} recipe(s) already store data for “${field.label}”. Continue?`,
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
    <div className="border-l-2 border-olive/30 bg-cream/20 px-1 py-2.5 sm:px-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-ink">{field.label}</p>
            <AdminSavedStatus show={saved} />
            {!field.isShared ? (
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-olive">
                Type-specific
              </span>
            ) : null}
          </div>
          {field.isShared ? (
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
              Part of Mesa&apos;s core recipe fields. Label, help text, and required settings here
              apply to {typeName} only.
            </p>
          ) : (
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
              Only on {typeName} recipes.
            </p>
          )}
          {recipesWithData > 0 ? (
            <p className="mt-1 text-xs leading-5 text-muted">
              {recipesWithData} {typeName} recipe{recipesWithData === 1 ? "" : "s"} store data under
              key <span className="font-mono text-ink/80">{field.key}</span>.
            </p>
          ) : null}
        </div>
        <ReorderControls field={field} typeId={typeId} total={total} disabled={reorderDisabled} />
      </div>

      {fieldError === "field-type-locked" ? (
        <p className="mt-2 text-sm font-semibold text-terracotta" role="alert">
          Field type cannot change while recipes already store data for this field.
        </p>
      ) : null}
      {fieldError === "shared-schema-locked" ? (
        <p className="mt-2 text-sm font-semibold text-terracotta" role="alert">
          Shared schema fields cannot change data type or options from a recipe type.
        </p>
      ) : null}
      {fieldError === "require-confirm" ? (
        <p className="mt-2 text-sm font-semibold text-terracotta" role="alert">
          Confirm the required change, then save again.
        </p>
      ) : null}

      <form ref={formRef} action={saveFieldAction} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={field.id} />
        <input type="hidden" name="typeId" value={typeId} />
        <div className="grid gap-3 md:grid-cols-2">
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
          <EditorFieldColumn
            label="Key"
            htmlFor={keyId}
            helper={
              field.isShared
                ? "Common recipe data key. Cannot be changed here."
                : "Stored in recipe data. Cannot be changed after creation."
            }
          >
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
              sharedSchemaLocked
                ? "Defined by Mesa's shared recipe schema. Cannot be changed from a recipe type."
                : kindLocked
                  ? "Field type is locked while recipes store data for this field."
                  : undefined
            }
          >
            {sharedSchemaLocked || kindLocked ? (
              <input type="hidden" name="kind" value={field.kind} />
            ) : null}
            {sharedSchemaLocked || kindLocked ? (
              <input
                id={kindId}
                value={fieldKindLabel(field.kind)}
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className={`${adminInputClass} cursor-default bg-cream/60 text-muted`}
              />
            ) : (
              <select
                id={kindId}
                name="kind"
                value={draft.kind}
                onChange={(event) => updateDraft({ kind: event.target.value })}
                className={`${adminSelectClass} w-full`}
              >
                {FIELD_KINDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            )}
          </EditorFieldColumn>
          {showOptions ? (
            <EditorFieldColumn
              label="Options"
              htmlFor={optionsId}
              helper={
                optionsLocked
                  ? "Defined by Mesa's shared recipe schema."
                  : "Enter options separated by commas."
              }
            >
              {optionsLocked ? (
                <input type="hidden" name="options" value={field.options.join(", ")} />
              ) : null}
              <input
                id={optionsId}
                name={optionsLocked ? undefined : "options"}
                value={optionsLocked ? field.options.join(", ") : draft.options}
                readOnly={optionsLocked}
                tabIndex={optionsLocked ? -1 : undefined}
                aria-readonly={optionsLocked ? true : undefined}
                onChange={
                  optionsLocked
                    ? undefined
                    : (event) => updateDraft({ options: event.target.value })
                }
                placeholder="Easy, Medium, Hard"
                className={`${adminInputClass}${optionsLocked ? " cursor-default bg-cream/60 text-muted" : ""}`}
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
        <div className="flex flex-wrap items-center gap-3">
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
        <form ref={deleteFormRef} action={deleteFieldAction} className="mt-3 border-t border-line/80 pt-3">
          <input type="hidden" name="id" value={field.id} />
          <input type="hidden" name="typeId" value={typeId} />
          <button
            type="button"
            className={`text-sm font-semibold text-terracotta/90 transition-colors hover:text-terracotta ${adminFocusRing}`}
            onClick={() => {
              if (
                window.confirm(
                  `Remove “${field.label}” from the ${typeName} template?\n\nRemoving this field removes it from the ${typeName} template. Existing recipe values for this field may remain stored but will no longer appear in the template.`,
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
        <p className="mt-3 border-t border-line/80 pt-3 text-xs text-muted">
          Core recipe fields cannot be deleted from a type template.
        </p>
      )}
    </div>
  );
}

function CollapsedFieldRow({
  field,
  typeId,
  total,
  saved,
  reorderDisabled,
  showTechnicalKeys,
  onEdit,
}: {
  field: AdminTypeField;
  typeId: string;
  total: number;
  saved: boolean;
  reorderDisabled?: boolean;
  showTechnicalKeys: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-3">
        <ReorderControls field={field} typeId={typeId} total={total} disabled={reorderDisabled} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5 text-ink">{field.label}</p>
          <FieldSummaryMeta field={field} />
          {showTechnicalKeys ? (
            <p className="mt-0.5 font-mono text-xs text-muted/80">{field.key}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 pl-[2.75rem] sm:pl-[2.25rem] xl:pl-0">
        <AdminSavedStatus show={saved} />
        <button
          type="button"
          onClick={onEdit}
          aria-expanded={false}
          aria-label={`Edit ${field.label}`}
          className={`inline-flex min-h-11 items-center text-sm ${adminLinkClass} ${adminFocusRing} sm:min-h-0`}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function AddFieldPanel({
  typeId,
  typeName,
  existingKeys,
  error,
  onCancel,
}: {
  typeId: string;
  typeName: string;
  existingKeys: Set<string>;
  error?: string;
  onCancel: () => void;
}) {
  const labelId = useId();
  const keyId = useId();
  const keyHelpId = useId();
  const kindId = useId();
  const optionsId = useId();
  const helpId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [kind, setKind] = useState("text");
  const [clientKeyError, setClientKeyError] = useState<string | undefined>();
  const showOptions = fieldKindUsesOptions(kind);

  function onLabelChange(next: string) {
    setLabel(next);
    if (!keyTouched) {
      const generated = keyFromLabel(next);
      setKey(generated);
      validateKey(generated);
    }
  }

  function validateKey(candidate: string) {
    const normalized = keyFromLabel(candidate) || candidate.trim();
    if (!normalized) {
      setClientKeyError(undefined);
      return;
    }
    if (isCoreFieldKey(normalized)) {
      setClientKeyError(
        `“${normalized}” is reserved for Mesa's shared recipe schema and cannot be used for a type-specific field.`,
      );
      return;
    }
    if (existingKeys.has(normalized)) {
      setClientKeyError("That key is already used on this type.");
      return;
    }
    setClientKeyError(undefined);
  }

  const keyError =
    clientKeyError ??
    (error === "duplicate-key"
      ? "That key is already used on this type."
      : error === "invalid-key"
        ? "Key must include letters or numbers."
        : error === "reserved-key"
          ? "That key is reserved for Mesa's shared recipe schema."
          : undefined);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const normalized = keyFromLabel(key) || keyFromLabel(label);
    if (!normalized) {
      event.preventDefault();
      setClientKeyError("Key must include letters or numbers.");
      return;
    }
    if (isCoreFieldKey(normalized)) {
      event.preventDefault();
      setClientKeyError(
        `“${normalized}” is reserved for Mesa's shared recipe schema and cannot be used for a type-specific field.`,
      );
      return;
    }
    if (existingKeys.has(normalized)) {
      event.preventDefault();
      setClientKeyError("That key is already used on this type.");
      return;
    }
    setClientKeyError(undefined);
  }

  return (
    <div className="border-y border-line/80 bg-cream/25 py-4">
      <h3 className="font-serif text-lg text-ink">Add type-specific field</h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        Creates a field only on {typeName}. Core keys such as image, intro, and ingredients cannot
        be reused here.
      </p>
      <form
        ref={formRef}
        action={saveFieldAction}
        onSubmit={handleSubmit}
        className="mt-4 grid gap-4"
      >
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
                const next = event.target.value;
                setKey(next);
                validateKey(next);
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
  fieldError?: "field-type-locked" | "require-confirm" | "shared-schema-locked";
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

function filterCount(fields: AdminTypeField[], filter: FieldFilter) {
  return fields.filter((field) => matchesFilter(field, filter)).length;
}

export function TypeFieldsManager({
  typeId,
  typeName,
  fields,
  typeSpecificCount,
  sharedCount,
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
  const [syncedExpandedId, setSyncedExpandedId] = useState(initialExpandedFieldId);
  if (initialExpandedFieldId !== syncedExpandedId) {
    setSyncedExpandedId(initialExpandedFieldId);
    if (initialExpandedFieldId) setExpandedId(initialExpandedFieldId);
  }
  const [addOpen, setAddOpen] = useState(initialAddOpen);
  const [filter, setFilter] = useState<FieldFilter>("all");
  const [showTechnicalKeys, setShowTechnicalKeys] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const visibleSavedFieldId = useTransientSavedId(savedFieldId, TYPE_FIELD_SAVED_PARAMS);
  const showDeleted = useTransientSavedFlag(deleted, TYPE_FIELD_DELETED_PARAMS);

  const total = fields.length;
  const orderedFields = [...fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleFields = orderedFields.filter((field) => matchesFilter(field, filter));
  const visibleSectionRuns = annotateTypeFieldSectionRuns(visibleFields);
  const reorderDisabled = filter !== "all";
  const existingKeys = new Set(fields.map((field) => field.key));

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
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Defines field availability and sequence for this recipe type.
      </p>
      <p className="mt-1.5 text-xs text-muted">
        {total} {total === 1 ? "field" : "fields"} · {sharedCount} core
        {typeSpecificCount > 0 ? ` · ${typeSpecificCount} type-specific` : null}
      </p>

      <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between">
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
          role="group"
          aria-label="Filter fields"
        >
          {filterOptions.map((option) => {
            const active = filter === option.id;
            const count = filterCount(fields, option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.id)}
                className={`border-b-2 pb-0.5 text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none ${adminFocusRing} ${
                  active
                    ? "border-terracotta text-terracotta"
                    : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {option.label} {count}
              </button>
            );
          })}
        </div>
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
            className={`${adminTertiaryButtonClass} ${adminFocusRing} self-start text-terracotta hover:text-terracotta-dark`}
          >
            Add type-specific field
          </button>
        ) : null}
      </div>

      {reorderDisabled ? (
        <p className="mt-2 text-xs text-muted">Switch to All to reorder fields.</p>
      ) : null}

      <div className="mt-3">
        <button
          type="button"
          aria-pressed={showTechnicalKeys}
          onClick={() => setShowTechnicalKeys((value) => !value)}
          className={`text-xs font-semibold text-muted transition-colors hover:text-ink ${adminFocusRing}`}
        >
          {showTechnicalKeys ? "Hide technical keys" : "Show technical keys"}
        </button>
      </div>

      {listError ? (
        <p className="mt-3 text-sm text-terracotta" role="alert">
          {listError}
        </p>
      ) : null}
      {showDeleted ? (
        <p className="mt-3 text-sm text-olive" role="status" aria-live="polite">
          Field deleted.
        </p>
      ) : null}

      {addOpen ? (
        <div className="mt-4">
          <AddFieldPanel
            typeId={typeId}
            typeName={typeName}
            existingKeys={existingKeys}
            error={addError}
            onCancel={() => setAddOpen(false)}
          />
        </div>
      ) : null}

      <ul className="mt-4 divide-y divide-line/80 border-y border-line/80">
        {visibleSectionRuns.length === 0 ? (
          <li className="py-6 text-sm text-muted">No fields match this filter.</li>
        ) : null}
        {visibleSectionRuns.map(
          ({ field, section, showSectionMarker, isFirstSectionOccurrence }, index) => {
          const expanded = expandedId === field.id;
          const saved = visibleSavedFieldId === field.id;
          const showFieldError = expanded && fieldError && initialExpandedFieldId === field.id;
          return (
            <li key={field.id} id={`field-${field.id}`}>
              {showSectionMarker ? (
                <FieldSectionMarker
                  section={section}
                  isListStart={index === 0}
                  continued={!isFirstSectionOccurrence}
                />
              ) : null}
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
                  saved={saved}
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
                  total={total}
                  saved={saved}
                  reorderDisabled={reorderDisabled}
                  showTechnicalKeys={showTechnicalKeys}
                  onEdit={() => tryExpand(field.id)}
                />
              )}
            </li>
          );
        },
        )}
      </ul>
    </section>
  );
}
