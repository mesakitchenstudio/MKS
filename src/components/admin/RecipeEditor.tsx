"use client";

import { useMemo, useState } from "react";
import { emptyValue, RECIPE_MEDIA_KEYS, RECIPE_OVERVIEW_KEYS } from "@/lib/fields";
import { saveRecipeAction } from "@/app/admin/actions";

type Field = {
  key: string;
  label: string;
  helpText: string;
  kind: string;
  required: boolean;
  options: string[];
};

type CategoryOption = { id: string; name: string };

export function RecipeEditor({
  recipeId,
  typeId,
  initial,
  fields,
  categories,
}: {
  recipeId?: string;
  typeId: string;
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
}) {
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [status, setStatus] = useState(initial.status);
  const [featured, setFeatured] = useState(initial.featured);
  const [seasonal, setSeasonal] = useState(initial.seasonal);
  const [categoryIds, setCategoryIds] = useState(initial.categoryIds);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const next: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.key === "bakeMinutes") {
        next[field.key] =
          initial.values.bakeMinutes ?? initial.values.cookMinutes ?? emptyValue(field.kind);
      } else if (field.key === "difficulty") {
        next[field.key] = initial.values.difficulty || "Easy";
      } else {
        next[field.key] = initial.values[field.key] ?? emptyValue(field.kind);
      }
    }
    return next;
  });

  const mediaKeys = new Set<string>(RECIPE_MEDIA_KEYS);
  mediaKeys.add("image");
  mediaKeys.add("imageAlt");
  const overviewKeys = new Set<string>(RECIPE_OVERVIEW_KEYS);
  const mediaFields = fields.filter((field) => mediaKeys.has(field.key));
  const overviewFields = fields.filter((field) => overviewKeys.has(field.key));
  const extraFields = fields.filter(
    (field) => !mediaKeys.has(field.key) && !overviewKeys.has(field.key) && field.key !== "cookMinutes",
  );

  const encoded = useMemo(() => {
    const out: Record<string, string> = {};
    for (const field of fields) {
      out[field.key] = JSON.stringify(values[field.key] ?? emptyValue(field.kind));
    }
    return out;
  }, [fields, values]);

  function setField(key: string, value: unknown) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <form action={saveRecipeAction} className="grid gap-6">
      <input type="hidden" name="id" value={recipeId || ""} />
      <input type="hidden" name="typeId" value={typeId} />
      {fields.map((field) => (
        <input key={field.key} type="hidden" name={`field:${field.key}`} value={encoded[field.key]} />
      ))}
      {categoryIds.map((id) => (
        <input key={id} type="hidden" name="categoryIds" value={id} />
      ))}

      <div className="grid gap-4 border border-line bg-paper p-5 md:grid-cols-2">
        <label className="grid gap-1 text-sm md:col-span-2">
          Title
          <input
            name="title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="border border-line px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Slug
          <input
            name="slug"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            className="border border-line px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="border border-line px-3 py-2"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          Excerpt
          <textarea
            name="excerpt"
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            rows={3}
            className="border border-line px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="featured"
            checked={featured}
            onChange={(event) => setFeatured(event.target.checked)}
          />
          Featured
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="seasonal"
            checked={seasonal}
            onChange={(event) => setSeasonal(event.target.checked)}
          />
          Seasonal
        </label>
        <div className="md:col-span-2">
          <p className="mb-2 text-sm font-semibold">Categories</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <label key={category.id} className="flex items-center gap-2 border border-line px-3 py-1.5 text-sm">
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

      <div className="grid gap-5">
        {mediaFields.length ? (
          <section className="grid gap-5 border border-line bg-paper p-5">
            <div>
              <p className="font-semibold">Photos and video</p>
              <p className="mt-1 text-xs text-muted">
                Hero image, main walkthrough video, and an optional floating picture-in-picture video.
              </p>
            </div>
            {mediaFields.map((field) => (
              <FieldControl
                key={field.key}
                field={field}
                value={values[field.key]}
                onChange={(value) => setField(field.key, value)}
              />
            ))}
          </section>
        ) : null}
        {overviewFields.length ? (
          <section className="grid gap-5 border border-line bg-paper p-5">
            <div>
              <p className="font-semibold">Kitchen details</p>
              <p className="mt-1 text-xs text-muted">
                Difficulty, times, and utensils appear on every public recipe card.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {overviewFields.map((field) => (
                <div key={field.key} className={field.key === "utensils" ? "md:col-span-2" : ""}>
                  <p className="text-sm font-semibold">
                    {field.label}
                    {field.required ? <span className="text-terracotta"> *</span> : null}
                  </p>
                  {field.helpText ? <p className="mt-1 text-xs text-muted">{field.helpText}</p> : null}
                  <div className="mt-2">
                    <KindInput
                      kind={field.kind}
                      options={field.options}
                      value={values[field.key]}
                      onChange={(value) => setField(field.key, value)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {extraFields.map((field) => (
          <FieldControl
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value) => setField(field.key, value)}
          />
        ))}
      </div>

      <button
        type="submit"
        className="justify-self-start rounded-full bg-terracotta px-6 py-2.5 text-sm font-semibold text-paper"
      >
        Save recipe
      </button>
    </form>
  );
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="border border-line bg-paper p-5">
      <p className="font-semibold">
        {field.label}
        {field.required ? <span className="text-terracotta"> *</span> : null}
      </p>
      {field.helpText ? <p className="mt-1 text-xs text-muted">{field.helpText}</p> : null}
      <div className="mt-3">
        <KindInput kind={field.kind} options={field.options} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

function KindInput({
  kind,
  options,
  value,
  onChange,
}: {
  kind: string;
  options: string[];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (kind === "textarea") {
    return (
      <textarea
        rows={5}
        value={String(value || "")}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-line px-3 py-2"
      />
    );
  }
  if (kind === "number") {
    return (
      <input
        type="number"
        value={Number(value || 0)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full border border-line px-3 py-2"
      />
    );
  }
  if (kind === "minutes") {
    return <MinutesInput value={Number(value || 0)} onChange={onChange} />;
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
        className="w-full border border-line px-3 py-2"
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
    return <ImageField value={String(value || "")} onChange={onChange} />;
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
              className="w-full border border-line px-3 py-2"
            />
            <button type="button" className="text-sm" onClick={() => onChange(urls.filter((_, i) => i !== index))}>
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
      />
    );
  }
  if (kind === "namedNotes") {
    const items = Array.isArray(value) ? (value as { name?: string; note?: string }[]) : [];
    return (
      <div className="grid gap-3">
        {items.map((item, index) => (
          <div key={index} className="grid gap-2 border border-line p-3 md:grid-cols-2">
            <input
              value={item.name || ""}
              placeholder="Name / question"
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, name: event.target.value };
                onChange(next);
              }}
              className="border border-line px-3 py-2"
            />
            <textarea
              value={item.note || ""}
              placeholder="Note / answer"
              onChange={(event) => {
                const next = [...items];
                next[index] = { ...item, note: event.target.value };
                onChange(next);
              }}
              className="border border-line px-3 py-2"
            />
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-semibold text-terracotta"
          onClick={() => onChange([...items, { name: "", note: "" }])}
        >
          Add note
        </button>
      </div>
    );
  }
  if (kind === "ingredients") {
    const groups = Array.isArray(value) ? (value as { name?: string; items: { item: string; amount: string; notes?: string }[] }[]) : [];
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
              className="border border-line px-3 py-2"
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
      className="w-full border border-line px-3 py-2"
    />
  );
}

function MinutesInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const hours = Math.floor(Math.max(0, value) / 60);
  const minutes = Math.max(0, value) % 60;
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="grid gap-1 text-sm">
        Hours
        <input
          type="number"
          min={0}
          value={hours}
          onChange={(event) => onChange(Number(event.target.value) * 60 + minutes)}
          className="w-full border border-line px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Minutes
        <input
          type="number"
          min={0}
          value={minutes}
          onChange={(event) => onChange(hours * 60 + Number(event.target.value))}
          className="w-full border border-line px-3 py-2"
        />
      </label>
    </div>
  );
}

function ListEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
}) {
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
            className="w-full border border-line px-3 py-2"
          />
          <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-semibold text-terracotta"
        onClick={() => onChange([...items, ""])}
      >
        Add item
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
    <div className="grid gap-4">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="grid gap-2 border border-line p-3">
          <input
            value={group.name || ""}
            placeholder="Group name (optional)"
            onChange={(event) => {
              const next = [...groups];
              next[groupIndex] = { ...group, name: event.target.value };
              update(next);
            }}
            className="border border-line px-3 py-2"
          />
          {group.items.map((item, itemIndex) => (
            <div key={itemIndex} className="grid gap-2 md:grid-cols-3">
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
                className="border border-line px-3 py-2"
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
                className="border border-line px-3 py-2"
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
                className="border border-line px-3 py-2"
              />
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-terracotta"
            onClick={() => {
              const next = [...groups];
              next[groupIndex] = {
                ...group,
                items: [...group.items, { item: "", amount: "", notes: "" }],
              };
              update(next);
            }}
          >
            Add ingredient
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-semibold text-terracotta"
        onClick={() => update([...groups, { name: "", items: [{ item: "", amount: "", notes: "" }] }])}
      >
        Add group
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
  return (
    <div className="grid gap-4">
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} className="grid gap-2 border border-line p-3">
          <input
            value={group.name || ""}
            placeholder="Section name (optional)"
            onChange={(event) => {
              const next = [...groups];
              next[groupIndex] = { ...group, name: event.target.value };
              onChange(next);
            }}
            className="border border-line px-3 py-2"
          />
          {group.steps.map((step, stepIndex) => (
            <textarea
              key={stepIndex}
              value={step}
              rows={2}
              onChange={(event) => {
                const next = [...groups];
                const steps = [...group.steps];
                steps[stepIndex] = event.target.value;
                next[groupIndex] = { ...group, steps };
                onChange(next);
              }}
              className="border border-line px-3 py-2"
            />
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-terracotta"
            onClick={() => {
              const next = [...groups];
              next[groupIndex] = { ...group, steps: [...group.steps, ""] };
              onChange(next);
            }}
          >
            Add step
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-sm font-semibold text-terracotta"
        onClick={() => onChange([...groups, { name: "", steps: [""] }])}
      >
        Add section
      </button>
    </div>
  );
}

function ImageField({
  value,
  onChange,
  buttonLabel = "Upload image",
}: {
  value: string;
  onChange: (value: string) => void;
  buttonLabel?: string;
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
    <div className="grid gap-2">
      <input
        value={value}
        placeholder="https://…"
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-line px-3 py-2"
      />
      <label className="cursor-pointer text-sm font-semibold text-terracotta">
        {busy ? "Uploading…" : buttonLabel}
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
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="max-h-40 object-cover" />
      ) : null}
    </div>
  );
}
