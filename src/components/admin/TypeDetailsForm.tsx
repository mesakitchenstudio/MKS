"use client";

import { useState } from "react";
import { saveTypeAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";
import {
  AdminSavedStatus,
  TYPE_DETAILS_SAVED_PARAMS,
  useTransientSavedFlag,
} from "@/lib/admin-transient-feedback";

export function TypeDetailsForm({
  id,
  name,
  slug,
  description,
  saved,
  error,
}: {
  id: string;
  name: string;
  slug: string;
  description: string;
  saved?: boolean;
  error?: string;
}) {
  const [values, setValues] = useState({ name, slug, description });
  const [synced, setSynced] = useState({ name, slug, description });
  if (name !== synced.name || slug !== synced.slug || description !== synced.description) {
    setSynced({ name, slug, description });
    setValues({ name, slug, description });
  }
  const showSaved = useTransientSavedFlag(saved, TYPE_DETAILS_SAVED_PARAMS);

  const dirty =
    values.name.trim() !== name.trim() ||
    values.slug.trim() !== slug.trim() ||
    values.description.trim() !== description.trim();

  return (
    <section className="mt-8 border-y border-line/80 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
          Details
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <AdminSavedStatus show={showSaved} />
          <button
            type="submit"
            form="type-details-form"
            disabled={!dirty}
            className={`${adminPrimaryButtonClass} ${adminFocusRing} !h-9 !px-3.5`}
          >
            Save type
          </button>
        </div>
      </div>
      {error === "duplicate-slug" ? (
        <p className="mt-2 text-sm text-terracotta" role="alert">
          That slug is already used by another type.
        </p>
      ) : null}
      <form
        id="type-details-form"
        action={saveTypeAction}
        className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]"
      >
        <input type="hidden" name="id" value={id} />
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
          Name
          <input
            name="name"
            required
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            className={adminInputClass}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
          Slug
          <input
            name="slug"
            value={values.slug}
            onChange={(event) => setValues((current) => ({ ...current, slug: event.target.value }))}
            className={adminInputClass}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink sm:col-span-2 xl:col-span-1">
          Description
          <input
            name="description"
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({ ...current, description: event.target.value }))
            }
            className={adminInputClass}
          />
        </label>
      </form>
    </section>
  );
}
