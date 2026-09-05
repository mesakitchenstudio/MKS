import type { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import type { NewsletterSubscriberStatus } from "@/lib/newsletter-unsubscribe";

export const NEWSLETTER_ADMIN_PAGE_SIZE = 50;

export type NewsletterAdminStatusFilter = "active" | "unsubscribed" | "all";

export type NewsletterAdminSubscriberRow = {
  email: string;
  source: string;
  status: string;
  createdAt: Date;
  unsubscribedAt: Date | null;
};

export type NewsletterAdminCounts = {
  active: number;
  unsubscribed: number;
  total: number;
  newLast30Days: number;
};

export type NewsletterAdminListResult = {
  rows: NewsletterAdminSubscriberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  status: NewsletterAdminStatusFilter;
  q: string;
};

/** Safe Prisma select — never includes unsubscribeTokenHash or id. */
const newsletterAdminSelect = {
  email: true,
  source: true,
  status: true,
  createdAt: true,
  unsubscribedAt: true,
} satisfies Prisma.NewsletterSubscriberSelect;

export function parseNewsletterStatusFilter(
  value: string | undefined | null,
): NewsletterAdminStatusFilter {
  if (value === "unsubscribed" || value === "all") return value;
  return "active";
}

export function newsletterStatusLabel(status: string | null | undefined) {
  return status === "unsubscribed" ? "Unsubscribed" : "Active";
}

export function isNewsletterStatusActive(status: string | null | undefined) {
  return (status || "active") === "active";
}

export function emptyStateForNewsletterList(input: {
  status: NewsletterAdminStatusFilter;
  q: string;
  total: number;
}) {
  if (input.total > 0) return null;
  if (input.q.trim()) return "No subscribers match this search.";
  if (input.status === "active") return "No active subscribers yet.";
  if (input.status === "unsubscribed") return "No unsubscribed addresses.";
  return "No newsletter subscribers yet.";
}

function buildListWhere(
  status: NewsletterAdminStatusFilter,
  q: string,
): Prisma.NewsletterSubscriberWhereInput {
  const where: Prisma.NewsletterSubscriberWhereInput = {};
  if (status === "active") where.status = "active";
  else if (status === "unsubscribed") where.status = "unsubscribed";

  const emailQ = q.trim().toLowerCase();
  if (emailQ) {
    // Emails are stored normalized lowercase; lowercase the query for case-insensitive partial match.
    where.email = { contains: emailQ };
  }
  return where;
}

export async function getNewsletterSubscriberCounts(
  now = new Date(),
): Promise<NewsletterAdminCounts> {
  const db = getDb();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [active, unsubscribed, total, newLast30Days] = await Promise.all([
    db.newsletterSubscriber.count({ where: { status: "active" } }),
    db.newsletterSubscriber.count({ where: { status: "unsubscribed" } }),
    db.newsletterSubscriber.count(),
    db.newsletterSubscriber.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  return { active, unsubscribed, total, newLast30Days };
}

export async function listNewsletterSubscribersForAdmin(input?: {
  status?: NewsletterAdminStatusFilter;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<NewsletterAdminListResult> {
  const status = input?.status ?? "active";
  const q = String(input?.q ?? "").trim();
  const pageSize = Math.min(
    Math.max(input?.pageSize ?? NEWSLETTER_ADMIN_PAGE_SIZE, 1),
    100,
  );
  const requestedPage = Math.max(1, Math.floor(input?.page ?? 1) || 1);
  const where = buildListWhere(status, q);
  const db = getDb();

  const total = await db.newsletterSubscriber.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const rows =
    total === 0
      ? []
      : await db.newsletterSubscriber.findMany({
          where,
          select: newsletterAdminSelect,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
    status,
    q,
  };
}

export type { NewsletterSubscriberStatus };
