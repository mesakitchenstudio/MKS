import type { Metadata } from "next";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { NewsletterSubscribersIndex } from "@/components/admin/NewsletterSubscribersIndex";
import { requireAccess } from "@/lib/auth";
import {
  getNewsletterSubscriberCounts,
  listNewsletterSubscribersForAdmin,
  parseNewsletterStatusFilter,
} from "@/lib/newsletter-admin";

export const metadata: Metadata = {
  title: "Newsletter",
};

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminNewsletterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess("members");
  const raw = await searchParams;
  const status = parseNewsletterStatusFilter(firstParam(raw.status));
  const q = String(firstParam(raw.q) ?? "").trim();
  const page = Math.max(1, Number(firstParam(raw.page) || 1) || 1);

  const [counts, list] = await Promise.all([
    getNewsletterSubscriberCounts(),
    listNewsletterSubscribersForAdmin({ status, q, page }),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Newsletter"
        description="Subscribers collected from Mesa newsletter signup forms."
        documentationTopicId="newsletter"
      />

      <NewsletterSubscribersIndex list={list} counts={counts} />
    </div>
  );
}
