import { MembersTable } from "@/components/admin/MembersTable";
import { requireAccess } from "@/lib/auth";
import { listUsersForAdmin } from "@/lib/accounts";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  await requireAccess("members");
  const { removed } = await searchParams;
  const users = await listUsersForAdmin();

  return (
    <div>
      <h1 className="font-serif text-4xl">Members</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        One row per email, with online status, last seen, and how they connected. Members browsing
        the site send a heartbeat every 45 seconds while signed in.
      </p>
      {removed ? (
        <p className="mt-4 text-sm text-olive">Member removed. You can add them on Admins.</p>
      ) : null}

      <MembersTable users={users} />
    </div>
  );
}
