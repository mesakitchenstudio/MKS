import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { FIELD_KINDS } from "@/lib/fields";
import { deleteFieldAction, moveFieldAction, saveFieldAction, saveTypeAction } from "../../actions";

export default async function AdminTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccess("content");
  const { id } = await params;
  const type = await getDb().recipeType.findUnique({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!type) notFound();

  return (
    <div>
      <h1 className="font-serif text-4xl">{type.name}</h1>
      <form action={saveTypeAction} className="mt-6 grid gap-3 border border-line bg-paper p-5 md:grid-cols-3">
        <input type="hidden" name="id" value={type.id} />
        <input name="name" defaultValue={type.name} className="border border-line px-3 py-2" />
        <input name="slug" defaultValue={type.slug} className="border border-line px-3 py-2" />
        <input name="description" defaultValue={type.description} className="border border-line px-3 py-2" />
        <button className="justify-self-start rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream">
          Save type
        </button>
      </form>

      <h2 className="mt-10 font-serif text-2xl">Fields</h2>
      <p className="mt-1 text-sm text-muted">
        These fields appear on every recipe of this type. Reorder to change the public page.
      </p>

      <ul className="mt-4 divide-y divide-line border border-line bg-paper">
        {type.fields.map((field) => (
          <li key={field.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto]">
            <form action={saveFieldAction} className="grid gap-2 md:grid-cols-2">
              <input type="hidden" name="id" value={field.id} />
              <input type="hidden" name="typeId" value={type.id} />
              <input name="label" defaultValue={field.label} className="border border-line px-3 py-2" />
              <input name="key" defaultValue={field.key} className="border border-line px-3 py-2" />
              <select name="kind" defaultValue={field.kind} className="border border-line px-3 py-2">
                {FIELD_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
              <input
                name="options"
                defaultValue={(JSON.parse(field.options || "[]") as string[]).join(", ")}
                placeholder="Select options, comma separated"
                className="border border-line px-3 py-2"
              />
              <input
                name="helpText"
                defaultValue={field.helpText}
                placeholder="Help text"
                className="border border-line px-3 py-2 md:col-span-2"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="required" defaultChecked={field.required} />
                Required
              </label>
              <button className="justify-self-start text-sm font-semibold text-terracotta">Save field</button>
            </form>
            <div className="flex gap-2 self-start">
              <form action={moveFieldAction}>
                <input type="hidden" name="id" value={field.id} />
                <input type="hidden" name="typeId" value={type.id} />
                <input type="hidden" name="direction" value="up" />
                <button className="border border-line px-2 py-1 text-sm">Up</button>
              </form>
              <form action={moveFieldAction}>
                <input type="hidden" name="id" value={field.id} />
                <input type="hidden" name="typeId" value={type.id} />
                <input type="hidden" name="direction" value="down" />
                <button className="border border-line px-2 py-1 text-sm">Down</button>
              </form>
              <form action={deleteFieldAction}>
                <input type="hidden" name="id" value={field.id} />
                <input type="hidden" name="typeId" value={type.id} />
                <button className="border border-line px-2 py-1 text-sm text-terracotta">Delete</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <form action={saveFieldAction} className="mt-6 grid gap-3 border border-dashed border-line bg-paper p-5 md:grid-cols-2">
        <input type="hidden" name="typeId" value={type.id} />
        <input name="label" placeholder="New field label" required className="border border-line px-3 py-2" />
        <input name="key" placeholder="key (optional)" className="border border-line px-3 py-2" />
        <select name="kind" className="border border-line px-3 py-2">
          {FIELD_KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </select>
        <input name="options" placeholder="Select options, comma separated" className="border border-line px-3 py-2" />
        <input name="helpText" placeholder="Help text" className="border border-line px-3 py-2 md:col-span-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="required" />
          Required
        </label>
        <button className="justify-self-start rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-paper">
          Add field
        </button>
      </form>
    </div>
  );
}
