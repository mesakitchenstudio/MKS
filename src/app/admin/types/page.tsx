import Link from "next/link";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deleteTypeAction, saveTypeAction } from "../actions";

export default async function AdminTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAccess("content");
  const { error } = await searchParams;
  const types = await getDb().recipeType.findMany({
    include: { _count: { select: { fields: true, recipes: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="font-serif text-4xl">Recipe types</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        A type is the form template — Cake, Drink, Condiment. Add or remove fields without
        changing code.
      </p>
      {error === "inuse" ? (
        <p className="mt-4 text-sm text-terracotta">Delete or reassign recipes before removing a type.</p>
      ) : null}

      <form action={saveTypeAction} className="mt-8 grid gap-3 border border-line bg-paper p-5 md:grid-cols-4">
        <input name="name" placeholder="Name" required className="border border-line px-3 py-2" />
        <input name="slug" placeholder="slug (optional)" className="border border-line px-3 py-2" />
        <input name="description" placeholder="Description" className="border border-line px-3 py-2 md:col-span-1" />
        <button className="rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper">
          Add type
        </button>
      </form>

      <ul className="mt-8 divide-y divide-line border border-line bg-paper">
        {types.map((type) => (
          <li key={type.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <Link href={`/admin/types/${type.id}`} className="font-semibold hover:text-terracotta">
                {type.name}
              </Link>
              <p className="text-sm text-muted">
                {type._count.fields} fields · {type._count.recipes} recipes
              </p>
            </div>
            <form action={deleteTypeAction}>
              <input type="hidden" name="id" value={type.id} />
              <button className="text-sm text-muted hover:text-terracotta">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
