import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { MembersTable } from "@/components/admin/MembersTable";
import {
  AdminFlashStatus,
  MEMBER_REMOVED_PARAMS,
} from "@/lib/admin-transient-feedback";
import { canDeleteMembers } from "@/lib/admin-access";
import { requireAccess } from "@/lib/auth";
import { listUsersForAdmin } from "@/lib/accounts";

export const metadata: Metadata = {
  title: "Members",
};

export const dynamic = "force-dynamic";

function memberRemovedMessage(removed: string | undefined) {
  const count = Number.parseInt(String(removed || ""), 10);
  if (!Number.isFinite(count) || count < 1) return null;
  return count === 1 ? "1 member removed." : `${count} members removed.`;
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const admin = await requireAccess("members");
  const { removed } = await searchParams;
  const users = await listUsersForAdmin();
  const removedMessage = memberRemovedMessage(removed);
  const canDelete = canDeleteMembers(admin.role);

  return (
    <div>
      <AdminPageHeader
        title="Members"
        description="People with Mesa accounts."
        documentationTopicId="members"
      />
      {removedMessage ? (
        <AdminFlashStatus active clearParams={MEMBER_REMOVED_PARAMS}>
          {removedMessage}
        </AdminFlashStatus>
      ) : null}

      <MembersTable users={users} canDelete={canDelete} />
    </div>
  );
}
