/**
 * Phase 12B — Batched newsletter interest-profile loader (server).
 *
 * Soft-links NewsletterSubscriber emails → User by normalized email.
 * Reads UserSeriesFollow / UserCategoryFollow only — never writes consent,
 * follows, or subscribers. Follows are content interest, not newsletter consent.
 *
 * Trusted server helper (same pattern as member-follows-server). Do not import
 * from Client Components.
 */

import { getDb } from "@/lib/db";
import { validateNewsletterEmail } from "@/lib/newsletter";
import {
  canonicalizeNewsletterIdList,
  emptyNewsletterInterestProfile,
  normalizeNewsletterInterestProfile,
  type NewsletterInterestProfile,
} from "@/lib/newsletter-personalization";

/**
 * Internal batch bound for interest-profile loads.
 * Aligns with other server batch caps (e.g. guest retention 500).
 * Not a public API — callers must page larger audiences.
 */
export const NEWSLETTER_INTEREST_PROFILE_BATCH_MAX = 500;

export type LoadNewsletterInterestProfilesResult = {
  /** Profiles keyed by normalized email (only emails that passed validation). */
  profiles: Map<string, NewsletterInterestProfile>;
  /** Normalized emails accepted into this batch (deduped, order of first appearance). */
  emails: string[];
  /** True when input was truncated to NEWSLETTER_INTEREST_PROFILE_BATCH_MAX. */
  truncated: boolean;
};

function normalizeInputEmails(rawEmails: Iterable<string>): {
  emails: string[];
  truncated: boolean;
} {
  const emails: string[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const raw of rawEmails) {
    const validated = validateNewsletterEmail(String(raw ?? ""));
    if (!validated.ok) continue;
    if (seen.has(validated.email)) continue;
    if (emails.length >= NEWSLETTER_INTEREST_PROFILE_BATCH_MAX) {
      truncated = true;
      break;
    }
    seen.add(validated.email);
    emails.push(validated.email);
  }

  return { emails, truncated };
}

/**
 * Batch-load interest profiles for normalized subscriber emails.
 *
 * Query shape (≤3 DB queries per batch, no N+1):
 * 1. User `where email IN (…)`
 * 2. UserSeriesFollow `where userId IN (…)`
 * 3. UserCategoryFollow `where userId IN (…)`
 *
 * READ ONLY — never updates NewsletterSubscriber, User, or follows.
 */
export async function loadNewsletterInterestProfilesForEmails(
  rawEmails: Iterable<string>,
): Promise<LoadNewsletterInterestProfilesResult> {
  const { emails, truncated } = normalizeInputEmails(rawEmails);
  const profiles = new Map<string, NewsletterInterestProfile>();

  for (const email of emails) {
    profiles.set(email, emptyNewsletterInterestProfile(null));
  }

  if (emails.length === 0) {
    return { profiles, emails, truncated };
  }

  const db = getDb();
  const users = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });

  const userIdByEmail = new Map<string, string>();
  const userIds: string[] = [];
  for (const user of users) {
    const email = String(user.email ?? "").trim().toLowerCase();
    if (!email || !profiles.has(email)) continue;
    userIdByEmail.set(email, user.id);
    userIds.push(user.id);
    profiles.set(email, emptyNewsletterInterestProfile(user.id));
  }

  if (userIds.length === 0) {
    return { profiles, emails, truncated };
  }

  const uniqueUserIds = [...new Set(userIds)].sort((a, b) => a.localeCompare(b, "en"));

  const [seriesFollows, categoryFollows] = await Promise.all([
    db.userSeriesFollow.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { userId: true, seriesId: true },
    }),
    db.userCategoryFollow.findMany({
      where: { userId: { in: uniqueUserIds } },
      select: { userId: true, categoryId: true },
    }),
  ]);

  const seriesByUser = new Map<string, string[]>();
  for (const row of seriesFollows) {
    const list = seriesByUser.get(row.userId) ?? [];
    list.push(row.seriesId);
    seriesByUser.set(row.userId, list);
  }

  const categoriesByUser = new Map<string, string[]>();
  for (const row of categoryFollows) {
    const list = categoriesByUser.get(row.userId) ?? [];
    list.push(row.categoryId);
    categoriesByUser.set(row.userId, list);
  }

  for (const [email, userId] of userIdByEmail) {
    profiles.set(
      email,
      normalizeNewsletterInterestProfile({
        userId,
        followedSeriesIds: canonicalizeNewsletterIdList(seriesByUser.get(userId) ?? []),
        followedCategoryIds: canonicalizeNewsletterIdList(
          categoriesByUser.get(userId) ?? [],
        ),
      }),
    );
  }

  return { profiles, emails, truncated };
}
