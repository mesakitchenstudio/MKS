"use client";

import { useEffect, useId, useState } from "react";
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
  const describedBy = [helperId, error ? errorId : undefined].filter(Boolean).join(" ") || undefined;

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

  useEffect(() => {
    setName(initialName);
    setSlug(initialSlug);
    setDescription(initialDescription);
    setSlugTouched(Boolean(initialSlug));
  }, [initialDescription, initialName, initialSlug]);

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
    <section className="mt-8 border border-line bg-paper p-5 md:p-6">
      <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">Add type</h2>
      <form
        action={saveTypeAction}
        className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
      >
        <FieldColumn
          label="Name"
          htmlFor={nameId}
          required
          error={nameError}
          errorId={nameErrorId}
        >
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

        <div className="flex min-w-0 flex-col">
          <span className="min-h-[1.25rem] text-sm font-semibold leading-5 opacity-0" aria-hidden>
            Action
          </span>
          <div className="mt-1.5">
            <button type="submit" className={`${adminPrimaryButtonClass} ${adminFocusRing}`}>
              Add type
            </button>
          </div>
          <p className={helperRowClass} aria-hidden>
            {"\u00A0"}
          </p>
        </div>
      </form>
    </section>
  );
}
