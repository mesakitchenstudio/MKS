import { MembersTable } from "@/components/admin/MembersTable";
import {
  AdminFlashStatus,
  MEMBER_REMOVED_PARAMS,
} from "@/lib/admin-transient-feedback";
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
      <AdminFlashStatus active={Boolean(removed)} clearParams={MEMBER_REMOVED_PARAMS}>
        Member removed. You can add them again from Team access.
      </AdminFlashStatus>

      <MembersTable users={users} />
    </div>
  );
}
