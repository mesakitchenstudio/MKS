import Link from "next/link";
import { notFound } from "next/navigation";
import { TypeDetailsForm } from "@/components/admin/TypeDetailsForm";
import { TypeFieldsManager } from "@/components/admin/TypeFieldsManager";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { type AdminTypeField, countRecipesMissingFieldContent, countRecipesWithFieldContent } from "@/lib/field-admin";
import { adminFocusRing } from "@/lib/admin-ui";
import { CORE_FIELDS } from "@/lib/fields";
import { ensureRecipeOverviewFields } from "@/lib/recipe-overview";

const coreFieldKeys = new Set(CORE_FIELDS.map((field) => field.key));

const listErrorMessages: Record<string, string> = {
  "protected-field": "Shared fields cannot be deleted.",
  "missing-label": "Field label is required.",
  "field-type-locked":
    "Field type cannot change while recipes already store data for this field.",
  "require-confirm":
    "Confirm the required change — some existing recipes do not yet have a value for this field.",
};

export default async function AdminTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    fieldId?: string;
    focus?: string;
    deleted?: string;
    error?: string;
    add?: string;
  }>;
}) {
  await requireAccess("content");
  await ensureRecipeOverviewFields();
  const { id } = await params;
  const query = await searchParams;
  const type = await getDb().recipeType.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      _count: { select: { recipes: true } },
      recipes: { select: { values: true } },
    },
  });
  if (!type) notFound();

  const typeSpecificCount = type.fields.filter((field) => !coreFieldKeys.has(field.key)).length;
  const sharedCount = type.fields.length - typeSpecificCount;

  const fieldUsageByKey = Object.fromEntries(
    type.fields.map((field) => [
      field.key,
      countRecipesWithFieldContent(type.recipes, field.key, field.kind),
    ]),
  ) as Record<string, number>;

  const fieldMissingByKey = Object.fromEntries(
    type.fields.map((field) => [
      field.key,
      countRecipesMissingFieldContent(type.recipes, field.key, field.kind),
    ]),
  ) as Record<string, number>;

  const adminFields: AdminTypeField[] = type.fields.map((field, globalIndex) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    helpText: field.helpText,
    kind: field.kind,
    required: field.required,
    options: JSON.parse(field.options || "[]") as string[],
    sortOrder: field.sortOrder,
    isShared: coreFieldKeys.has(field.key),
    globalIndex,
  }));

  const savedFieldId = query.saved === "field" && query.fieldId ? query.fieldId : null;
  const errorFieldId = query.fieldId ?? null;
  const addError =
    query.error === "duplicate-key" || query.error === "invalid-key" ? query.error : undefined;
  const listError =
    query.error &&
    query.error !== "duplicate-key" &&
    query.error !== "invalid-key" &&
    query.error !== "duplicate-slug"
      ? listErrorMessages[query.error] ?? undefined
      : undefined;
  const expandFieldId =
    errorFieldId &&
    (query.error === "field-type-locked" || query.error === "require-confirm")
      ? errorFieldId
      : savedFieldId;

  return (
    <div>
      <Link
        href="/admin/types"
        className={`text-sm font-semibold text-muted transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
      >
        ← Recipe types
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
          {type.name}
        </h1>
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-olive/90">
          Type template
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-muted">
        {type._count.recipes} {type._count.recipes === 1 ? "recipe uses" : "recipes use"} this type.{" "}
        {type.fields.length} fields total
        {typeSpecificCount > 0
          ? ` (${typeSpecificCount} type-specific, ${sharedCount} shared)`
          : " (all shared recipe fields)"}
        .
      </p>

      <TypeDetailsForm
        id={type.id}
        name={type.name}
        slug={type.slug}
        description={type.description}
        saved={query.saved === "type"}
        error={query.error}
      />

      <TypeFieldsManager
        typeId={type.id}
        typeName={type.name}
        fields={adminFields}
        typeSpecificCount={typeSpecificCount}
        sharedCount={sharedCount}
        recipeCount={type._count.recipes}
        fieldUsageByKey={fieldUsageByKey}
        fieldMissingByKey={fieldMissingByKey}
        savedFieldId={savedFieldId}
        focusFieldId={query.focus ?? null}
        initialExpandedFieldId={expandFieldId}
        initialAddOpen={query.add === "1"}
        addError={addError}
        listError={listError}
        fieldError={query.error === "field-type-locked" || query.error === "require-confirm" ? query.error : undefined}
        deleted={query.deleted === "field"}
      />
    </div>
  );
}
