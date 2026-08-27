"use client";

import { useEffect, useState } from "react";
import { saveTypeAction } from "@/app/admin/actions";
import {
  adminFocusRing,
  adminInputClass,
  adminPrimaryButtonClass,
} from "@/lib/admin-ui";

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

  useEffect(() => {
    setValues({ name, slug, description });
  }, [description, name, slug]);

  const dirty =
    values.name.trim() !== name.trim() ||
    values.slug.trim() !== slug.trim() ||
    values.description.trim() !== description.trim();

  return (
    <section className="mt-8 border border-line bg-paper p-5 md:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive">
          Type details
        </h2>
        {saved ? <span className="text-sm text-olive">Saved.</span> : null}
      </div>
      {error === "duplicate-slug" ? (
        <p className="mt-2 text-sm text-terracotta" role="alert">
          That slug is already used by another type.
        </p>
      ) : null}
      <form
        action={saveTypeAction}
        className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]"
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
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
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
        <div className="flex min-w-0 flex-col">
          <span className="min-h-[1.25rem] text-sm font-semibold leading-5 opacity-0" aria-hidden>
            Action
          </span>
          <div className="mt-1.5">
            <button
              type="submit"
              disabled={!dirty}
              className={`${adminPrimaryButtonClass} ${adminFocusRing}`}
            >
              Save type
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
