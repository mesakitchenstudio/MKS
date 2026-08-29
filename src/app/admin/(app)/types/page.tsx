import Link from "next/link";
import { AddTypeForm } from "@/components/admin/AddTypeForm";
import { DeleteTypeButton } from "@/components/admin/DeleteTypeButton";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { CORE_FIELDS } from "@/lib/fields";

const coreFieldKeys = new Set(CORE_FIELDS.map((field) => field.key));

function formatFieldMetadata(fieldKeys: string[], recipeCount: number) {
  const total = fieldKeys.length;
  const typeSpecific = fieldKeys.filter((key) => !coreFieldKeys.has(key)).length;
  const recipeLabel = `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"}`;

  if (typeSpecific > 0) {
    return `${total} fields (${typeSpecific} type-specific) · ${recipeLabel}`;
  }

  return `${total} ${total === 1 ? "field" : "fields"} · ${recipeLabel}`;
}

export default async function AdminTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; name?: string; slug?: string; description?: string }>;
}) {
  await requireAccess("content");
  const params = await searchParams;
  const { error, name, slug, description } = params;
  const types = await getDb().recipeType.findMany({
    include: {
      fields: { select: { key: true } },
      _count: { select: { recipes: true } },
    },
    orderBy: { name: "asc" },
  });

  const sharedFieldCount = CORE_FIELDS.length;

  return (
    <div>
      <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Recipe types
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        A recipe type is the form template for new recipes — Cake, Drink, Condiment. Configure
        which fields appear when authoring that type.
      </p>
      <p className="mt-2 max-w-2xl text-xs text-muted">
        New types start with {sharedFieldCount} shared recipe fields. Type-specific fields can be
        added when editing a type.
      </p>

      {error === "inuse" ? (
        <p className="mt-4 text-sm text-terracotta" role="alert">
          That type still has recipes attached. Reassign or delete those recipes before removing the
          type.
        </p>
      ) : null}

      <AddTypeForm
        error={error}
        initialName={name ?? ""}
        initialSlug={slug ?? ""}
        initialDescription={description ?? ""}
      />

      <ul className="mt-8 divide-y divide-line border border-line bg-paper">
        {types.map((type) => (
          <li
            key={type.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 transition-colors duration-150 hover:bg-cream/50"
          >
            <div className="min-w-0">
              <Link
                href={`/admin/types/${type.id}`}
                className={`font-semibold text-ink transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
              >
                {type.name}
              </Link>
              <p className="mt-0.5 text-sm text-muted">
                {formatFieldMetadata(
                  type.fields.map((field) => field.key),
                  type._count.recipes,
                )}
              </p>
            </div>
            <div className="flex items-center justify-end gap-4">
              <Link
                href={`/admin/types/${type.id}`}
                className={`text-sm ${adminLinkClass} ${adminFocusRing}`}
              >
                Edit
              </Link>
              {type._count.recipes === 0 ? (
                <DeleteTypeButton id={type.id} name={type.name} recipeCount={0} />
              ) : null}
            </div>
          </li>
        ))}
        {types.length === 0 ? (
          <li className="px-4 py-8 text-sm text-muted">No recipe types yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
