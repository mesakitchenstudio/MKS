"use client";

import { useId, useState } from "react";
import { saveTypeAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";
import { slugify } from "@/lib/fields";

const helperRowClass = "mt-1.5 min-h-[2rem] text-xs leading-4 text-muted";

function FieldColumn({
  label,
  htmlFor,
  required,
  helper,
  helperId,
  error,
  errorId,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: string;
  helperId?: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <label htmlFor={htmlFor} className="min-h-[1.25rem] text-sm font-semibold leading-5 text-ink">
        {label}
        {required ? <span className="text-terracotta"> *</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={errorId} className={`${helperRowClass} font-semibold text-terracotta`} role="alert">
          {error}
        </p>
      ) : (
        <p id={helperId} className={helperRowClass}>
          {helper || "\u00A0"}
        </p>
      )}
    </div>
  );
}

function CreationFormFields({
  error,
  initialName = "",
  initialSlug = "",
  initialDescription = "",
}: {
  error?: string;
  initialName?: string;
  initialSlug?: string;
  initialDescription?: string;
}) {
  const nameId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const slugHelpId = useId();
  const nameErrorId = useId();
  const slugErrorId = useId();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [description, setDescription] = useState(initialDescription);
  const [slugTouched, setSlugTouched] = useState(Boolean(initialSlug));
  const [syncedInitials, setSyncedInitials] = useState({
    name: initialName,
    slug: initialSlug,
    description: initialDescription,
  });
  if (
    initialName !== syncedInitials.name ||
    initialSlug !== syncedInitials.slug ||
    initialDescription !== syncedInitials.description
  ) {
    setSyncedInitials({ name: initialName, slug: initialSlug, description: initialDescription });
    setName(initialName);
    setSlug(initialSlug);
    setDescription(initialDescription);
    setSlugTouched(Boolean(initialSlug));
  }

  const nameError =
    error === "missing" && !name.trim() ? "Name is required to create a type." : undefined;
  const slugError =
    error === "duplicate"
      ? "That slug is already used by another type."
      : error === "missing" && name.trim() && !slugify(slug || name)
        ? "Slug must include letters or numbers."
        : undefined;

  function onNameChange(next: string) {
    setName(next);
    if (!slugTouched) setSlug(slugify(next));
  }

  return (
    <form
      action={saveTypeAction}
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
    >
      <FieldColumn label="Name" htmlFor={nameId} required error={nameError} errorId={nameErrorId}>
        <input
          id={nameId}
          name="name"
          required
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. Cake"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? nameErrorId : undefined}
          className={adminInputClass}
        />
      </FieldColumn>

      <FieldColumn
        label="Slug"
        htmlFor={slugId}
        helper={slugError ? undefined : "Optional — generated from name"}
        helperId={slugHelpId}
        error={slugError}
        errorId={slugErrorId}
      >
        <input
          id={slugId}
          name="slug"
          value={slug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          placeholder="e.g. cake"
          aria-invalid={slugError ? true : undefined}
          aria-describedby={slugError ? slugErrorId : slugHelpId}
          className={adminInputClass}
        />
      </FieldColumn>

      <FieldColumn label="Description" htmlFor={descriptionId}>
        <input
          id={descriptionId}
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="e.g. Loaves, layers, and cupcakes"
          className={adminInputClass}
        />
      </FieldColumn>

      <div className="flex min-w-0 flex-col sm:col-span-2 xl:col-span-1">
        <span className="hidden min-h-[1.25rem] text-sm font-semibold leading-5 opacity-0 xl:block" aria-hidden>
          Action
        </span>
        <div className="mt-1.5">
          <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
            Add type
          </button>
        </div>
        <p className={`${helperRowClass} hidden xl:block`} aria-hidden>
          {"\u00A0"}
        </p>
      </div>
    </form>
  );
}

export function AddTypeForm({
  error,
  initialName = "",
  initialSlug = "",
  initialDescription = "",
}: {
  error?: string;
  initialName?: string;
  initialSlug?: string;
  initialDescription?: string;
}) {
  const panelId = useId();
  const shouldForceOpen = Boolean(
    error === "missing" || error === "duplicate" || initialName || initialSlug || initialDescription,
  );
  const [open, setOpen] = useState(shouldForceOpen);
  const [wasForcedOpen, setWasForcedOpen] = useState(shouldForceOpen);
  if (shouldForceOpen !== wasForcedOpen) {
    setWasForcedOpen(shouldForceOpen);
    if (shouldForceOpen) setOpen(true);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 max-w-2xl">
          <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
            Recipe types
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Templates define which fields are available when authoring each kind of recipe.
          </p>
          <p className="mt-1.5 text-xs leading-5 text-muted">
            New types begin with Mesa&apos;s core recipe fields and can add type-specific fields.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`${adminPrimaryButtonClass} ${adminFocusRing} shrink-0 self-start`}
        >
          {open ? "Close" : "New recipe type"}
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          className="mt-5 border-y border-line/80 bg-cream/25 py-5"
        >
          <h2 className="font-serif text-xl text-ink">New recipe type</h2>
          <p className="mt-1 text-sm text-muted">
            Starts with Mesa&apos;s core recipe fields. Add type-specific fields after saving.
          </p>
          <div className="mt-4">
            <CreationFormFields
              error={error}
              initialName={initialName}
              initialSlug={initialSlug}
              initialDescription={initialDescription}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
