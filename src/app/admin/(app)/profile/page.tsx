import Link from "next/link";
import { AdminProfilePhotoForm } from "@/components/admin/AdminPhotoField";
import {
  ADMIN_PROFILE_SYSTEM_OWNER_PHOTO_COPY,
  adminProfileAccountRows,
  adminProfilePhotoUsageCopy,
  buildAdminProfileAccountView,
} from "@/lib/admin-profile-ui";
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

  const isSystemOwner = actor.id === "env";
  let accountName = actor.name;
  let accountEmail = actor.email;
  let photoUrl = "";

  if (!isSystemOwner) {
    try {
      const row = await getDb().admin.findUnique({ where: { id: actor.id } });
      photoUrl = row?.photoUrl || "";
      accountName = row?.name?.trim() || actor.name;
      accountEmail = row?.email || actor.email;
    } catch {
      photoUrl = "";
    }
  }

  const account = buildAdminProfileAccountView({
    isSystemOwner,
    name: accountName,
    role: actor.role,
    email: accountEmail,
  });

  return (
    <div className="w-full">
      <header className="pb-2">
        <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
          Profile
        </h1>
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
          Create a named Team Access account with this email on{" "}
          <Link href="/admin/staff" className={`${adminLinkClass} ${adminFocusRing} underline`}>
            Team access
          </Link>{" "}
          first, then come back to upload a photo.
        </p>
      ) : null}
      {error === "upload" ? (
        <p
          role="alert"
          className="mt-4 border border-terracotta/30 bg-terracotta/10 px-4 py-2.5 text-sm text-terracotta-dark"
        >
          Could not save that photo. Choose a JPEG, PNG, WebP, or GIF up to 2 MB and try again.
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

      <section className="mt-6" aria-labelledby="profile-account-heading">
        <h2
          id="profile-account-heading"
          className="text-[0.6875rem] font-semibold uppercase tracking-[0.11em] text-olive"
        >
          Account
        </h2>
        <dl className="mt-3 space-y-2.5">
          {adminProfileAccountRows(account).map((row) => (
            <div
              key={row.label}
              className="sm:grid sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-4"
            >
              <dt className="text-[0.6875rem] font-semibold text-olive">{row.label}</dt>
              <dd className="mt-0.5 break-words text-sm text-ink sm:mt-0">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-8 border-t border-line/80" />

      <section className="mt-8" aria-labelledby="profile-photo-heading">
        <h2
          id="profile-photo-heading"
          className="text-[0.6875rem] font-semibold uppercase tracking-[0.11em] text-olive"
        >
          Profile photo
        </h2>

        {isSystemOwner ? (
          <div className="mt-3 max-w-xl space-y-3 text-sm leading-6 text-muted">
            <p>{ADMIN_PROFILE_SYSTEM_OWNER_PHOTO_COPY}</p>
            <p>
              <Link
                href="/admin/staff"
                className={`${adminLinkClass} ${adminFocusRing} underline-offset-4 hover:underline`}
              >
                Team access →
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <AdminProfilePhotoForm
              key={photoUrl || "empty"}
              defaultPhotoUrl={photoUrl}
              actorName={account.displayName}
              usageCopy={adminProfilePhotoUsageCopy(actor.role)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
