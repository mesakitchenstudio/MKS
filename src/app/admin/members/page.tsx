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
      <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Members
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Registered members and their recent activity.
      </p>
      {removed ? (
        <p className="mt-4 text-sm text-olive" role="status">
          Member removed. You can add them on Admins.
        </p>
      ) : null}

      <MembersTable users={users} />
    </div>
  );
}
