import Link from "next/link";
import { AdminProfilePhotoForm } from "@/components/admin/AdminPhotoField";
import { accessLabel } from "@/lib/admin-access";
import { adminFocusRing, adminLinkClass } from "@/lib/admin-ui";
import { getAdminSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { AdminFlashStatus, PROFILE_SAVED_PARAMS } from "@/lib/admin-transient-feedback";
import { redirect } from "next/navigation";

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
    <div className="w-full">
      <header className="border-b border-line pb-4">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-olive">
          Your account
        </p>
        <h1 className="mt-1.5 font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
          Profile photo
        </h1>
        <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
          This photo appears when you reply to recipe comments as{" "}
          <span className="font-semibold text-ink">{actor.name}</span>
          <span className="text-muted"> · {accessLabel(actor.role)}</span>.
        </p>
        <p className="mt-1 max-w-lg text-sm leading-6 text-muted">
          Google sign-in can set it automatically. Upload a custom image anytime to replace it.
        </p>
      </header>

      {saved ? (
        <AdminFlashStatus
          active
          clearParams={PROFILE_SAVED_PARAMS}
          className="mt-4 border border-olive/30 bg-olive/10 px-4 py-2.5 text-sm text-olive-dark"
        >
          Photo saved.
        </AdminFlashStatus>
      ) : null}
      {error === "named" ? (
        <p
          role="alert"
          className="mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-2.5 text-sm text-terracotta-dark"
        >
          Create a named owner account with this email on{" "}
          <Link href="/admin/staff" className={`${adminLinkClass} ${adminFocusRing} underline`}>
            Admins
          </Link>{" "}
          first, then come back to upload a photo.
        </p>
      ) : null}
      {error === "upload" ? (
        <p
          role="alert"
          className="mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-2.5 text-sm text-terracotta-dark"
        >
          Could not save that photo. Choose a JPEG, PNG, WebP, or GIF under 2 MB and try again.
        </p>
      ) : null}
      {error === "storage" ? (
        <p
          role="alert"
          className="mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-2.5 text-sm text-terracotta-dark"
        >
          Photo storage is not configured on this deployment. Add a Vercel Blob store (
          <code className="text-xs">BLOB_READ_WRITE_TOKEN</code>) and redeploy.
        </p>
      ) : null}

      <div className="mt-5">
        <AdminProfilePhotoForm
          key={photoUrl || "empty"}
          defaultPhotoUrl={photoUrl}
          actorName={actor.name}
          canPersist={hasNamedAccount}
          namedAccountHint={actor.id === "env" && !hasNamedAccount}
        />
      </div>
    </div>
  );
}
