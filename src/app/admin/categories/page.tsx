import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

const groups = ["desserts", "course", "method", "holiday"];

export default async function AdminCategoriesPage() {
  await requireAccess("content");
  const categories = await getDb().category.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      <h1 className="font-serif text-4xl">Categories</h1>
      <p className="mt-2 text-sm text-muted">These power the public menus and recipe filters.</p>

      <form action={saveCategoryAction} className="mt-8 grid gap-3 border border-line bg-paper p-5 md:grid-cols-2">
        <input name="name" placeholder="Name" required className="border border-line px-3 py-2" />
        <input name="slug" placeholder="slug (optional)" className="border border-line px-3 py-2" />
        <select name="group" className="border border-line px-3 py-2">
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
        <input name="description" placeholder="Description" className="border border-line px-3 py-2" />
        <button className="justify-self-start rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper">
          Add category
        </button>
      </form>

      <ul className="mt-8 divide-y divide-line border border-line bg-paper">
        {categories.map((category) => (
          <li key={category.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto]">
            <form action={saveCategoryAction} className="grid gap-2 md:grid-cols-2">
              <input type="hidden" name="id" value={category.id} />
              <input name="name" defaultValue={category.name} className="border border-line px-3 py-2" />
              <input name="slug" defaultValue={category.slug} className="border border-line px-3 py-2" />
              <select name="group" defaultValue={category.group} className="border border-line px-3 py-2">
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
              <input
                name="description"
                defaultValue={category.description}
                className="border border-line px-3 py-2"
              />
              <button className="justify-self-start text-sm font-semibold text-terracotta">Save</button>
            </form>
            <form action={deleteCategoryAction}>
              <input type="hidden" name="id" value={category.id} />
              <button className="text-sm text-muted hover:text-terracotta">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
