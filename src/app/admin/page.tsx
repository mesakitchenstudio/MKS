import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function AdminHomePage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const db = getDb();
  const [recipes, types] = await Promise.all([
    db.recipe.findMany({
      include: { type: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.recipeType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl">Recipes</h1>
          <p className="mt-2 text-sm text-muted">Drafts stay off the public site until you publish.</p>
        </div>
        <form action="/admin/recipes/new" method="get" className="flex gap-2">
          <select name="type" required className="border border-line bg-paper px-3 py-2 text-sm">
            <option value="">Choose a type…</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
          <button className="rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper">
            New recipe
          </button>
        </form>
      </div>

      <div className="mt-8 overflow-x-auto border border-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="bg-sand/50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((recipe) => (
              <tr key={recipe.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/admin/recipes/${recipe.id}`} className="font-semibold hover:text-terracotta">
                    {recipe.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{recipe.type.name}</td>
                <td className="px-4 py-3 capitalize">{recipe.status}</td>
                <td className="px-4 py-3 text-muted">
                  {recipe.updatedAt.toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
            {recipes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-muted">
                  No recipes yet. Create a type, then add a recipe.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
