import Link from "next/link";
import { AdminPhotoField } from "@/components/admin/AdminPhotoField";
import { accessLabel } from "@/lib/admin-access";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { redirect } from "next/navigation";
import { saveOwnAdminProfileAction } from "../actions";

export default async function AdminProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const actor = await getAdminSession();
  if (!actor) redirect("/admin/login");
  const { saved, error } = await searchParams;

  let photoUrl = "";
  let hasNamedAccount = actor.id !== "env";
  try {
    const db = getDb();
    if (actor.id === "env") {
      const row = await db.admin.findUnique({ where: { email: actor.email.toLowerCase() } });
      photoUrl = row?.photoUrl || "";
      hasNamedAccount = Boolean(row);
    } else {
      const row = await db.admin.findUnique({ where: { id: actor.id } });
      photoUrl = row?.photoUrl || "";
    }
  } catch {
    photoUrl = "";
  }

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Your account</p>
      <h1 className="mt-2 font-serif text-4xl text-ink">Profile photo</h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        This photo appears when you reply to recipe comments as {actor.name} ({accessLabel(actor.role)}).
      </p>

      {saved ? (
        <p className="mt-5 border border-olive/30 bg-olive/10 px-4 py-3 text-sm text-olive-dark">
          Profile photo saved.
        </p>
      ) : null}
      {error === "named" ? (
        <p className="mt-5 border border-terracotta/30 bg-terracotta/10 px-4 py-3 text-sm text-terracotta-dark">
          Create a named owner account with this email on{" "}
          <Link href="/admin/staff" className="font-semibold underline">
            Admins
          </Link>{" "}
          first, then come back to upload a photo.
        </p>
      ) : null}

      <form action={saveOwnAdminProfileAction} className="mt-8 border border-line bg-paper p-5">
        <AdminPhotoField defaultValue={photoUrl} />
        {actor.id === "env" && !hasNamedAccount ? (
          <p className="mt-4 text-sm text-muted">
            You are signed in with the owner password. Add yourself as an Owner on the Admins page
            (same email as ADMIN_EMAIL) so your photo can be saved.
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-6 rounded-full bg-terracotta px-5 py-2.5 text-sm font-semibold text-paper hover:bg-terracotta-dark"
        >
          Save photo
        </button>
      </form>
    </div>
  );
}
