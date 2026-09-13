import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminDocumentationCenter } from "@/components/admin/AdminDocumentationCenter";
import {
  getAdminDocTopicById,
  listAdminDocTopicsForRole,
  canAccessAdminDocTopic,
} from "@/lib/admin-documentation";
import { adminWorkspaceWide } from "@/lib/admin-ui";
import { getAdminSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Documentation",
};

export default async function AdminDocumentationPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const query = await searchParams;
  const topics = listAdminDocTopicsForRole(admin.role);
  const requested = String(query.topic || "").trim();
  const initialTopicId =
    requested &&
    getAdminDocTopicById(requested) &&
    canAccessAdminDocTopic(admin.role, requested)
      ? requested
      : null;

  return (
    <div className={`min-w-0 ${adminWorkspaceWide}`}>
      <header className="mb-8 md:mb-9">
        <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
          Documentation
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Learn how Mesa Admin works, understand workflows, and find guidance for publishing,
          analytics, community, and team operations.
        </p>
      </header>
      <AdminDocumentationCenter topics={topics} initialTopicId={initialTopicId} />
    </div>
  );
}
