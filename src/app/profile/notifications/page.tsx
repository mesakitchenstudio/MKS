import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProfileNotificationsView } from "@/components/ProfileNotificationsView";
import { findActiveMemberByEmail } from "@/lib/accounts";
import { isMemberFollowsEnabled } from "@/lib/flags";
import { listMemberNotificationsForUser } from "@/lib/member-notifications-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  if (!isMemberFollowsEnabled()) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  return {
    title: "Notifications",
    robots: { index: false, follow: false },
  };
}

export default async function ProfileNotificationsPage() {
  if (!isMemberFollowsEnabled()) notFound();

  const session = await auth();
  const email = session?.user?.email;
  if (
    !email ||
    session?.error === "MemberDeleted" ||
    session?.error === "SessionRevoked"
  ) {
    redirect("/profile");
  }

  const member = await findActiveMemberByEmail(email);
  if (!member) redirect("/profile");

  let items: Awaited<ReturnType<typeof listMemberNotificationsForUser>> | null = null;
  let listFailed = false;
  try {
    items = await listMemberNotificationsForUser(member.id);
  } catch {
    listFailed = true;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-12">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-olive">Profile</p>
      <h1 className="mt-2 font-serif text-4xl text-ink md:text-5xl">Notifications</h1>
      <p className="mt-3 max-w-xl text-muted">
        New recipes from Collections and Topics you follow.
      </p>
      {listFailed || items == null ? (
        <p className="mt-10 max-w-xl text-lg text-ink/90" role="alert">
          Notifications are temporarily unavailable.
        </p>
      ) : (
        <ProfileNotificationsView initial={items} />
      )}
    </div>
  );
}
