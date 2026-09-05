import type { Metadata } from "next";
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
      <h1 className="font-serif text-[2.125rem] leading-tight text-ink md:text-[2.375rem]">
        Newsletter
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Subscribers collected from Mesa newsletter signup forms.
      </p>

      <NewsletterSubscribersIndex list={list} counts={counts} />
    </div>
  );
}
