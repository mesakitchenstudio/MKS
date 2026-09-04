import Link from "next/link";
import { AddTypeForm } from "@/components/admin/AddTypeForm";
import { DeleteTypeButton } from "@/components/admin/DeleteTypeButton";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { CORE_FIELDS } from "@/lib/fields";

const coreFieldKeys = new Set(CORE_FIELDS.map((field) => field.key));

function formatTypeLedgerMeta(fieldKeys: string[], recipeCount: number) {
  const total = fieldKeys.length;
  const typeSpecific = fieldKeys.filter((key) => !coreFieldKeys.has(key)).length;
  const fieldLabel = `${total} ${total === 1 ? "field" : "fields"}`;
  const recipeLabel = `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"}`;

  if (typeSpecific > 0) {
    return `${fieldLabel} · ${typeSpecific} type-specific · ${recipeLabel}`;
  }

  return `${fieldLabel} · ${recipeLabel}`;
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

  const createError = error === "missing" || error === "duplicate" ? error : undefined;

  return (
    <div className="min-w-0">
      <AddTypeForm
        error={createError}
        initialName={name ?? ""}
        initialSlug={slug ?? ""}
        initialDescription={description ?? ""}
      />

      {error === "inuse" ? (
        <p className="mt-4 text-sm text-terracotta" role="alert">
          That type still has recipes attached. Reassign or delete those recipes before removing the
          type.
        </p>
      ) : null}

      <ul className="mt-8 divide-y divide-line/80 border-y border-line/80">
        {types.map((type) => (
          <li
            key={type.id}
            className="flex flex-col gap-3 py-3.5 transition-colors duration-150 hover:bg-cream/40 xl:flex-row xl:items-center xl:justify-between xl:gap-6"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/types/${type.id}`}
                className={`font-semibold text-ink transition-colors duration-150 hover:text-terracotta ${adminFocusRing}`}
              >
                {type.name}
              </Link>
              <p className="mt-0.5 text-sm text-muted">
                {formatTypeLedgerMeta(
                  type.fields.map((field) => field.key),
                  type._count.recipes,
                )}
              </p>
            </div>
            <div
              className="grid shrink-0 grid-cols-[auto_2.75rem] items-center gap-x-1 sm:gap-x-2"
              data-mesa-type-row-actions="edit-overflow"
            >
              <Link
                href={`/admin/types/${type.id}`}
                aria-label={`Edit ${type.name}`}
                className={`inline-flex min-h-11 items-center justify-self-start text-sm ${adminLinkClass} ${adminFocusRing} sm:min-h-0`}
              >
                Edit
              </Link>
              <div className="flex items-center justify-center">
                <DeleteTypeButton
                  id={type.id}
                  name={type.name}
                  recipeCount={type._count.recipes}
                />
              </div>
            </div>
          </li>
        ))}
        {types.length === 0 ? (
          <li className="py-8 text-sm text-muted">No recipe types yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
